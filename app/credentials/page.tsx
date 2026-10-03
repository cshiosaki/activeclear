'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

const blankForm = {
  credential_type_id: '',
  issuing_body: '',
  credential_number: '',
  issued_date: '',
  expires_date: '',
  file: null as File | null,
  attested: false,
};

export default function Credentials() {
  const router = useRouter();
  const [uid, setUid] = useState('');
  const [types, setTypes] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<any>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [existingDocumentPath, setExistingDocumentPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [overrideRequests, setOverrideRequests] = useState<any[]>([]);

  async function load() {
    const [{ data: t }, { data: c }, { data: r }, { data: ovr }] = await Promise.all([
      supabase.from('credential_types').select('*').order('name'),
      supabase
        .from('credentials')
        .select('*,credential_types(name,renewal_url)')
        .order('created_at', { ascending: false }),
      supabase
        .from('credential_verifications')
        .select('credential_id,result,reasons,reviewed_at,extracted_name,extracted_issuer,extracted_credential_number,extracted_issue_date,extracted_expiration_date')
        .order('reviewed_at', { ascending: false }),
      supabase
        .from('credential_override_requests')
        .select('id,credential_id,requirement_id,organization_id,status,request_reason,requested_at')
        .order('requested_at', { ascending: false }),
    ]);

    setTypes(t || []);
    setItems(c || []);
    setReviews(r || []);
    setOverrideRequests(ovr || []);

    if (!form.credential_type_id && t?.[0]) {
      setForm((current: any) => ({ ...current, credential_type_id: t[0].id }));
    }
  }

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      setUid(user.id);
      await load();
    })();
  }, [router]);

  function resetForm() {
    setEditingId(null);
    setExistingDocumentPath(null);
    setMsg('');
    setForm({
      ...blankForm,
      credential_type_id: types[0]?.id || '',
    });
  }

  function startEdit(item: any) {
    setEditingId(item.id);
    setExistingDocumentPath(item.document_path || null);
    setMsg('');
    setForm({
      credential_type_id: item.credential_type_id,
      issuing_body: item.issuing_body || '',
      credential_number: item.credential_number || '',
      issued_date: item.issued_date || '',
      expires_date: item.expires_date || '',
      file: null,
      attested: !!item.attested_authentic,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveCredential(e: FormEvent) {
    e.preventDefault();

    if (!form.attested) {
      setMsg('You must certify that this credential information and document are authentic and unaltered.');
      return;
    }

    setBusy(true);
    setMsg('');

    let documentPath = existingDocumentPath;

    if (form.file) {
      const safe = form.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const newPath = `${uid}/${crypto.randomUUID()}-${safe}`;
      const { error: uploadError } = await supabase.storage
        .from('credential-documents')
        .upload(newPath, form.file);

      if (uploadError) {
        setMsg(uploadError.message);
        setBusy(false);
        return;
      }

      documentPath = newPath;
    }

    const type = types.find((t) => t.id === form.credential_type_id);
    const payload = {
      user_id: uid,
      credential_type_id: form.credential_type_id,
      issuing_body: form.issuing_body || type?.issuing_body || null,
      credential_number: form.credential_number || null,
      issued_date: form.issued_date || null,
      expires_date: form.expires_date || null,
      document_path: documentPath,
      status: 'pending',
      verified_at: null,
      verified_by: null,
      reviewer_notes: null,
      attested_authentic: true,
      attested_at: new Date().toISOString(),
    };

    let error: any = null;
    let savedCredentialId: string | null = editingId;

    if (editingId) {
      const result = await supabase.from('credentials').update(payload).eq('id', editingId).select('id').single();
      error = result.error;
      savedCredentialId = result.data?.id || editingId;

      if (!error && form.file && existingDocumentPath && existingDocumentPath !== documentPath) {
        await supabase.storage.from('credential-documents').remove([existingDocumentPath]);
      }
    } else {
      const result = await supabase.from('credentials').insert(payload).select('id').single();
      error = result.error;
      savedCredentialId = result.data?.id || null;
    }

    if (error) {
      if (form.file && documentPath && documentPath !== existingDocumentPath) {
        await supabase.storage.from('credential-documents').remove([documentPath]);
      }
      setMsg(error.message);
      setBusy(false);
      return;
    }

    setMsg(editingId ? 'Credential updated.' : 'Credential submitted.');
    setEditingId(null);
    setExistingDocumentPath(null);
    setForm({
      ...blankForm,
      credential_type_id: types[0]?.id || '',
    });
    await load();
    setBusy(false);

    if (savedCredentialId && documentPath) {
      await runAIReview(savedCredentialId);
    }
  }

  async function runAIReview(credentialId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    await fetch('/api/ai-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ credentialId }),
    }).catch(() => null);
  }

  async function requestExemption(item:any, review:any){
    const existing=overrideRequests.find((x:any)=>
      x.credential_id===item.id &&
      x.requirement_id===review?.requirement_id &&
      x.organization_id===review?.organization_id &&
      x.status==='pending'
    );
    if(existing){
      setMsg('Exemption request already submitted.');
      return;
    }

    const reason=window.prompt('Explain why you are requesting an exemption.');
    if(reason===null) return;

    const {error}=await supabase.from('credential_override_requests').insert({
      credential_id:item.id,
      user_id:uid,
      organization_id:review?.organization_id || null,
      requirement_id:review?.requirement_id || null,
      request_reason:reason.trim() || null,
      status:'pending'
    });

    if(error){
      setMsg(error.message);
      return;
    }

    setMsg('Exemption request submitted.');
    await load();
  }

  async function deleteCredential(item: any) {
    const ok = window.confirm(
      `Delete ${item.credential_types?.name || 'this credential'}? This cannot be undone.`
    );
    if (!ok) return;

    setBusy(true);
    setMsg('');

    const { error } = await supabase.from('credentials').delete().eq('id', item.id);

    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }

    if (item.document_path) {
      await supabase.storage.from('credential-documents').remove([item.document_path]);
    }

    if (editingId === item.id) resetForm();

    setMsg('Credential deleted.');
    await load();
    setBusy(false);
  }

  return (
    <AppShell>
      <div className="eyebrow">Credential wallet</div>
      <h1>Certifications & credentials</h1>

      <div className="grid two">
        <section className="card">
          <h2>Your credentials</h2>

          <div className="list">
            {items.length === 0 ? (
              <p className="muted">No credentials uploaded yet.</p>
            ) : (
              items.map((item) => (
                <div className="item" key={item.id} style={{alignItems:'flex-start'}}>
                  <div>
                    <strong>{item.credential_types?.name}</strong>
                    <div className="muted">
                      {item.expires_date ? `Expires ${item.expires_date}` : 'No expiration'} · {item.status}
                    </div>
                    {item.issuing_body && <div className="muted">{item.issuing_body}</div>}
                  </div>

                  <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                    {(() => {
                      const verification = reviews.find((r:any)=>r.credential_id===item.id);
                      const isFail = verification && ['does_not_meet','wrong_credential_type','unreadable','expired'].includes(verification.result);
                      const label = !item.document_path
                        ? 'Supporting Document Required'
                        : verification?.result==='verified'
                          ? 'Verified'
                          : verification?.result==='expired'
                            ? 'Expired'
                            : isFail
                              ? 'Does Not Meet'
                              : 'Pending';
                      const cls = label==='Verified' ? 'green' : label==='Pending' ? 'amber' : 'red';

                      return <>
                        <span className={'status ' + cls}>{label}</span>
                        {verification?.reasons?.length>0 && label!=='Verified' && (
                          <div className="muted" style={{maxWidth:300,textAlign:'right',fontSize:13,lineHeight:1.35}}>
                            {verification.reasons[0]}
                          </div>
                        )}
                        {isFail && (
                          <div className="muted" style={{maxWidth:300,textAlign:'right',fontSize:12,lineHeight:1.35}}>
                            This is the ActiveClear master result. An organization can only accept it through a Special Approval exception.
                          </div>
                        )}
                      </>;
                    })()}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn secondary" type="button" onClick={() => startEdit(item)}>
                        Edit
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => deleteCredential(item)}
                        style={{ background: '#fde7e7', color: '#9a2626' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card">
          <h2>{editingId ? 'Edit credential' : 'Add credential'}</h2>

          {editingId && (
            <div className="notice" style={{ marginBottom: 16 }}>
              You are editing an existing credential. Saving changes will return its verification status to pending.
            </div>
          )}

          <form className="form" onSubmit={saveCredential}>
            <div className="field">
              <label>Credential type</label>
              <select
                value={form.credential_type_id}
                onChange={(e) => setForm({ ...form, credential_type_id: e.target.value })}
              >
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Issuing organization</label>
              <input
                value={form.issuing_body}
                onChange={(e) => setForm({ ...form, issuing_body: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Certificate / ID number</label>
              <input
                value={form.credential_number}
                onChange={(e) => setForm({ ...form, credential_number: e.target.value })}
              />
            </div>

            <div className="row">
              <div className="field">
                <label>Issued date</label>
                <input
                  type="date"
                  value={form.issued_date}
                  onChange={(e) => setForm({ ...form, issued_date: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Expiration date</label>
                <input
                  type="date"
                  value={form.expires_date}
                  onChange={(e) => setForm({ ...form, expires_date: e.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label>{editingId ? 'Replace certificate file (optional)' : 'Certificate file'}</label>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
              />
              {editingId && existingDocumentPath && (
                <small className="muted">Existing document will be kept unless you upload a replacement.</small>
              )}
            </div>

            <label>
              <input
                type="checkbox"
                checked={form.attested}
                onChange={(e) => setForm({ ...form, attested: e.target.checked })}
              />{' '}
              I certify this credential information and document are authentic and unaltered.
            </label>

            {msg && <div className="notice">{msg}</div>}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn green" disabled={busy}>
                {busy ? 'Saving…' : editingId ? 'Save changes' : 'Upload credential'}
              </button>

              {editingId && (
                <button className="btn secondary" type="button" onClick={resetForm}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
