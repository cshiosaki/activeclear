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

const BACKGROUND_SOURCES = [
  'NCSI',
  'JDP',
  'Local Parks & Recreation',
  'State / Fingerprint Background Check',
  'Other',
];

const CPR_REQUIREMENTS = [
  'CPR',
  'First Aid',
  'AED',
];

const CONCUSSION_SOURCES = [
  'CDC HEADS UP',
  'State / local approved concussion course',
  'Other approved course',
];

const SAFESPORT_SOURCES = [
  'U.S. Center for SafeSport',
  'Governing body approved abuse-prevention training',
  'Other approved course',
];

const CODE_OF_CONDUCT_OPTIONS = [
  'Organization Code of Conduct',
  'Governing Body Code of Conduct',
  'Signed acknowledgment required',
];

const RECOMMENDED = [
  {label:'Background Check', credential:'Background Check', sports:null, governingBodies:null},
  {label:'CPR / AED', credential:'CPR / AED', sports:null, governingBodies:null},
  {label:'Concussion Training', credential:'Concussion Training', sports:null, governingBodies:null},
  {label:'SafeSport', credential:'SafeSport', sports:null, governingBodies:null},
  {label:'Code of Conduct', credential:'Code of Conduct', sports:null, governingBodies:null},
  {label:'Photo ID', credential:'Photo ID', sports:null, governingBodies:null},
  {label:'NAYS Coach Certification', credential:'NAYS Coach Certification', sports:['Football'], governingBodies:['TYSA']},
  {label:'USJF Membership', credential:'USJF Membership', sports:['Judo'], governingBodies:['USJF']},
  {label:'USJA Membership', credential:'USJA Membership', sports:['Judo'], governingBodies:['USJA']},
  {label:'USA Judo Membership', credential:'USA Judo Membership', sports:['Judo'], governingBodies:['USA Judo']},
  {label:'Judo Coaching / Instructor Certification', credential:'Judo Coaching / Instructor Certification', sports:['Judo'], governingBodies:['USJF','USA Judo']},
  {label:'Little League Abuse Awareness Training', credential:'Little League Abuse Awareness Training', sports:['Baseball'], governingBodies:['Little League']},
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
  const [backgroundSources,setBackgroundSources]=useState<string[]>([]);
  const [otherBackgroundSource,setOtherBackgroundSource]=useState('');
  const [cprRequirements,setCprRequirements]=useState<string[]>([]);
  const [concussionSources,setConcussionSources]=useState<string[]>([]);
  const [otherConcussionSource,setOtherConcussionSource]=useState('');
  const [safeSportSources,setSafeSportSources]=useState<string[]>([]);
  const [otherSafeSportSource,setOtherSafeSportSource]=useState('');
  const [codeOfConductOptions,setCodeOfConductOptions]=useState<string[]>([]);
  const [codeOfConductUrl,setCodeOfConductUrl]=useState('');
  const [codeOfConductFile,setCodeOfConductFile]=useState<File|null>(null);
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

  const recommendedForOrg=useMemo(()=>{
    const sport=(org?.sport || '').trim();
    const governingBodies:Array<string> =
      Array.isArray(org?.governing_bodies) && org.governing_bodies.length
        ? org.governing_bodies
        : (org?.governing_body ? [org.governing_body] : []);

    return RECOMMENDED.filter(item=>{
      const sportOk=!item.sports || item.sports.includes(sport);
      const governingOk=!item.governingBodies ||
        item.governingBodies.some(body=>governingBodies.includes(body));
      return sportOk && governingOk;
    });
  },[org]);

  const credentialTypesForOrg=useMemo(()=>{
    const sport=(org?.sport || '').trim();
    const governingBodies:Array<string> =
      Array.isArray(org?.governing_bodies) && org.governing_bodies.length
        ? org.governing_bodies
        : (org?.governing_body ? [org.governing_body] : []);

    return types.filter((t:any)=>{
      const sportOk=!t.applicable_sports || t.applicable_sports.length===0 || t.applicable_sports.includes(sport);
      const governingOk=!t.applicable_governing_bodies ||
        t.applicable_governing_bodies.length===0 ||
        t.applicable_governing_bodies.some((body:string)=>governingBodies.includes(body));
      return sportOk && governingOk;
    });
  },[types,org]);

  const typeByName=useMemo(()=>{
    const m:Record<string,any>={};
    types.forEach(t=>m[t.name]=t);
    return m;
  },[types]);

  useEffect(()=>{
    if(credentialTypesForOrg.length && !credentialTypesForOrg.some((t:any)=>t.id===customType)){
      setCustomType(credentialTypesForOrg[0].id);
    }
  },[credentialTypesForOrg,customType]);

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
              accepted_issuers:rec.label==='Background Check' ? backgroundSources.filter(x=>x!=='Other') : null,
              requirement_status:'required',
              active:true
            })
            .select('id')
            .single();

          if(error) throw error;
          reqId=req.id;
        }

        if(rec.label==='Background Check'){
          const issuers=[
            ...backgroundSources.filter(x=>x!=='Other'),
            ...(backgroundSources.includes('Other') && otherBackgroundSource.trim()
              ? [otherBackgroundSource.trim()]
              : [])
          ];
          const {error:bgErr}=await supabase.from('organization_requirements')
            .update({accepted_issuers:issuers})
            .eq('id',reqId);
          if(bgErr) throw bgErr;
        }

        if(rec.label==='CPR / AED'){
          const {error:cprErr}=await supabase.from('organization_requirements')
            .update({
              validation_rules:{
                required_components:cprRequirements
              }
            })
            .eq('id',reqId);
          if(cprErr) throw cprErr;
        }

        if(rec.label==='Concussion Training'){
          const courses=[
            ...concussionSources.filter(x=>x!=='Other approved course'),
            ...(concussionSources.includes('Other approved course') && otherConcussionSource.trim()
              ? [otherConcussionSource.trim()]
              : [])
          ];
          const {error:concussionErr}=await supabase.from('organization_requirements')
            .update({
              validation_rules:{
                accepted_courses:courses
              }
            })
            .eq('id',reqId);
          if(concussionErr) throw concussionErr;
        }

        if(rec.label==='SafeSport'){
          const courses=[
            ...safeSportSources.filter(x=>x!=='Other approved course'),
            ...(safeSportSources.includes('Other approved course') && otherSafeSportSource.trim()
              ? [otherSafeSportSource.trim()]
              : [])
          ];
          const {error:safeSportErr}=await supabase.from('organization_requirements')
            .update({
              validation_rules:{
                accepted_courses:courses
              }
            })
            .eq('id',reqId);
          if(safeSportErr) throw safeSportErr;
        }

        if(rec.label==='Code of Conduct'){
          let documentPath:string|null=existing?.source_document_path || null;

          if(codeOfConductFile){
            const safe=codeOfConductFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');
            documentPath=`${orgId}/${reqId}/${crypto.randomUUID()}-${safe}`;
            const {error:docError}=await supabase.storage
              .from('requirement-documents')
              .upload(documentPath,codeOfConductFile);
            if(docError) throw docError;
          }

          const {error:conductErr}=await supabase.from('organization_requirements')
            .update({
              validation_rules:{
                code_of_conduct_options:codeOfConductOptions
              },
              source_document_url:codeOfConductUrl.trim() || null,
              source_document_path:documentPath,
              requires_acknowledgment:codeOfConductOptions.includes('Signed acknowledgment required')
            })
            .eq('id',reqId);
          if(conductErr) throw conductErr;
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
      setBackgroundSources([]);
      setOtherBackgroundSource('');
      setCprRequirements([]);
      setConcussionSources([]);
      setOtherConcussionSource('');
      setSafeSportSources([]);
      setOtherSafeSportSource('');
      setCodeOfConductOptions([]);
      setCodeOfConductUrl('');
      setCodeOfConductFile(null);
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

  async function editRole(role:any){
    const nextName=window.prompt('Edit role name', role.name);
    if(nextName===null) return;
    const name=nextName.trim();
    if(!name || name===role.name) return;

    setBusy(true);
    setMsg('');
    const {error}=await supabase.from('organization_roles')
      .update({name})
      .eq('id',role.id)
      .eq('organization_id',orgId);

    if(error){
      setMsg(error.message);
    }else{
      setMsg('Role updated.');
      if(activeRoleName===role.name) setActiveRoleName(name);
      await load();
    }
    setBusy(false);
  }

  async function deleteRole(role:any){
    const ok=window.confirm(
      `Delete "${role.name}"? This will remove its requirement assignments. Existing people using this role will need to choose a role again.`
    );
    if(!ok) return;

    setBusy(true);
    setMsg('');
    const {error}=await supabase.from('organization_roles')
      .delete()
      .eq('id',role.id)
      .eq('organization_id',orgId);

    if(error){
      setMsg(error.message);
    }else{
      setMsg('Role deleted.');
      if(activeRoleName===role.name) setActiveRoleName('');
      await load();
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
      <p className="muted">
        Common requirements for {org.organization_type?.includes('Martial Arts') ? 'Martial Arts / ' : ''}{org.sport || 'this activity'}
      </p>
      <div className="list" style={{marginTop:12}}>
        {recommendedForOrg.map(r=>(
          <div key={r.label}>
            <label className="item" style={{cursor:'pointer'}}>
              <strong>{r.label}</strong>
              <input
                type="checkbox"
                checked={selected.includes(r.label)}
                onChange={e=>{
                  setSelected(e.target.checked?[...selected,r.label]:selected.filter(x=>x!==r.label));
                  if(r.label==='Background Check' && !e.target.checked){
                    setBackgroundSources([]);
                    setOtherBackgroundSource('');
                  }
                  if(r.label==='CPR / AED' && !e.target.checked){
                    setCprRequirements([]);
                  }
                  if(r.label==='Concussion Training' && !e.target.checked){
                    setConcussionSources([]);
                    setOtherConcussionSource('');
                  }
                  if(r.label==='SafeSport' && !e.target.checked){
                    setSafeSportSources([]);
                    setOtherSafeSportSource('');
                  }
                  if(r.label==='Code of Conduct' && !e.target.checked){
                    setCodeOfConductOptions([]);
                    setCodeOfConductUrl('');
                    setCodeOfConductFile(null);
                  }
                }}
                style={{width:20,height:20}}
              />
            </label>

            {r.label==='Background Check' && selected.includes('Background Check') && (
              <div className="card" style={{margin:'8px 0 14px 24px',padding:14}}>
                <div style={{fontWeight:700,marginBottom:8}}>Accepted background check source(s)</div>
                <div className="list">
                  {BACKGROUND_SOURCES.map(source=>(
                    <label className="item" key={source} style={{cursor:'pointer'}}>
                      <span>{source}</span>
                      <input
                        type="checkbox"
                        checked={backgroundSources.includes(source)}
                        onChange={e=>setBackgroundSources(
                          e.target.checked
                            ? [...backgroundSources,source]
                            : backgroundSources.filter(x=>x!==source)
                        )}
                        style={{width:20,height:20}}
                      />
                    </label>
                  ))}
                </div>

                {backgroundSources.includes('Other') && (
                  <div className="field" style={{marginTop:10}}>
                    <label>Other approved background source</label>
                    <input
                      placeholder="Enter provider or agency name"
                      value={otherBackgroundSource}
                      onChange={e=>setOtherBackgroundSource(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {r.label==='CPR / AED' && selected.includes('CPR / AED') && (
              <div className="card" style={{margin:'8px 0 14px 24px',padding:14}}>
                <div style={{fontWeight:700,marginBottom:8}}>Required training components</div>
                <div className="list">
                  {CPR_REQUIREMENTS.map(item=>(
                    <label className="item" key={item} style={{cursor:'pointer'}}>
                      <span>{item}</span>
                      <input
                        type="checkbox"
                        checked={cprRequirements.includes(item)}
                        onChange={e=>setCprRequirements(
                          e.target.checked
                            ? [...cprRequirements,item]
                            : cprRequirements.filter(x=>x!==item)
                        )}
                        style={{width:20,height:20}}
                      />
                    </label>
                  ))}
                </div>
                <div className="muted" style={{marginTop:10}}>
                  Must be completed through a certified course.
                </div>
              </div>
            )}

            {r.label==='Concussion Training' && selected.includes('Concussion Training') && (
              <div className="card" style={{margin:'8px 0 14px 24px',padding:14}}>
                <div style={{fontWeight:700,marginBottom:8}}>Accepted concussion training</div>
                <div className="list">
                  {CONCUSSION_SOURCES.map(source=>(
                    <label className="item" key={source} style={{cursor:'pointer'}}>
                      <span>{source}</span>
                      <input
                        type="checkbox"
                        checked={concussionSources.includes(source)}
                        onChange={e=>setConcussionSources(
                          e.target.checked
                            ? [...concussionSources,source]
                            : concussionSources.filter(x=>x!==source)
                        )}
                        style={{width:20,height:20}}
                      />
                    </label>
                  ))}
                </div>

                {concussionSources.includes('Other approved course') && (
                  <div className="field" style={{marginTop:10}}>
                    <label>Other approved concussion course</label>
                    <input
                      placeholder="Enter course or provider name"
                      value={otherConcussionSource}
                      onChange={e=>setOtherConcussionSource(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {r.label==='SafeSport' && selected.includes('SafeSport') && (
              <div className="card" style={{margin:'8px 0 14px 24px',padding:14}}>
                <div style={{fontWeight:700,marginBottom:8}}>Accepted SafeSport / abuse-prevention training</div>
                <div className="list">
                  {SAFESPORT_SOURCES.map(source=>(
                    <label className="item" key={source} style={{cursor:'pointer'}}>
                      <span>{source}</span>
                      <input
                        type="checkbox"
                        checked={safeSportSources.includes(source)}
                        onChange={e=>setSafeSportSources(
                          e.target.checked
                            ? [...safeSportSources,source]
                            : safeSportSources.filter(x=>x!==source)
                        )}
                        style={{width:20,height:20}}
                      />
                    </label>
                  ))}
                </div>

                {safeSportSources.includes('Other approved course') && (
                  <div className="field" style={{marginTop:10}}>
                    <label>Other approved course</label>
                    <input
                      placeholder="Enter course or provider name"
                      value={otherSafeSportSource}
                      onChange={e=>setOtherSafeSportSource(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {r.label==='Code of Conduct' && selected.includes('Code of Conduct') && (
              <div className="card" style={{margin:'8px 0 14px 24px',padding:14}}>
                <div style={{fontWeight:700,marginBottom:8}}>Code of Conduct requirements</div>
                <div className="list">
                  {CODE_OF_CONDUCT_OPTIONS.map(item=>(
                    <label className="item" key={item} style={{cursor:'pointer'}}>
                      <span>{item}</span>
                      <input
                        type="checkbox"
                        checked={codeOfConductOptions.includes(item)}
                        onChange={e=>setCodeOfConductOptions(
                          e.target.checked
                            ? [...codeOfConductOptions,item]
                            : codeOfConductOptions.filter(x=>x!==item)
                        )}
                        style={{width:20,height:20}}
                      />
                    </label>
                  ))}
                </div>

                <div className="field" style={{marginTop:12}}>
                  <label>Code of Conduct link (optional)</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={codeOfConductUrl}
                    onChange={e=>setCodeOfConductUrl(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Upload Code of Conduct (optional)</label>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={e=>setCodeOfConductFile(e.target.files?.[0] || null)}
                  />
                  <small className="muted">Participants will be able to open this document before acknowledging it.</small>
                </div>
              </div>
            )}
          </div>
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
