'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

const RECOMMENDED_ROLES = [
  'Coach',
  'Head Coach',
  'Assistant Coach',
  'Instructor',
  'Assistant Instructor',
  'Volunteer',
  'Board Member',
  'Official / Referee',
  'Team Parent',
  'Tournament / Event Volunteer',
];

const RECOMMENDED = [
  {label:'Background Check', credential:'Background Check', sports:null},
  {label:'CPR / AED', credential:'CPR / AED', sports:null},
  {label:'Concussion Training', credential:'Concussion Training', sports:null},
  {label:'SafeSport', credential:'SafeSport', sports:null},
  {label:'Code of Conduct', credential:'Code of Conduct', sports:null},
  {label:'Photo ID', credential:'Photo ID', sports:null},
  {label:'NAYS Coach Certification', credential:'NAYS Coach Certification', sports:['Football']},
  {label:'USJF Membership', credential:'USJF Membership', sports:['Judo']},
  {label:'USA Judo Membership', credential:'USA Judo Membership', sports:['Judo']},
  {label:'Judo Coaching / Instructor Certification', credential:'Judo Coaching / Instructor Certification', sports:['Judo']},
  {label:'Little League Abuse Awareness Training', credential:'Little League Abuse Awareness Training', sports:['Baseball']},
];

