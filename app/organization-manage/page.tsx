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
  {label:'Background Check', credential:'Background Check'},
  {label:'CPR / AED', credential:'CPR / AED'},
  {label:'Concussion Training', credential:'Concussion Training'},
  {label:'SafeSport', credential:'SafeSport'},
  {label:'NAYS Coach Certification', credential:'NAYS Coach Certification'},
  {label:'Code of Conduct', credential:'Code of Conduct'},
  {label:'Photo ID', credential:'Photo ID'},
  {label:'USJF Membership', credential:'USJF Membership'},
  {label:'USA Judo Membership', credential:'USA Judo Membership'},
  {label:'Judo Coaching / Instructor Certification', credential:'Judo Coaching / Instructor Certification'},
  {label:'Little League Abuse Awareness Training', credential:'Little League Abuse Awareness Training'},
];

export default function OrganizationManage(){
  const router=useRouter();
  const [orgId,setOrgId]=useState('');

  const [org,setOrg]=useState<any>(null);
  const [types,setTypes]=useState<any[]>([]);
  const [requirements,setRequirements]=useState<any[]>([]);
  const [roles,setRoles]=useState<any[]>([]);
  const [selectedRoles,setSelectedRoles]=useState<string[]>([]);
  const [customRole,setCustomRole]=useState('');
  const [selected,setSelected]=useState<string[]>([]);
  const [customName,setCustomName]=useState('');
  const [customType,setCustomType]=useState('');
  const [customDescription,setCustomDescription]=useState('');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  async function load(){
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){router.replace('/login');return;}
    if(!orgId){router.replace('/organization');return;}

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

  const typeByName=useMemo(()=>{
    const m:Record<string,any>={};
    types.forEach(t=>m[t.name]=t);
    return m;
  },[types]);

  async function addRecommendedRoles(){
    if(!selectedRoles.length) return;
    setBusy(true); setMsg('');
    for(const name of selectedRoles){
      const {error}=await supabase.from('organization_roles')
        .upsert({organization_id:orgId,name,is_active:true},{onConflict:'organization_id,name'});
      if(error){setMsg(error.message);setBusy(false);return;}
    }
    setSelectedRoles([]);
    setMsg('Roles added.');
    await load();
    setBusy(false);
  }

  async function addCustomRole(e:FormEvent){
    e.preventDefault();
    if(!customRole.trim()) return;
    setBusy(true); setMsg('');
    const {error}=await supabase.from('organization_roles')
      .insert({organization_id:orgId,name:customRole.trim(),is_active:true});
    setMsg(error?.message || 'Custom role added.');
    if(!error){setCustomRole('');await load();}
    setBusy(false);
  }

  async function removeRole(id:string){
    if(!window.confirm('Remove this role? Requirement assignments to this role will also be removed.')) return;
    const {error}=await supabase.from('organization_roles').delete().eq('id',id);
    if(error)setMsg(error.message); else {setMsg('Role removed.');await load();}
  }

  async function toggleRequirementRole(requirementId:string, roleId:string, checked:boolean){
    setBusy(true); setMsg('');
    if(checked){
      const {error}=await supabase.from('requirement_roles')
        .upsert({requirement_id:requirementId,role_id:roleId},{onConflict:'requirement_id,role_id'});
      if(error){setMsg(error.message);setBusy(false);return;}
    }else{
      const {error}=await supabase.from('requirement_roles')
        .delete().eq('requirement_id',requirementId).eq('role_id',roleId);
      if(error){setMsg(error.message);setBusy(false);return;}
    }
    await load();
    setBusy(false);
  }

  async function addRecommended(){
    if(!selected.length) return;
    setBusy(true); setMsg('');
    for(const name of selected){
      const rec=RECOMMENDED.find(x=>x.label===name);
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
          .select('id').single();
        if(error){setMsg(error.message);setBusy(false);return;}
        reqId=req.id;
      }

      const {error:mapErr}=await supabase.from('requirement_credential_types')
        .upsert({requirement_id:reqId,credential_type_id:type.id},{onConflict:'requirement_id,credential_type_id'});
      if(mapErr){setMsg(mapErr.message);setBusy(false);return;}
    }
    setSelected([]);
    setMsg('Recommended requirements added.');
    await load();
    setBusy(false);
  }

  async function addCustom(e:FormEvent){
    e.preventDefault();
    if(!customName.trim() || !customType) return;
    setBusy(true); setMsg('');

    const {data:req,error}=await supabase.from('organization_requirements')
      .insert({
        organization_id:orgId,
        name:customName.trim(),
        description:customDescription.trim() || null,
        requirement_status:'required',
        active:true
      })
      .select('id').single();
    if(error){setMsg(error.message);setBusy(false);return;}

    const {error:mapErr}=await supabase.from('requirement_credential_types')
      .insert({requirement_id:req.id,credential_type_id:customType});
    if(mapErr){setMsg(mapErr.message);setBusy(false);return;}

    setCustomName(''); setCustomDescription('');
    setMsg('Custom requirement added.');
    await load();
    setBusy(false);
  }

  async function removeRequirement(id:string){
    if(!window.confirm('Remove this requirement from the organization?')) return;
    const {error}=await supabase.from('organization_requirements').delete().eq('id',id);
    if(error)setMsg(error.message); else {setMsg('Requirement removed.');await load();}
  }

  if(!org) return <div className="shell">Loading organization setup…</div>;

  return <AppShell>
    <div className="eyebrow">Organization setup</div>
    <h1>{org.name}</h1>
    <p className="muted">Set up the roles in your organization, then choose requirements and assign them to the roles that need them.</p>

    <section className="card" style={{marginTop:24}}>
      <h2>1. Organization roles</h2>
      <p className="muted">Choose recommended roles or add a custom role.</p>

      <div className="grid two" style={{marginTop:16}}>
        <div>
          <h3>Recommended roles</h3>
          <div className="list">
            {RECOMMENDED_ROLES.map(role=>(
              <label className="item" key={role} style={{cursor:'pointer'}}>
                <strong>{role}</strong>
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(role)}
                  onChange={e=>setSelectedRoles(e.target.checked?[...selectedRoles,role]:selectedRoles.filter(x=>x!==role))}
                  style={{width:20,height:20}}
                />
              </label>
            ))}
          </div>
          <button className="btn green" style={{marginTop:14}} disabled={busy || selectedRoles.length===0} onClick={addRecommendedRoles}>
            Add selected roles
          </button>
        </div>

        <div>
          <h3>Other / custom role</h3>
          <form className="form" onSubmit={addCustomRole}>
            <div className="field">
              <label>Role name</label>
              <input placeholder="Example: Dojo Safety Officer" value={customRole} onChange={e=>setCustomRole(e.target.value)}/>
            </div>
            <button className="btn green" disabled={busy}>Add custom role</button>
          </form>

          <h3 style={{marginTop:24}}>Current roles</h3>
          {roles.length===0 ? <p className="muted">No roles added yet.</p> :
            <div className="list">
              {roles.map(role=><div className="item" key={role.id}>
                <strong>{role.name}</strong>
                <button className="btn" type="button" style={{background:'#fde7e7',color:'#9a2626'}} onClick={()=>removeRole(role.id)}>Remove</button>
              </div>)}
            </div>
          }
        </div>
      </div>
    </section>

    <h2 className="section-title">2. Requirements</h2>
    <div className="grid two" style={{marginTop:24}}>
      <section className="card">
        <h2>Recommended requirements</h2>
        <p className="muted">Select any that apply to your organization.</p>
        <div className="list">
          {RECOMMENDED.map(r=>(
            <label className="item" key={r.label} style={{cursor:'pointer'}}>
              <div>
                <strong>{r.label}</strong>
                <div className="muted">Credential: {r.credential}</div>
              </div>
              <input
                type="checkbox"
                checked={selected.includes(r.label)}
                onChange={e=>setSelected(e.target.checked?[...selected,r.label]:selected.filter(x=>x!==r.label))}
                style={{width:20,height:20}}
              />
            </label>
          ))}
        </div>
        <button className="btn green" style={{marginTop:14}} disabled={busy || selected.length===0} onClick={addRecommended}>
          Add selected requirements
        </button>
      </section>

      <section className="card">
        <h2>Other / custom requirement</h2>
        <form className="form" onSubmit={addCustom}>
          <div className="field">
            <label>Requirement name</label>
            <input placeholder="Example: Club Safety Orientation" value={customName} onChange={e=>setCustomName(e.target.value)}/>
          </div>
          <div className="field">
            <label>Accepted credential type</label>
            <select value={customType} onChange={e=>setCustomType(e.target.value)}>
              {types.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Instructions / description</label>
            <textarea placeholder="Describe what the participant must provide." value={customDescription} onChange={e=>setCustomDescription(e.target.value)}/>
          </div>
          <button className="btn green" disabled={busy}>Add custom requirement</button>
        </form>
      </section>
    </div>

    <section className="card" style={{marginTop:24}}>
      <h2>Current organization requirements</h2>
      {requirements.length===0 ? <p className="muted">No requirements added yet.</p> :
        <div className="list">
          {requirements.map((r:any)=>{
            const mapped=(r.requirement_credential_types||[]).map((m:any)=>types.find(t=>t.id===m.credential_type_id)?.name).filter(Boolean);
            return <div className="item" key={r.id}>
              <div>
                <strong>{r.name}</strong>
                {r.description && !r.description.toLowerCase().includes(r.name.toLowerCase()) && (
                  <div className="muted">{r.description}</div>
                )}
                {mapped.length > 0 && !(mapped.length === 1 && mapped[0] === r.name) && (
                  <div className="muted">Accepted credential: {mapped.join(', ')}</div>
                )}
                {mapped.length === 0 && <div className="muted">Accepted credential not mapped yet</div>}
                <div style={{marginTop:10}}>
                  <div className="muted" style={{fontWeight:700}}>Applies to roles</div>
                  {roles.length===0 ? <div className="muted">Add roles above first.</div> :
                    <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:6}}>
                      {roles.map(role=>{
                        const checked=(r.requirement_roles||[]).some((x:any)=>x.role_id===role.id);
                        return <label key={role.id} style={{display:'flex',alignItems:'center',gap:5}}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e=>toggleRequirementRole(r.id,role.id,e.target.checked)}
                          />
                          {role.name}
                        </label>
                      })}
                    </div>
                  }
                </div>
              </div>
              <button className="btn" type="button" style={{background:'#fde7e7',color:'#9a2626'}} onClick={()=>removeRequirement(r.id)}>Remove</button>
            </div>
          })}
        </div>
      }
    </section>

    {msg && <div className="notice" style={{marginTop:16}}>{msg}</div>}
  </AppShell>
}
