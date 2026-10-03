'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

type Requirement = {
  id:string;
  organization_id:string;
  name:string;
  description:string|null;
  season:string|null;
  requirement_status:string;
  requirement_credential_types:Array<{credential_type_id:string}>;
  requirement_roles?:Array<{role_id:string}>;
  source_document_path?:string|null;
  source_document_url?:string|null;
  requires_acknowledgment?:boolean;
};

export default function Organizations(){
  const router=useRouter();
  const [uid,setUid]=useState('');
  const [orgs,setOrgs]=useState<any[]>([]);
  const [memberships,setMemberships]=useState<any[]>([]);
  const [requirements,setRequirements]=useState<Record<string,Requirement[]>>({});
  const [roles,setRoles]=useState<Record<string,any[]>>({});
  const [selectedRole,setSelectedRole]=useState<Record<string,string>>({});
  const [credentials,setCredentials]=useState<any[]>([]);
  const [reviews,setReviews]=useState<any[]>([]);
  const [exemptions,setExemptions]=useState<any[]>([]);
  const [acknowledgments,setAcknowledgments]=useState<any[]>([]);
  const [complianceByOrg,setComplianceByOrg]=useState<Record<string,any[]>>({});
  const [openOrg,setOpenOrg]=useState<string|null>(null);
  const [msg,setMsg]=useState('');
  const [autoReviewDone,setAutoReviewDone]=useState(false);

  async function load(id:string){
    const [{data:o},{data:m},{data:c},{data:r},{data:roleData},{data:a},{data:reviewData},{data:exemptionData}] = await Promise.all([
      supabase.rpc('list_active_organization_directory'),
      supabase.from('organization_memberships').select('*').eq('user_id',id).eq('status','active'),
      supabase.from('credentials').select('id,credential_type_id,expires_date,status,document_path'),
      supabase.from('organization_requirements')
        .select('id,organization_id,name,description,season,requirement_status,source_document_path,source_document_url,requires_acknowledgment,requirement_credential_types(credential_type_id),requirement_roles(role_id)')
        .eq('active',true)
        .order('name'),
      supabase.from('organization_roles').select('*').eq('is_active',true).order('name'),
      supabase.from('requirement_acknowledgments').select('*').eq('user_id',id),
      supabase.from('credential_verifications')
        .select('credential_id,result,reviewed_at')
        .order('reviewed_at',{ascending:false}),
      supabase.from('credential_override_requests')
        .select('credential_id,requirement_id,organization_id,status,exemption_expires_date')
        .eq('user_id',id)
        .eq('status','approved')
    ]);

    setOrgs(o||[]);
    setMemberships(m||[]);
    setCredentials(c||[]);
    setReviews(reviewData||[]);
    setExemptions(exemptionData||[]);
    setAcknowledgments(a||[]);

    const complianceEntries=await Promise.all((m||[]).map(async (membership:any)=>{
      const {data}=await supabase.rpc('get_my_organization_compliance',{p_organization_id:membership.organization_id});
      return [membership.organization_id,data||[]] as const;
    }));
    setComplianceByOrg(Object.fromEntries(complianceEntries));

    const roleGrouped:Record<string,any[]> = {};
    (roleData||[]).forEach((role:any)=>{
      if(!roleGrouped[role.organization_id]) roleGrouped[role.organization_id]=[];
      roleGrouped[role.organization_id].push(role);
    });
    setRoles(roleGrouped);

    const grouped:Record<string,Requirement[]> = {};
    (r||[]).forEach((req:any)=>{
      if(!grouped[req.organization_id]) grouped[req.organization_id]=[];
      grouped[req.organization_id].push(req);
    });
    setRequirements(grouped);
  }

  useEffect(()=>{
    (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace('/login');return;}
      setUid(user.id);
      await load(user.id);
    })();
  },[router]);

  useEffect(()=>{
    if(!uid || autoReviewDone || memberships.length===0 || credentials.length===0) return;

    const needsReview=credentials.filter((credential:any)=>{
      if(!credential.document_path) return false;
      return !reviews.some((review:any)=>review.credential_id===credential.id);
    });

    if(needsReview.length===0){
      setAutoReviewDone(true);
      return;
    }

    (async()=>{
      setAutoReviewDone(true);
      const {data:sessionData}=await supabase.auth.getSession();
      const token=sessionData.session?.access_token;
      if(!token) return;

      for(const credential of needsReview){
        await fetch('/api/ai-review',{
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
          body:JSON.stringify({credentialId:credential.id})
        }).catch(()=>null);
      }

      await load(uid);
    })();
  },[uid,autoReviewDone,memberships,credentials,requirements,reviews]);

  async function connect(orgId:string){
    const roleId=selectedRole[orgId] || roles[orgId]?.[0]?.id || null;
    const role=roles[orgId]?.find((x:any)=>x.id===roleId);
    await supabase.from('organization_memberships').insert({
      organization_id:orgId,
      user_id:uid,
      role:role?.name || 'Participant',
      role_id:roleId,
      status:'active'
    });
    await load(uid);
    setOpenOrg(orgId);
  }

  async function disconnect(id:string){
    await supabase.from('organization_memberships').delete().eq('id',id);
    await load(uid);
  }

  function requirementRow(req:Requirement){
    const rows=complianceByOrg[req.organization_id]||[];
    return rows.find((row:any)=>row.requirement_id===req.id) || null;
  }

  function requirementStatus(req:Requirement){
    return requirementRow(req)?.status || 'missing';
  }

  function requirementMet(req:Requirement){
    return requirementStatus(req)==='met';
  }

  function credentialForRequirement(req:Requirement){
    const row=requirementRow(req);
    if(row?.credential_id) return credentials.find((credential:any)=>credential.id===row.credential_id) || null;

    const acceptedTypes=new Set((req.requirement_credential_types||[]).map(x=>x.credential_type_id));
    return credentials.find((credential:any)=>acceptedTypes.has(credential.credential_type_id)) || null;
  }

  function openCredentialAction(req:Requirement){
    const credential=credentialForRequirement(req);
    if(credential?.id){
      router.push(`/credentials?edit=${credential.id}&fromOrg=${req.organization_id}&requirement=${req.id}`);
      return;
    }

    const credentialTypeId=req.requirement_credential_types?.[0]?.credential_type_id || '';
    router.push(`/credentials?upload=1&type=${credentialTypeId}&fromOrg=${req.organization_id}&requirement=${req.id}`);
  }

  async function openRequirementDocument(req:Requirement){
    if(req.source_document_url){
      window.open(req.source_document_url,'_blank','noopener,noreferrer');
      return;
    }
    if(!req.source_document_path)return;

    const {data,error}=await supabase.storage
      .from('requirement-documents')
      .createSignedUrl(req.source_document_path,300);

    if(error || !data?.signedUrl){
      setMsg(error?.message || 'Could not open the document.');
      return;
    }
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }

  async function acknowledgeRequirement(req:Requirement){
    const typedName=window.prompt('Type your full name to acknowledge that you have read and agree to this requirement.');
    if(typedName===null)return;
    const name=typedName.trim();
    if(!name){
      setMsg('Enter your full name to acknowledge the requirement.');
      return;
    }

    const {error}=await supabase.from('requirement_acknowledgments').upsert({
      requirement_id:req.id,
      organization_id:(req as any).organization_id,
      user_id:uid,
      typed_name:name,
      acknowledged_at:new Date().toISOString()
    },{onConflict:'requirement_id,user_id'});

    if(error){
      setMsg(error.message);
      return;
    }

    setMsg('Acknowledgment recorded.');
    await load(uid);
  }

  const summaries=useMemo(()=>{
    const out:Record<string,{met:number,total:number,complete:boolean}>={};
    orgs.forEach(o=>{
      const membership=memberships.find((m:any)=>m.organization_id===o.id);
      const reqs=(requirements[o.id]||[]).filter((r:any)=>{
        if(r.requirement_status!=='required') return false;
        const assigned=r.requirement_roles||[];
        return assigned.length===0 || !membership?.role_id || assigned.some((x:any)=>x.role_id===membership.role_id);
      });
      const met=reqs.filter(requirementMet).length;
      out[o.id]={met,total:reqs.length,complete:reqs.length>0 && met===reqs.length};
    });
    return out;
  },[orgs,memberships,requirements,complianceByOrg]);

  return <AppShell>
    <div className="eyebrow">Organizations</div>
    <h1>Organization requirements</h1>
    <p className="muted">Connect to a program and ActiveClear will compare your existing credentials against that organization’s requirements.</p>
    {msg && <div className="notice" style={{marginTop:12}}>{msg}</div>}

    <div className="list" style={{marginTop:24}}>
      {orgs.map(o=>{
        const m=memberships.find(x=>x.organization_id===o.id);
        const allReqs=requirements[o.id]||[];
        const reqs=m?.role_id
          ? allReqs.filter((r:any)=>{
              const assigned=r.requirement_roles||[];
              return assigned.length===0 || assigned.some((x:any)=>x.role_id===m.role_id);
            })
          : allReqs;
        const summary=summaries[o.id]||{met:0,total:0,complete:false};
        const isOpen=openOrg===o.id;

        return <div key={o.id} className="card" style={{padding:0,overflow:'hidden'}}>
          <div className="item" style={{border:0,borderRadius:0}}>
            <div>
              <strong>{o.name}</strong>
              <div className="muted">{o.sport||'Program'}{o.governing_body?' · '+o.governing_body:''}</div>
              {m && <div className="muted">Role: {m.role || 'Not selected'}</div>}
              {m && summary.total>0 && (
                <div style={{marginTop:8}}>
                  <span className={'status '+(summary.complete?'green':'amber')}>
                    {summary.complete ? 'All requirements met' : `${summary.met} of ${summary.total} met`}
                  </span>
                </div>
              )}
            </div>

            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {m && reqs.length>0 && (
                <button className="btn secondary" onClick={()=>setOpenOrg(isOpen?null:o.id)}>
                  {isOpen?'Hide requirements':'View requirements'}
                </button>
              )}
              {!m && (roles[o.id]||[]).length>0 && (
                <select
                  value={selectedRole[o.id] || roles[o.id][0]?.id || ''}
                  onChange={e=>setSelectedRole({...selectedRole,[o.id]:e.target.value})}
                  style={{minWidth:180}}
                >
                  {(roles[o.id]||[]).map((role:any)=><option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              )}
              {m
                ? <button className="btn secondary" onClick={()=>disconnect(m.id)}>Disconnect</button>
                : <button className="btn green" onClick={()=>connect(o.id)}>Connect</button>}
            </div>
          </div>

          {m && isOpen && (
            <div style={{padding:'0 16px 16px'}}>
              {reqs.length===0 ? (
                <div className="notice">This organization’s requirements have not been configured yet.</div>
              ) : (
                <div className="list">
                  {reqs.map(req=>{
                    const row=requirementRow(req);
                    const status=row?.status || 'missing';
                    const met=status==='met';
                    const credential=credentialForRequirement(req);
                    const label=row?.exemption_id
                      ? 'Special Approval'
                      : status==='met'?'Met':status==='pending'?'Pending':status==='does_not_meet'?'Does Not Meet':status==='supporting_document_required'?'Supporting Document Required':'Missing';
                    const cls=status==='met'?'green':status==='pending'?'amber':'red';

                    return <div className="item" key={req.id}>
                      <div>
                        <strong>{req.name}</strong>
                        {req.description && <div className="muted">{req.description}</div>}
                        {req.season && <div className="muted">Season: {req.season}</div>}

                        {!met && !req.requires_acknowledgment && (
                          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
                            <button className="btn green" type="button" onClick={()=>openCredentialAction(req)}>
                              {credential ? 'Correct credential' : 'Upload credential'}
                            </button>
                          </div>
                        )}

                        {req.requires_acknowledgment && (
                          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
                            {(req.source_document_path || req.source_document_url) && (
                              <button className="btn secondary" type="button" onClick={()=>openRequirementDocument(req)}>
                                View document
                              </button>
                            )}
                            {!met && (
                              <button className="btn green" type="button" onClick={()=>acknowledgeRequirement(req)}>
                                Acknowledge
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <span className={'status '+cls}>{label}</span>
                    </div>
                  })}
                </div>
              )}

              {summary.total>0 && (
                <div className="notice" style={{marginTop:12}}>
                  <strong>{summary.complete ? 'You have met all required items for this organization.' : 'Action required.'}</strong>
                  <div className="muted">{summary.met} of {summary.total} required items currently satisfied.</div>
                </div>
              )}
            </div>
          )}
        </div>
      })}
    </div>
  </AppShell>
}