export default function OrganizationManage(){
  const router=useRouter();
  const [orgId,setOrgId]=useState('');
  const [org,setOrg]=useState<any>(null);
  const [types,setTypes]=useState<any[]>([]);
  const [requirements,setRequirements]=useState<any[]>([]);
  const [roles,setRoles]=useState<any[]>([]);
  const [activeRoleName,setActiveRoleName]=useState('');
  const [selected,setSelected]=useState<string[]>([]);
  const [customName,setCustomName]=useState('');
  const [customType,setCustomType]=useState('');
  const [customDescription,setCustomDescription]=useState('');
  const [customWebsite,setCustomWebsite]=useState('');
  const [customIssuer,setCustomIssuer]=useState('');
  const [customAiNotes,setCustomAiNotes]=useState('');
  const [customSample,setCustomSample]=useState<File|null>(null);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  async function load(){
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){router.replace('/login');return;}
    if(!orgId)return;

    const {data:admin}=await supabase.from('organization_admins')
      .select('organization_id')
      .eq('organization_id',orgId)
      .eq('user_id',user.id)
      .maybeSingle();

    if(!admin){router.replace('/organization');return;}

    const [{data:o},{data:t},{data:r},{data:roleData}] = await Promise.all([
      supabase.from('organizations').select('*').eq('id',orgId).maybeSingle(),
      supabase.from('credential_types').select('*').order('name'),
      supabase.from('organization_requirements')
        .select('*,requirement_credential_types(credential_type_id),requirement_roles(role_id)')
        .eq('organization_id',orgId)
        .eq('active',true)
        .order('name'),
      supabase.from('organization_roles')
        .select('*')
        .eq('organization_id',orgId)
        .eq('is_active',true)
        .order('name')
    ]);

    setOrg(o);
    setTypes(t||[]);
    setRequirements(r||[]);
    setRoles(roleData||[]);
    setCustomType(t?.[0]?.id || '');
  }

  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get('org') || '';
    setOrgId(id);
  },[]);

  useEffect(()=>{if(orgId) load()},[orgId]);

  useEffect(()=>{
    if(credentialTypesForOrg.length && !credentialTypesForOrg.some((t:any)=>t.id===customType)){
      setCustomType(credentialTypesForOrg[0].id);
    }
  },[credentialTypesForOrg,customType]);

  const recommendedForOrg=useMemo(()=>{
    const sport=(org?.sport || '').trim();
    return RECOMMENDED.filter(item=>!item.sports || item.sports.includes(sport));
  },[org]);

  const credentialTypesForOrg=useMemo(()=>{
    const sport=(org?.sport || '').trim();
    return types.filter((t:any)=>!t.applicable_sports || t.applicable_sports.length===0 || t.applicable_sports.includes(sport));
  },[types,org]);

  const typeByName=useMemo(()=>{
    const m:Record<string,any>={};
    types.forEach(t=>m[t.name]=t);
    return m;
  },[types]);

  async function ensureRole(roleName:string){
    const existing=roles.find((r:any)=>r.name===roleName);
    if(existing) return existing.id;

    const {data,error}=await supabase.from('organization_roles')
      .upsert({organization_id:orgId,name:roleName,is_active:true},{onConflict:'organization_id,name'})
      .select('id')
      .single();

    if(error) throw error;
    return data.id;
  }

  async function addSelectedRequirements(){
    if(!activeRoleName){
      setMsg('Choose a role first.');
      return;
    }
    if(!selected.length){
      setMsg('Select at least one requirement.');
      return;
    }

    setBusy(true);
    setMsg('');

    try{
      const roleId=await ensureRole(activeRoleName);

      for(const name of selected){
        const rec=recommendedForOrg.find(x=>x.label===name);
        if(!rec) continue;

        const type=typeByName[rec.credential];
        if(!type) continue;

        const existing=requirements.find((r:any)=>r.name===rec.label);
        let reqId=existing?.id;

        if(!reqId){
          const {data:req,error}=await supabase.from('organization_requirements')
            .insert({
              organization_id:orgId,
              name:rec.label,
              description:null,
              requirement_status:'required',
              active:true
            })
            .select('id')
            .single();

          if(error) throw error;
          reqId=req.id;
        }

        const {error:mapErr}=await supabase.from('requirement_credential_types')
          .upsert(
            {requirement_id:reqId,credential_type_id:type.id},
            {onConflict:'requirement_id,credential_type_id'}
          );
        if(mapErr) throw mapErr;

        const {error:roleErr}=await supabase.from('requirement_roles')
          .upsert(
            {requirement_id:reqId,role_id:roleId},
            {onConflict:'requirement_id,role_id'}
          );
        if(roleErr) throw roleErr;
      }

      setSelected([]);
      setMsg(`${activeRoleName} added with selected requirements.`);
      await load();
    }catch(error:any){
      setMsg(error?.message || 'Could not add role and requirements.');
    }

    setBusy(false);
  }

  async function addCustom(e:FormEvent){
    e.preventDefault();
    if(!activeRoleName){setMsg('Choose a role first.');return;}
    if(!customName.trim() || !customType)return;

    setBusy(true);
    setMsg('');

    let samplePath:string|null=null;

    try{
      const roleId=await ensureRole(activeRoleName);

      if(customSample){
        const safe=customSample.name.replace(/[^a-zA-Z0-9._-]/g,'_');
        samplePath=`${orgId}/${crypto.randomUUID()}-${safe}`;
        const {error:uploadError}=await supabase.storage
          .from('requirement-samples')
          .upload(samplePath,customSample);
        if(uploadError) throw uploadError;
      }

      const {data:req,error}=await supabase.from('organization_requirements')
        .insert({
          organization_id:orgId,
          name:customName.trim(),
          description:customDescription.trim() || null,
          official_url:customWebsite.trim() || null,
          accepted_issuer:customIssuer.trim() || null,
          ai_review_notes:customAiNotes.trim() || null,
          sample_document_path:samplePath,
          requirement_status:'required',
          active:true
        })
        .select('id')
        .single();

      if(error) throw error;

      const {error:mapErr}=await supabase.from('requirement_credential_types')
        .insert({requirement_id:req.id,credential_type_id:customType});
      if(mapErr) throw mapErr;

      const {error:roleErr}=await supabase.from('requirement_roles')
        .insert({requirement_id:req.id,role_id:roleId});
      if(roleErr) throw roleErr;

      setCustomName('');
      setCustomDescription('');
      setCustomWebsite('');
      setCustomIssuer('');
      setCustomAiNotes('');
      setCustomSample(null);
      setMsg(`Custom requirement added for ${activeRoleName}.`);
      await load();
    }catch(error:any){
      if(samplePath){
        await supabase.storage.from('requirement-samples').remove([samplePath]);
      }
      setMsg(error?.message || 'Could not add custom requirement.');
    }

    setBusy(false);
  }

  async function removeRequirement(id:string){
    if(!window.confirm('Remove this requirement from the organization?'))return;
    const {error}=await supabase.from('organization_requirements').delete().eq('id',id);
    if(error)setMsg(error.message); else {setMsg('Requirement removed.');await load();}
  }

  if(!org) return <div className="shell">Loading organization setup…</div>;

  return <AppShell>
    <div className="eyebrow">Organization setup</div>
    <h1>{org.name}</h1>
    <p className="muted">Choose a role, highlight the requirements for that role, then add them together.</p>

    <section className="card" style={{marginTop:24}}>
      <h2>1. Role</h2>
      <p className="muted">Start typing to choose a common role, or enter your own role name.</p>

      <div className="field" style={{marginTop:16,maxWidth:520}}>
        <label>Role name</label>
        <input
          list="recommended-roles"
          value={activeRoleName}
          onChange={e=>setActiveRoleName(e.target.value)}
          placeholder="Example: Competition Instructor"
        />
        <datalist id="recommended-roles">
          {RECOMMENDED_ROLES.map(role=><option key={role} value={role}/>)}
        </datalist>
      </div>
    </section>

    <section className="card" style={{marginTop:24}}>
      <h2>2. Select requirements</h2>
      <div className="list" style={{marginTop:12}}>
        {recommendedForOrg.map(r=>(
          <label className="item" key={r.label} style={{cursor:'pointer'}}>
            <strong>{r.label}</strong>
            <input
              type="checkbox"
              checked={selected.includes(r.label)}
              onChange={e=>setSelected(e.target.checked?[...selected,r.label]:selected.filter(x=>x!==r.label))}
              style={{width:20,height:20}}
            />
          </label>
        ))}
      </div>

      <button
        className="btn green"
        style={{marginTop:16}}
        disabled={busy || !activeRoleName || selected.length===0}
        onClick={addSelectedRequirements}
      >
        {busy?'Adding…':'Add role & requirements'}
      </button>
    </section>

    <section className="card" style={{marginTop:24}}>
      <h2>3. Other / custom requirement</h2>
      <form className="form" onSubmit={addCustom}>
        <div className="field">
          <label>Requirement name</label>
          <input placeholder="Example: Club Safety Orientation" value={customName} onChange={e=>setCustomName(e.target.value)}/>
        </div>
        <div className="field">
          <label>Accepted credential type</label>
          <select value={customType} onChange={e=>setCustomType(e.target.value)}>
            {credentialTypesForOrg.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Instructions / description</label>
          <textarea placeholder="Describe what the participant must provide." value={customDescription} onChange={e=>setCustomDescription(e.target.value)}/>
        </div>
        <div className="field">
          <label>Official website / renewal link</label>
          <input
            type="url"
            placeholder="https://..."
            value={customWebsite}
            onChange={e=>setCustomWebsite(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Accepted issuer (optional)</label>
          <input
            placeholder="Example: American Red Cross"
            value={customIssuer}
            onChange={e=>setCustomIssuer(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Sample acceptable certification (optional)</label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={e=>setCustomSample(e.target.files?.[0] || null)}
          />
          <small className="muted">Used as a reference example for AI review.</small>
        </div>
        <div className="field">
          <label>AI review notes (optional)</label>
          <textarea
            placeholder="Example: Must show participant name, current expiration date, and CPR/AED from an approved provider."
            value={customAiNotes}
            onChange={e=>setCustomAiNotes(e.target.value)}
          />
        </div>
        <button className="btn green" disabled={busy || !activeRoleName}>Add custom requirement</button>
      </form>
    </section>

    <section className="card" style={{marginTop:24}}>
      <h2>Current organization setup</h2>
      {roles.length===0 ? <p className="muted">No roles added yet.</p> :
        <div className="list">
          {roles.map((role:any)=>{
            const assigned=requirements.filter((r:any)=>(r.requirement_roles||[]).some((x:any)=>x.role_id===role.id));
            return <details className="item" key={role.id} style={{display:'block'}}>
              <summary style={{cursor:'pointer',fontWeight:700,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
                <span>
                  {role.name} <span className="muted">· {assigned.length} requirement{assigned.length===1?'':'s'}</span>
                </span>
                <span style={{display:'flex',gap:8}} onClick={e=>e.preventDefault()}>
                  <button className="btn secondary" type="button" onClick={()=>editRole(role)}>Edit</button>
                  <button className="btn" type="button" style={{background:'#fde7e7',color:'#9a2626'}} onClick={()=>deleteRole(role)}>Delete</button>
                </span>
              </summary>
              <div className="list" style={{marginTop:12}}>
                {assigned.length===0 ? <div className="muted">No requirements assigned.</div> :
                  assigned.map((r:any)=><div className="item" key={r.id}>
                    <strong>{r.name}</strong>
                    <button className="btn" type="button" style={{background:'#fde7e7',color:'#9a2626'}} onClick={()=>removeRequirement(r.id)}>Remove</button>
                  </div>)
                }
              </div>
            </details>
          })}
        </div>
      }
    </section>

    {msg && <div className="notice" style={{marginTop:16}}>{msg}</div>}
  </AppShell>
}
