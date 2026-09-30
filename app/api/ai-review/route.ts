import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type ReviewResult = {
  requirement_id: string;
  result: 'meets_requirement' | 'needs_human_review' | 'does_not_meet_requirement' | 'unreadable' | 'wrong_credential_type';
  confidence: number;
  extracted_name?: string | null;
  extracted_issuer?: string | null;
  extracted_credential_type?: string | null;
  extracted_credential_number?: string | null;
  extracted_issue_date?: string | null;
  extracted_expiration_date?: string | null;
  reasons: string[];
  extracted_data?: Record<string, unknown>;
};

function cleanDate(value: unknown) {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function responseText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') return content.text;
    }
  }
  return '';
}

function openAIFilePart(mime:string, filename:string, dataUrl:string) {
  if (mime.startsWith('image/')) {
    return {
      type: 'input_image',
      image_url: dataUrl,
    };
  }

  return {
    type: 'input_file',
    filename,
    file_data: dataUrl,
  };
}

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'AI review is not configured yet. Add OPENAI_API_KEY to Vercel.' },
      { status: 503 }
    );
  }

  const { credentialId } = await req.json().catch(() => ({}));
  if (!credentialId) {
    return NextResponse.json({ error: 'credentialId is required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { headers: { Authorization: authorization } } }
  );

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: credential, error: credentialError } = await supabase
    .from('credentials')
    .select('id,user_id,credential_type_id,issuing_body,credential_number,issued_date,expires_date,document_path,credential_types(name)')
    .eq('id', credentialId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (credentialError || !credential) {
    return NextResponse.json({ error: credentialError?.message || 'Credential not found' }, { status: 404 });
  }

  if (!credential.document_path) {
    return NextResponse.json({ error: 'Upload a document before running AI review.' }, { status: 400 });
  }

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('first_name,last_name').eq('user_id', auth.user.id).maybeSingle(),
    supabase.from('organization_memberships').select('organization_id').eq('user_id', auth.user.id).eq('status', 'active'),
  ]);

  const orgIds = (memberships || []).map((m: any) => m.organization_id);
  if (!orgIds.length) {
    return NextResponse.json({ reviews: [], message: 'No connected organizations to review this credential against.' });
  }

  const { data: requirements, error: reqError } = await supabase
    .from('organization_requirements')
    .select('id,organization_id,name,description,season,must_be_valid_through_season,validation_rules,official_url,accepted_issuer,ai_review_notes,sample_document_path,requirement_credential_types!inner(credential_type_id),organizations(name)')
    .in('organization_id', orgIds)
    .eq('active', true)
    .eq('requirement_credential_types.credential_type_id', credential.credential_type_id);

  if (reqError) {
    return NextResponse.json({ error: reqError.message }, { status: 400 });
  }

  if (!requirements?.length) {
    return NextResponse.json({ reviews: [], message: 'No connected organization requirement maps to this credential type.' });
  }

  const { data: fileBlob, error: fileError } = await supabase.storage
    .from('credential-documents')
    .download(credential.document_path);

  if (fileError || !fileBlob) {
    return NextResponse.json({ error: fileError?.message || 'Could not read credential document' }, { status: 400 });
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const mime = fileBlob.type || 'application/pdf';
  const filename = credential.document_path.split('/').pop() || 'credential.pdf';
  const fileData = `data:${mime};base64,${buffer.toString('base64')}`;

  const credentialType:any = credential.credential_types;
  const profileName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');

  const requirementSummary = requirements.map((r: any) => ({
    requirement_id: r.id,
    organization_id: r.organization_id,
    organization_name: Array.isArray(r.organizations) ? r.organizations[0]?.name : r.organizations?.name,
    name: r.name,
    description: r.description,
    season: r.season,
    must_be_valid_through_season: r.must_be_valid_through_season,
    validation_rules: r.validation_rules || {},
    official_url: r.official_url || null,
    accepted_issuer: r.accepted_issuer || null,
    ai_review_notes: r.ai_review_notes || null,
    has_sample_certificate: !!r.sample_document_path,
  }));

  const prompt = [
    'You are reviewing a sports credential document for ActiveClear.',
    'Evaluate only what is visible or reliably extractable from the submitted document. Do not invent missing information.',
    'The account holder attested that the document is authentic, but your job is to flag inconsistencies, missing information, wrong document types, unreadable content, expiration, and requirement mismatches.',
    'If the evidence is ambiguous or important information cannot be verified, use needs_human_review rather than guessing.',
    '',
    `Profile name: ${profileName || 'Not provided'}`,
    `Selected credential type: ${credentialType?.name || 'Unknown'}`,
    `User-entered issuer: ${credential.issuing_body || 'Not provided'}`,
    `User-entered credential number: ${credential.credential_number || 'Not provided'}`,
    `User-entered issue date: ${credential.issued_date || 'Not provided'}`,
    `User-entered expiration date: ${credential.expires_date || 'Not provided'}`,
    '',
    'Organization requirements to evaluate:',
    JSON.stringify(requirementSummary),
    '',
    'For each requirement, return a result. Compare the person name, issuer, credential type, credential number, dates, and any explicit requirement rules. A document can be current but still fail because it is the wrong issuer/type or lacks required evidence.',
  ].join('\n');

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['reviews'],
    properties: {
      reviews: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'requirement_id','result','confidence','extracted_name','extracted_issuer',
            'extracted_credential_type','extracted_credential_number','extracted_issue_date',
            'extracted_expiration_date','reasons','extracted_data'
          ],
          properties: {
            requirement_id: { type: 'string' },
            result: {
              type: 'string',
              enum: ['meets_requirement','needs_human_review','does_not_meet_requirement','unreadable','wrong_credential_type']
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            extracted_name: { type: ['string','null'] },
            extracted_issuer: { type: ['string','null'] },
            extracted_credential_type: { type: ['string','null'] },
            extracted_credential_number: { type: ['string','null'] },
            extracted_issue_date: { type: ['string','null'] },
            extracted_expiration_date: { type: ['string','null'] },
            reasons: { type: 'array', items: { type: 'string' } },
            extracted_data: { type: 'object', additionalProperties: true }
          }
        }
      }
    }
  };

  const sampleContent:any[] = [];
  for (const requirement of requirements as any[]) {
    if (!requirement.sample_document_path) continue;
    const { data: sampleBlob } = await supabase.storage
      .from('requirement-samples')
      .download(requirement.sample_document_path);
    if (!sampleBlob) continue;

    const sampleBuffer = Buffer.from(await sampleBlob.arrayBuffer());
    const sampleMime = sampleBlob.type || 'application/pdf';
    const sampleName = requirement.sample_document_path.split('/').pop() || 'sample.pdf';
    sampleContent.push({
      type: 'input_text',
      text: `Reference sample for requirement "${requirement.name}". Use this only as an example of an acceptable credential, not as the sole source of truth.`
    });
    sampleContent.push(
      openAIFilePart(
        sampleMime,
        sampleName,
        `data:${sampleMime};base64,${sampleBuffer.toString('base64')}`
      )
    );
  }

  const ai = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.6-terra',
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          openAIFilePart(mime, filename, fileData),
          ...sampleContent
        ]
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'credential_requirement_review',
          strict: true,
          schema
        }
      }
    }),
  });

  const aiPayload = await ai.json();
  if (!ai.ok) {
    return NextResponse.json(
      { error: aiPayload?.error?.message || 'AI review failed' },
      { status: ai.status || 500 }
    );
  }

  let parsed: { reviews: ReviewResult[] };
  try {
    parsed = JSON.parse(responseText(aiPayload));
  } catch {
    return NextResponse.json({ error: 'AI returned an unreadable review result.' }, { status: 502 });
  }

  const validRequirementIds = new Set(requirements.map((r: any) => r.id));
  const saved:any[] = [];

  for (const review of parsed.reviews || []) {
    if (!validRequirementIds.has(review.requirement_id)) continue;
    const requirement:any = requirements.find((r: any) => r.id === review.requirement_id);
    const row = {
      credential_id: credential.id,
      requirement_id: review.requirement_id,
      user_id: auth.user.id,
      organization_id: requirement.organization_id,
      result: review.result,
      confidence: Math.max(0, Math.min(1, Number(review.confidence) || 0)),
      extracted_name: review.extracted_name || null,
      extracted_issuer: review.extracted_issuer || null,
      extracted_credential_type: review.extracted_credential_type || null,
      extracted_credential_number: review.extracted_credential_number || null,
      extracted_issue_date: cleanDate(review.extracted_issue_date),
      extracted_expiration_date: cleanDate(review.extracted_expiration_date),
      reasons: review.reasons || [],
      extracted_data: review.extracted_data || {},
      model: 'gpt-5.6-terra',
      reviewed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('credential_requirement_reviews')
      .upsert(row, { onConflict: 'credential_id,requirement_id' })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    saved.push(data);
  }

  return NextResponse.json({ reviews: saved });
}
