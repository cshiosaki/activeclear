'use client';

import { FormEvent,useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function OrganizationProfile(){
  const router=useRouter();
  const [orgId,setOrgId]=useState('');
  const [form,setForm]=useState<any>(null);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>setOrgId(new URLSearchParams(window.location.search).get('org')||''),[]);

  useEffect(()=>{
    if(!orgId)return;
    (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace('/login');return;}
      const {data:admin}=await supabase.from('organization_admins')
        .select('organization_id').eq('organization_id',orgId).eq('user_id',user.id).maybeSingle();
      if(!admin){router.replace('/organization');return;}

      const {data:o}=await supabase.from('organizations').select('*').eq('id',orgId).maybeSingle();
      setForm(o);
    })();
  },[orgId,router]);

  async function save(e:FormEvent){
    e.preventDefault();
    if(!form)return;
    setBusy(true);setMsg('');

    const bodies=(form.governing_bodies||[]).filter((x:string)=>x.trim());
    const {error}=await supabase.from('organizations').update({
      name:form.name,
      organization_type:form.organization_type,
      sport:form.sport,
      governing_body:bodies[0] || form.governing_body || null,
      governing_bodies:bodies,
      description:form.description || null,
      contact_name:form.contact_name || null,
      contact_email:form.contact_email || null,
      contact_phone:form.contact_phone || null,
      website:form.website || null,
      address_line1:form.address_line1 || null,
      address_line2:form.address_line2 || null,
      city:form.city || null,
      state:form.state || null,
      postal_code:form.postal_code || null
    }).eq('id',orgId);

    setMsg(error?.message || 'Organization profile updated.');
    setBusy(false);
  }

  if(!form)return <div className="shell">Loading profile…</div>;

  const update=(key:string,value:any)=>setForm({...form,[key]:value});

  return <AppShell>
    <div className="eyebrow">Organization profile</div>
    <h1>{form.name}</h1>
    <form className="card form" style={{marginTop:24,maxWidth:850}} onSubmit={save}>
      <div className="field"><label>Organization name</label><input value={form.name||''} onChange={e=>update('name',e.target.value)}/></div>
      <div className="field"><label>What does the organization do?</label><textarea value={form.description||''} onChange={e=>update('description',e.target.value)}/></div>
      <div className="row">
        <div className="field"><label>Organization type</label><input value={form.organization_type||''} onChange={e=>update('organization_type',e.target.value)}/></div>
        <div className="field"><label>Primary sport / activity</label><input value={form.sport||''} onChange={e=>update('sport',e.target.value)}/></div>
      </div>
      <div className="field">
        <label>Governing bodies / affiliations</label>
        <input
          value={(form.governing_bodies||[]).join(', ')}
          onChange={e=>update('governing_bodies',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))}
          placeholder="USJF, USA Judo"
        />
        <small className="muted">Separate multiple affiliations with commas.</small>
      </div>

      <h3>Organization contact information</h3>
      <div className="row">
        <div className="field"><label>Contact name</label><input value={form.contact_name||''} onChange={e=>update('contact_name',e.target.value)}/></div>
        <div className="field"><label>Contact email</label><input type="email" value={form.contact_email||''} onChange={e=>update('contact_email',e.target.value)}/></div>
        <div className="field"><label>Contact phone</label><input value={form.contact_phone||''} onChange={e=>update('contact_phone',e.target.value)}/></div>
        <div className="field"><label>Website</label><input value={form.website||''} onChange={e=>update('website',e.target.value)}/></div>
      </div>

      <h3>Address</h3>
      <div className="field"><label>Address</label><input value={form.address_line1||''} onChange={e=>update('address_line1',e.target.value)}/></div>
      <div className="field"><label>Address line 2</label><input value={form.address_line2||''} onChange={e=>update('address_line2',e.target.value)}/></div>
      <div className="row">
        <div className="field"><label>City</label><input value={form.city||''} onChange={e=>update('city',e.target.value)}/></div>
        <div className="field"><label>State</label><input value={form.state||''} onChange={e=>update('state',e.target.value)}/></div>
        <div className="field"><label>ZIP / postal code</label><input value={form.postal_code||''} onChange={e=>update('postal_code',e.target.value)}/></div>
      </div>

      {msg&&<div className="notice">{msg}</div>}
      <div style={{display:'flex',gap:10}}>
        <button className="btn green" disabled={busy}>{busy?'Saving…':'Save changes'}</button>
        <a className="btn secondary" href={`/organization-dashboard?org=${orgId}`}>Back to organization home</a>
      </div>
    </form>
  </AppShell>;
}
