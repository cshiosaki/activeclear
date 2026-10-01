'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function Home(){
  const router=useRouter();
  const [name,setName]=useState('');
  const [creds,setCreds]=useState<any[]>([]);
  const [orgs,setOrgs]=useState<any[]>([]);
  const [requirements,setRequirements]=useState<any[]>([]);
  const [reviews,setReviews]=useState<any[]>([]);
  const [exemptions,setExemptions]=useState<any[]>([]);
  const [complianceByOrg,setComplianceByOrg]=useState<Record<string,any[]>>({});
  const [loading,setLoading]=useState(true);
  const [pct,setPct]=useState(0);

  useEffect(()=>{
    (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace('/login');return;}

      const [{data:p},{data:c},{data:m},{data:e},{data:med},{data:reqs},{data:reviewData},{data:exemptionData}] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id',user.id).maybeSingle(),
        supabase.from('credentials')
          .select('id,credential_type_id,issuing_body,credential_number,issued_date,expires_date,status,document_path,credential_types(name,renewal_url)')
          .order('expires_date',{ascending:true}),
        supabase.from('organization_memberships').select('id,organization_id,role,role_id,organizations(name,sport,governing_body)').eq('status','active'),
        supabase.from('emergency_contacts').select('id').eq('user_id',user.id).limit(1),
        supabase.from('medical_profiles').select('user_id').eq('user_id',user.id).maybeSingle(),
        supabase.from('organization_requirements')
          .select('id,organization_id,name,description,season,requirement_status,requires_acknowledgment,requirement_credential_types(credential_type_id),requirement_roles(role_id)')
          .eq('active',true)
          .order('name'),
        supabase.from('credential_requirement_reviews')
          .select('credential_id,requirement_id,result,reviewed_at')
          .eq('user_id',user.id)
          .order('reviewed_at',{ascending:false}),
        supabase.from('credential_override_requests')
          .select('credential_id,requirement_id,organization_id,status,exemption_expires_date')
          .eq('user_id',user.id)
          .eq('status','approved')
      ]);

      setName([p?.first_name,p?.last_name].filter(Boolean).join(' ')||user.email||'Member');
      setCreds(c||[]);
      setOrgs(m||[]);
      setRequirements(reqs||[]);
      setReviews(reviewData||[]);
      setExemptions(exemptionData||[]);

      const complianceEntries=await Promise.all((m||[]).map(async (membership:any)=>{
        const {data}=await supabase.rpc('get_my_organization_compliance',{p_organization_id:membership.organization_id});
        return [membership.organization_id,data||[]] as const;
      }));
      setComplianceByOrg(Object.fromEntries(complianceEntries));

      const checks=[p?.first_name,p?.last_name,p?.phone,p?.date_of_birth,p?.address_line1,(e||[]).length>0,!!med];
      setPct(Math.round(checks.filter(Boolean).length/checks.length*100));
      setLoading(false);
    })();
  },[router]);

  const expiring=useMemo(
    ()=>creds.filter(c=>c.expires_date&&((new Date(c.expires_date).getTime()-Date.now())/86400000)>=0&&((new Date(c.expires_date).getTime()-Date.now())/86400000)<=60).length,
    [creds]
  );
  const expired=useMemo(
    ()=>creds.filter(c=>c.expires_date&&new Date(c.expires_date)<new Date()).length,
    [creds]
  );

  function requirementStatus(req:any){
    const rows=complianceByOrg[req.organization_id]||[];
    return rows.find((row:any)=>row.requirement_id===req.id)?.status || 'missing';
  }

  function requirementMet(req:any){
    return requirementStatus(req)==='met';
  }

  function credentialStatus(item:any){
    const itemReviews=reviews.filter((r:any)=>r.credential_id===item.id);
    const hasFailure=itemReviews.some((r:any)=>['does_not_meet_requirement','wrong_credential_type','unreadable'].includes(r.result));
    const hasApproval=itemReviews.some((r:any)=>r.result==='meets_requirement');

    if(!item.document_path) return {label:'Supporting Document Required',cls:'red'};
    if(hasFailure) return {label:'Does Not Meet',cls:'red'};
    if(hasApproval) return {label:'Approved',cls:'green'};
    return {label:'Pending',cls:'amber'};
  }

  if(loading) return <div className="shell">Loading ActiveClear…</div>;

  const complianceStatuses=Object.values(complianceByOrg).flat().map((row:any)=>row.status);
  const hasComplianceAction=complianceStatuses.some((status:any)=>['missing','does_not_meet','supporting_document_required'].includes(status));
  const hasCompliancePending=complianceStatuses.some((status:any)=>status==='pending');
  const overall=hasComplianceAction
    ? 'Action Required'
    : hasCompliancePending
      ? 'Pending'
      : expiring>0
        ? 'Expiring Soon'
        : 'Clear';

  return (
    <AppShell>
      <div className="hero">
        <section className="card">
          <div className="eyebrow">Profile Home</div>
          <h1>Welcome, {name.split(' ')[0]}</h1>
          <p className="muted">Your credentials stay with you. Organizations apply their own requirements to the same profile.</p>
          <span className={'status '+(overall==='Clear'?'green':overall==='Expiring Soon'||overall==='Pending'?'amber':'red')}>
            ActiveClear Status: {overall}
          </span>
        </section>

        <section className="card">
          <div className="muted">Profile completeness</div>
          <div className="metric">{pct}%</div>
          <div className="progress"><div style={{width:pct+'%'}}/></div>
        </section>
      </div>

      <h2 className="section-title">At a glance</h2>
      <div className="grid three">
        <div className="card"><div className="muted">Credentials</div><div className="metric">{creds.length}</div></div>
        <div className="card"><div className="muted">Expiring in 60 days</div><div className="metric">{expiring}</div></div>
        <div className="card"><div className="muted">Connected organizations</div><div className="metric">{orgs.length}</div></div>
      </div>

      <details className="card" style={{marginTop:30}}>
        <summary style={{cursor:'pointer',fontSize:24,fontWeight:800,listStyle:'none',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>My certifications & credentials</span>
          <span className="muted" style={{fontSize:16}}>{creds.length} total</span>
        </summary>

        <div style={{marginTop:20}}>
          {creds.length===0 ? (
            <p className="muted">No credentials uploaded yet.</p>
          ) : (
            <div className="list">
              {creds.map(item=>{
                const s=credentialStatus(item);
                const renewal=item.credential_types?.renewal_url;
                return (
                  <div
                    className="item"
                    key={item.id}
                    style={{
                      display:'grid',
                      gridTemplateColumns:'minmax(260px,1.6fr) minmax(150px,.7fr) auto',
                      gap:24,
                      alignItems:'center'
                    }}
                  >
                    <div>
                      <strong>{item.credential_types?.name || 'Credential'}</strong>
                      {item.credential_number && <div className="muted">Membership / ID #{item.credential_number}</div>}
                      {item.issuing_body && <div className="muted">{item.issuing_body}</div>}
                    </div>

                    <div>
                      <div className="muted" style={{fontSize:12,textTransform:'uppercase',letterSpacing:'.08em'}}>Expiration</div>
                      <div style={{fontWeight:700,marginTop:3}}>
                        {item.expires_date || 'No expiration entered'}
                      </div>
                    </div>

                    <div style={{display:'grid',gridTemplateColumns:'auto 150px',alignItems:'center',gap:10,minWidth:260}}>
                      <span className={'status '+s.cls} style={{justifySelf:'end'}}>{s.label}</span>
                      {renewal ? (
                        <a className="btn secondary" href={renewal} target="_blank" rel="noreferrer" style={{textAlign:'center'}}>
                          Renew / Update
                        </a>
                      ) : (
                        <span className="btn secondary" style={{textAlign:'center',opacity:.55,cursor:'default'}}>
                          No link
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </details>

      <details className="card" style={{marginTop:20}}>
        <summary style={{cursor:'pointer',fontSize:24,fontWeight:800,listStyle:'none',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>My organizations</span>
          <span className="muted" style={{fontSize:16}}>{orgs.length} connected</span>
        </summary>

        <div style={{marginTop:20}} className="list">
          {orgs.length===0 ? (
            <p className="muted">No organizations connected yet.</p>
          ) : orgs.map((membership:any)=>{
            const org:any = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations;
            const reqs=(requirements||[]).filter((r:any)=>{
              if(r.organization_id!==membership.organization_id || r.requirement_status!=='required') return false;
              const assigned=r.requirement_roles||[];
              return assigned.length===0 || !membership.role_id || assigned.some((x:any)=>x.role_id===membership.role_id);
            });
            const met=reqs.filter(requirementMet).length;
            const complete=reqs.length>0 && met===reqs.length;

            return (
              <details key={membership.id} className="item" style={{display:'block'}}>
                <summary style={{cursor:'pointer',listStyle:'none',display:'flex',justifyContent:'space-between',alignItems:'center',gap:16}}>
                  <div>
                    <strong>{org?.name || 'Organization'}</strong>
                    <div className="muted">
                      {[org?.sport,org?.governing_body].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className={'status '+(complete?'green':reqs.length?'amber':'red')}>
                    {reqs.length===0 ? 'Requirements not set' : complete ? 'All requirements met' : `${met} of ${reqs.length} met`}
                  </span>
                </summary>

                <div className="list" style={{marginTop:14}}>
                  {reqs.length===0 ? (
                    <div className="notice">Requirements have not been configured for this organization yet.</div>
                  ) : reqs.map((req:any)=>{
                    const status=requirementStatus(req);
                    const label=status==='met'?'Met':status==='pending'?'Pending':status==='does_not_meet'?'Does Not Meet':'Missing';
                    const cls=status==='met'?'green':status==='pending'?'amber':'red';
                    return (
                      <div key={req.id} className="item">
                        <div>
                          <strong>{req.name}</strong>
                          {req.description && <div className="muted">{req.description}</div>}
                          {req.season && <div className="muted">Season: {req.season}</div>}
                        </div>
                        <span className={'status '+cls}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </details>
    </AppShell>
  );
}
