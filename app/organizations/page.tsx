'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

type Requirement = {
  id:string;
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
  const [acknowledgments,setAcknowledgments]=useState<any[]>([]);
  const [openOrg,setOpenOrg]=useState<string|null>(null);
  const [msg,setMsg]=useState('');

  async function load(id:string){
    const [{data:o},{data:m},{data:c},{data:r},{data:roleData},{data:a}] = await Promise.all([
      supabase.rpc('list_active_organization_directory'),
      supabase.from('organization_memberships').select('*').eq('user_id',id).eq('status','active'),
      supabase.from('credentials').select('id,credential_type_id,expires_date,status'),
      supabase.from('organization_requirements')
        .select('id,organization_id,name,description,season,requirement_status,source_document_path,source_document_url,requires_acknowledgment,requirement_credential_types(credential_type_id),requirement_roles(role_id)')
        .eq('active',true)
        .order('name'),
      supabase.from('organization_roles').select('*').eq('is_active',true).order('name'),
      supabase.from('requirement_acknowledgments').select('*').eq('user_id',id)
    ]);

    setOrgs(o||[]);
    setMemberships(m||[]);
    setCredentials(c||[]);
    setAcknowledgments(a||[]);

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

  function requirementMet(req:Requirement){
    if(req.requires_acknowledgment){
      return acknowledgments.some(a=>a.requirement_id===req.id);
    }

    const accepted=(req.requirement_credential_types||[]).map(x=>x.credential_type_id);
    if(accepted.length===0) return false;

    return credentials.some(c=>{
      if(!accepted.includes(c.credential_type_id)) return false;
      if(c.status==='rejected') return false;
      if(c.expires_date && new Date(c.expires_date+'T23:59:59') < new Date()) return false;
      return true;
    });
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
      const reqs=(requirements[o.id]||[]).filter(r=>r.requirement_status==='required');
      const met=reqs.filter(requirementMet).length;
      out[o.id]={met,total:reqs.length,complete:reqs.length>0 && met===reqs.length};
    });
    return out;
  },[orgs,requirements,credentials,acknowledgments]);

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
                    const met=requirementMet(req);
                    return <div className="item" key={req.id}>
                      <div>
                        <strong>{req.name}</strong>
                        {req.description && <div className="muted">{req.description}</div>}
                        {req.season && <div className="muted">Season: {req.season}</div>}
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
                      <span className={'status '+(met?'green':'red')}>{met?'Met':'Missing'}</span>
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
