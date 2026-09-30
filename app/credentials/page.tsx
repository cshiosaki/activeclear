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
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function load() {
    const [{ data: t }, { data: c }, { data: r }] = await Promise.all([
      supabase.from('credential_types').select('*').order('name'),
      supabase
        .from('credentials')
        .select('*,credential_types(name,renewal_url)')
        .order('created_at', { ascending: false }),
      supabase
        .from('credential_requirement_reviews')
        .select('*,organization_requirements(name),organizations(name)')
        .order('reviewed_at', { ascending: false }),
    ]);

    setTypes(t || []);
    setItems(c || []);
    setReviews(r || []);

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
    setReviewingId(credentialId);
    setMsg('');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMsg('Please sign in again before running AI review.');
      setReviewingId(null);
      return;
    }

    const res = await fetch('/api/ai-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ credentialId }),
    });

    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? (body.message || 'AI review complete.') : (body.error || 'AI review failed.'));
    await load();
    setReviewingId(null);
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
                      const itemReviews = reviews.filter((r:any) => r.credential_id === item.id);
                      if (!itemReviews.length) return item.document_path ? <span className="status amber">Needs Review</span> : null;

                      const priority = [
                        'wrong_credential_type',
                        'unreadable',
                        'does_not_meet_requirement',
                        'needs_human_review',
                        'meets_requirement'
                      ];
                      const top = [...itemReviews].sort(
                        (a:any,b:any) => priority.indexOf(a.result) - priority.indexOf(b.result)
                      )[0];

                      const labels:any = {
                        meets_requirement: 'Meets Requirement',
                        needs_human_review: 'Needs Review',
                        does_not_meet_requirement: 'Does Not Meet',
                        unreadable: 'Unreadable',
                        wrong_credential_type: 'Wrong Credential'
                      };
                      const cls = top.result === 'meets_requirement' ? 'green' : top.result === 'needs_human_review' ? 'amber' : 'red';

                      return <span className={'status ' + cls}>{labels[top.result] || 'Needs Review'}</span>;
                    })()}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {item.document_path && (
                        <button
                          className="btn secondary"
                          type="button"
                          disabled={reviewingId === item.id}
                          onClick={() => runAIReview(item.id)}
                        >
                          {reviewingId === item.id ? 'Reviewing…' : 'Review'}
                        </button>
                      )}
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
