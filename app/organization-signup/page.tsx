'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function OrganizationSignup(){
  const router=useRouter();
  const [uid,setUid]=useState('');
  const [orgs,setOrgs]=useState<any[]>([]);
  const [selected,setSelected]=useState('');
  const [note,setNote]=useState('');
  const [requests,setRequests]=useState<any[]>([]);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  async function load(userId:string){
    const [{data:o},{data:r}] = await Promise.all([
      supabase.from('organizations').select('*').eq('is_active',true).order('name'),
      supabase.from('organization_claim_requests')
        .select('*,organizations(name,sport,governing_body)')
        .eq('user_id',userId)
        .order('created_at',{ascending:false})
    ]);
    setOrgs(o||[]);
    setRequests(r||[]);
    if(!selected && o?.[0]) setSelected(o[0].id);
  }

  useEffect(()=>{
    (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace('/login');return;}
      setUid(user.id);
      await load(user.id);
    })();
  },[router]);

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!selected) return;
    setBusy(true);
    setMsg('');
    const {error}=await supabase.from('organization_claim_requests').insert({
      organization_id:selected,
      user_id:uid,
      requested_role:'admin',
      request_note:note || null
    });
    setMsg(error?.message || 'Organization access request submitted.');
    if(!error){
      setNote('');
      await load(uid);
    }
    setBusy(false);
  }

  return <AppShell>
    <div className="eyebrow">Organization onboarding</div>
    <h1>Connect your organization</h1>
    <p className="muted">
      Use this if you manage compliance for a club, league, dojo, association, or youth sports program.
      Organization access is reviewed before admin controls are enabled.
    </p>

    <div className="grid two" style={{marginTop:24}}>
      <section className="card">
        <h2>Request organization access</h2>
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label>Organization</label>
            <select value={selected} onChange={e=>setSelected(e.target.value)}>
              {orgs.map(o=><option key={o.id} value={o.id}>
                {o.name}{o.sport ? ' — '+o.sport : ''}
              </option>)}
            </select>
          </div>

          <div className="field">
            <label>Your role / note</label>
            <textarea
              placeholder="Example: South Bay Judo board member responsible for instructor compliance."
              value={note}
              onChange={e=>setNote(e.target.value)}
            />
          </div>

          <div className="notice">
            To protect organizations from unauthorized access, requesting access does not immediately make you an administrator.
          </div>

          {msg && <div className="notice">{msg}</div>}

          <button className="btn green" disabled={busy}>
            {busy ? 'Submitting…' : 'Request admin access'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Your organization requests</h2>
        {requests.length===0 ? <p className="muted">No organization requests yet.</p> :
          <div className="list">
            {requests.map(r=>{
              const org:any=Array.isArray(r.organizations)?r.organizations[0]:r.organizations;
              return <div className="item" key={r.id}>
                <div>
                  <strong>{org?.name || 'Organization'}</strong>
                  <div className="muted">
                    {[org?.sport,org?.governing_body].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className={'status '+(r.status==='approved'?'green':r.status==='rejected'?'red':'amber')}>
                  {r.status}
                </span>
              </div>
            })}
          </div>
        }
      </section>
    </div>
  </AppShell>
}
