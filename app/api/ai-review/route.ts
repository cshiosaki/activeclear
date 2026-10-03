import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type GlobalReview = {
  result: 'verified' | 'needs_human_review' | 'does_not_meet' | 'unreadable' | 'wrong_credential_type' | 'expired';
  confidence: number;
  extracted_name?: string | null;
  extracted_issuer?: string | null;
  extracted_credential_type?: string | null;
  extracted_credential_number?: string | null;
  extracted_issue_date?: string | null;
  extracted_expiration_date?: string | null;
  reasons: string[];
};

function cleanDate(value: unknown) {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function responseText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === 'output_text' && typeof part?.text === 'string') return part.text;
    }
  }
  return '';
}

function openAIFilePart(mime: string, filename: string, dataUrl: string) {
  if (mime.startsWith('image/')) {
    return { type: 'input_image', image_url: dataUrl };
  }
  return { type: 'input_file', filename, file_data: dataUrl };
}

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI review is not configured.' }, { status: 503 });
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
    .select('id,user_id,credential_type_id,issuing_body,credential_number,issued_date,expires_date,document_path,credential_types(name,issuing_body)')
    .eq('id', credentialId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (credentialError || !credential) {
    return NextResponse.json({ error: credentialError?.message || 'Credential not found' }, { status: 404 });
  }

  if (!credential.document_path) {
    return NextResponse.json({ error: 'Upload a document before running AI review.' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name,last_name')
    .eq('user_id', auth.user.id)
    .maybeSingle();

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
  const credentialType: any = credential.credential_types;
  const profileName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');

  const prompt = [
    'You are performing the single authoritative ActiveClear review of a credential document.',
    'Review the credential itself only. Do not evaluate it against any organization-specific requirement, season, role, or policy.',
    'All organizations will rely on this one verification result as the source of truth.',
    'Evaluate only what is visible or reliably extractable from the submitted document. Do not invent missing information.',
    'Check whether the holder name matches the ActiveClear profile, whether the document matches the selected credential type, whether the issuer and credential number are consistent, and whether the visible dates support the claimed credential.',
    'If the document is clearly expired, return expired. If it is the wrong document type, return wrong_credential_type. If it cannot be read, return unreadable. If the document itself is invalid or clearly belongs to someone else, return does_not_meet. If important evidence is ambiguous, return needs_human_review. Otherwise return verified.',
    'For a background check, evaluate only provider, candidate name, completion/eligibility date, clear/eligible status, and valid-through/expiration if shown. Never extract or return SSNs, DOBs, addresses, phone numbers, criminal-history details, or search-result details.',
    '',
    `Profile name: ${profileName || 'Not provided'}`,
    `Selected credential type: ${credentialType?.name || 'Unknown'}`,
    `Expected issuer, if configured: ${credentialType?.issuing_body || 'Not configured'}`,
    `User-entered issuer: ${credential.issuing_body || 'Not provided'}`,
    `User-entered credential number: ${credential.credential_number || 'Not provided'}`,
    `User-entered issue date: ${credential.issued_date || 'Not provided'}`,
    `User-entered expiration date: ${credential.expires_date || 'Not provided'}`,
  ].join('\n');

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['review'],
    properties: {
      review: {
        type: 'object',
        additionalProperties: false,
        required: [
          'result','confidence','extracted_name','extracted_issuer','extracted_credential_type',
          'extracted_credential_number','extracted_issue_date','extracted_expiration_date','reasons'
        ],
        properties: {
          result: {
            type: 'string',
            enum: ['verified','needs_human_review','does_not_meet','unreadable','wrong_credential_type','expired']
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          extracted_name: { type: ['string','null'] },
          extracted_issuer: { type: ['string','null'] },
          extracted_credential_type: { type: ['string','null'] },
          extracted_credential_number: { type: ['string','null'] },
          extracted_issue_date: { type: ['string','null'] },
          extracted_expiration_date: { type: ['string','null'] },
          reasons: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  };

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
          openAIFilePart(mime, filename, fileData)
        ]
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'activeclear_credential_verification',
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

  let parsed: { review: GlobalReview };
  try {
    parsed = JSON.parse(responseText(aiPayload));
  } catch {
    return NextResponse.json({ error: 'AI returned an unreadable review result.' }, { status: 502 });
  }

  const review = parsed.review;
  const reviewedAt = new Date().toISOString();
  const row = {
    credential_id: credential.id,
    result: review.result,
    confidence: Math.max(0, Math.min(1, Number(review.confidence) || 0)),
    extracted_name: review.extracted_name || null,
    extracted_issuer: review.extracted_issuer || null,
    extracted_credential_type: review.extracted_credential_type || null,
    extracted_credential_number: review.extracted_credential_number || null,
    extracted_issue_date: cleanDate(review.extracted_issue_date),
    extracted_expiration_date: cleanDate(review.extracted_expiration_date),
    reasons: review.reasons || [],
    extracted_data: {},
    model: 'gpt-5.6-terra',
    reviewed_at: reviewedAt,
    reviewed_by: null,
    updated_at: reviewedAt,
  };

  const { data, error } = await supabase.rpc('save_my_credential_verification', {
    p_credential_id: credential.id,
    p_result: row.result,
    p_confidence: row.confidence,
    p_extracted_name: row.extracted_name,
    p_extracted_issuer: row.extracted_issuer,
    p_extracted_credential_type: row.extracted_credential_type,
    p_extracted_credential_number: row.extracted_credential_number,
    p_extracted_issue_date: row.extracted_issue_date,
    p_extracted_expiration_date: row.extracted_expiration_date,
    p_reasons: row.reasons,
    p_model: row.model,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ review: data });
}
