'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

function statusFor(item:any){
  if(!item.expires_date) return {label:item.status || 'pending', cls:item.status==='verified'?'green':'amber'};
  const exp=new Date(item.expires_date+'T23:59:59');
  const now=new Date();
  const days=Math.ceil((exp.getTime()-now.getTime())/86400000);
  if(days<0) return {label:'Expired', cls:'red'};
  if(days<=60) return {label:`Expires in ${days} day${days===1?'':'s'}`, cls:'amber'};
  return {label:item.status==='verified'?'Verified':'Current', cls:item.status==='verified'?'green':'amber'};
}

export default function Home(){
  const router=useRouter();
  const [name,setName]=useState('');
  const [creds,setCreds]=useState<any[]>([]);
  const [orgs,setOrgs]=useState<any[]>([]);
  const [requirements,setRequirements]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [pct,setPct]=useState(0);

  useEffect(()=>{
    (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace('/login');return;}

      const [{data:p},{data:c},{data:m},{data:e},{data:med},{data:reqs}] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id',user.id).maybeSingle(),
        supabase.from('credentials')
          .select('id,credential_type_id,issuing_body,credential_number,issued_date,expires_date,status,credential_types(name,renewal_url)')
          .order('expires_date',{ascending:true}),
        supabase.from('organization_memberships').select('id,organization_id,role,organizations(name,sport,governing_body)').eq('status','active'),
        supabase.from('emergency_contacts').select('id').eq('user_id',user.id).limit(1),
        supabase.from('medical_profiles').select('user_id').eq('user_id',user.id).maybeSingle(),
        supabase.from('organization_requirements')
          .select('id,organization_id,name,description,season,requirement_status,requirement_credential_types(credential_type_id)')
          .eq('active',true)
          .order('name')
      ]);

      setName([p?.first_name,p?.last_name].filter(Boolean).join(' ')||user.email||'Member');
      setCreds(c||[]);
      setOrgs(m||[]);
      setRequirements(reqs||[]);

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

  function requirementMet(req:any){
    const accepted=(req.requirement_credential_types||[]).map((x:any)=>x.credential_type_id);
    if(accepted.length===0) return false;
    return creds.some((cred:any)=>{
      if(!accepted.includes(cred.credential_type_id)) return false;
      if(cred.status==='rejected') return false;
      if(cred.expires_date && new Date(cred.expires_date+'T23:59:59') < new Date()) return false;
      return true;
    });
  }

  if(loading) return <div className="shell">Loading ActiveClear…</div>;

  const overall=expired>0?'Action Required':expiring>0?'Expiring Soon':'Clear';

  return (
    <AppShell>
      <div className="hero">
        <section className="card">
          <div className="eyebrow">Profile Home</div>
          <h1>Welcome, {name.split(' ')[0]}</h1>
          <p className="muted">Your credentials stay with you. Organizations apply their own requirements to the same profile.</p>
          <span className={'status '+(overall==='Clear'?'green':overall==='Expiring Soon'?'amber':'red')}>
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
                const s=statusFor(item);
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
            const reqs=(requirements||[]).filter((r:any)=>r.organization_id===membership.organization_id && r.requirement_status==='required');
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
                    const ok=requirementMet(req);
                    return (
                      <div key={req.id} className="item">
                        <div>
                          <strong>{req.name}</strong>
                          {req.description && <div className="muted">{req.description}</div>}
                          {req.season && <div className="muted">Season: {req.season}</div>}
                        </div>
                        <span className={'status '+(ok?'green':'red')}>{ok?'Met':'Missing'}</span>
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
