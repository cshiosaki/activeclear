import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

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
  if (mime.startsWith('image/')) return { type: 'input_image', image_url: dataUrl };
  return { type: 'input_file', filename, file_data: dataUrl };
}

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI extraction is not configured.' }, { status: 503 });
  }

  const { documentPath } = await req.json().catch(() => ({}));
  if (!documentPath) {
    return NextResponse.json({ error: 'documentPath is required' }, { status: 400 });
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

  if (!documentPath.startsWith(auth.user.id + '/')) {
    return NextResponse.json({ error: 'Invalid document path' }, { status: 403 });
  }

  const [{ data: profile }, { data: types, error: typesError }, { data: fileBlob, error: fileError }] = await Promise.all([
    supabase.from('profiles').select('first_name,last_name').eq('user_id', auth.user.id).maybeSingle(),
    supabase.from('credential_types').select('id,name,issuing_body,default_validity_months').order('name'),
    supabase.storage.from('credential-documents').download(documentPath),
  ]);

  if (typesError || !types?.length) {
    return NextResponse.json({ error: typesError?.message || 'Credential types are not configured' }, { status: 400 });
  }

  if (fileError || !fileBlob) {
    return NextResponse.json({ error: fileError?.message || 'Could not read uploaded document' }, { status: 400 });
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const mime = fileBlob.type || 'application/pdf';
  const filename = documentPath.split('/').pop() || 'credential.pdf';
  const fileData = `data:${mime};base64,${buffer.toString('base64')}`;
  const profileName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');

  const catalog = types.map((t: any) => ({
    id: t.id,
    name: t.name,
    expected_issuer: t.issuing_body || null,
  }));

  const prompt = [
    'Extract the credential data from this document for ActiveClear.',
    'Choose exactly one credential type from the supplied ActiveClear credential catalog.',
    'Use only information visible in the document. Do not invent certificate numbers or dates.',
    'If the document contains a membership number, certificate number, license number, or credential ID, put it in credential_number.',
    'Use YYYY-MM-DD for dates. If no issue or expiration date is visible, return null for that field.',
    'For the issuer, use the organization visibly issuing the credential.',
    'The profile name is provided only to help identify the credential holder.',
    'For background checks, do not extract SSNs, DOBs, addresses, criminal-history details, or search-result details.',
    '',
    `Profile name: ${profileName || 'Not provided'}`,
    'Credential catalog:',
    JSON.stringify(catalog),
  ].join('\n');

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['credential_type_id','issuing_body','credential_number','issued_date','expires_date','confidence'],
    properties: {
      credential_type_id: { type: 'string', enum: types.map((t: any) => t.id) },
      issuing_body: { type: ['string','null'] },
      credential_number: { type: ['string','null'] },
      issued_date: { type: ['string','null'] },
      expires_date: { type: ['string','null'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
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
          name: 'activeclear_credential_extraction',
          strict: true,
          schema
        }
      }
    }),
  });

  const aiPayload = await ai.json();
  if (!ai.ok) {
    return NextResponse.json({ error: aiPayload?.error?.message || 'AI extraction failed' }, { status: ai.status || 500 });
  }

  let extracted: any;
  try {
    extracted = JSON.parse(responseText(aiPayload));
  } catch {
    return NextResponse.json({ error: 'AI returned unreadable credential data.' }, { status: 502 });
  }

  const selectedType = types.find((t: any) => t.id === extracted.credential_type_id);
  if (!selectedType) {
    return NextResponse.json({ error: 'Credential type could not be identified.' }, { status: 422 });
  }

  const row = {
    user_id: auth.user.id,
    credential_type_id: selectedType.id,
    issuing_body: extracted.issuing_body || selectedType.issuing_body || null,
    credential_number: extracted.credential_number || null,
    issued_date: cleanDate(extracted.issued_date),
    expires_date: cleanDate(extracted.expires_date),
    document_path: documentPath,
    status: 'pending',
    verified_at: null,
    verified_by: null,
    reviewer_notes: null,
    attested_authentic: true,
    attested_at: new Date().toISOString(),
  };

  const { data: credential, error: insertError } = await supabase
    .from('credentials')
    .insert(row)
    .select('id,credential_type_id,issuing_body,credential_number,issued_date,expires_date,credential_types(name)')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({
    credential,
    extracted: {
      ...extracted,
      credential_type_name: selectedType.name,
    }
  });
}
