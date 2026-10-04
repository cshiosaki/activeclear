'use client';

import { useEffect,useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function OrganizationDashboard(){
  const router=useRouter();
  const [orgId,setOrgId]=useState('');
  const [org,setOrg]=useState<any>(null);
  const [roles,setRoles]=useState<any[]>([]);
  const [requirements,setRequirements]=useState<any[]>([]);
  const [roster,setRoster]=useState<any[]>([]);
  const [groups,setGroups]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    setOrgId(new URLSearchParams(window.location.search).get('org') || '');
  },[]);

  useEffect(()=>{
    if(!orgId)return;
    (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace('/login');return;}

      const {data:admin}=await supabase.from('organization_admins')
        .select('organization_id')
        .eq('organization_id',orgId)
        .eq('user_id',user.id)
        .maybeSingle();

      if(!admin){router.replace('/organization');return;}

      const [{data:o},{data:r},{data:reqs},{data:rosterData},{data:groupData}] = await Promise.all([
        supabase.from('organizations').select('*').eq('id',orgId).maybeSingle(),
        supabase.from('organization_roles').select('*').eq('organization_id',orgId).eq('is_active',true).order('name'),
        supabase.from('organization_requirements').select('id').eq('organization_id',orgId).eq('active',true),
        supabase.rpc('list_organization_roster_for_admin',{p_organization_id:orgId}),
        supabase.from('organization_groups').select('*').eq('organization_id',orgId).eq('is_active',true).order('division_name').order('level_name').order('group_name')
      ]);

      setOrg(o);
      setRoles(r||[]);
      setRequirements(reqs||[]);
      setRoster(rosterData||[]);
      setGroups(groupData||[]);
      setLoading(false);
    })();
  },[orgId,router]);

  const members=useMemo(()=>roster.filter((r:any)=>r.membership_id && r.membership_status==='active'),[roster]);
  const compliant=members.filter((r:any)=>r.is_compliant).length;
  const needsAttention=members.filter((r:any)=>(r.needs_attention_count||0)>0).length;
  const pending=members.filter((r:any)=>(r.pending_count||0)>0).length;
  const expiring=members.filter((r:any)=>(r.expiring_soon_count||0)>0).length;

  const groupSummary=useMemo(()=>{
    return groups.map((g:any)=>{
      const assigned=members.filter((m:any)=>(m.groups||[]).some((x:any)=>x.id===g.id));
      return {
        ...g,
        total:assigned.length,
        compliant:assigned.filter((m:any)=>m.is_compliant).length,
        attention:assigned.filter((m:any)=>(m.needs_attention_count||0)>0).length
      };
    });
  },[groups,members]);

  if(loading) return <div className="shell">Loading organization…</div>;
  if(!org) return <div className="shell">Organization not found.</div>;

  const bodies=org.governing_bodies?.length ? org.governing_bodies.join(' · ') : org.governing_body;
  const divisionLabel=org.division_label || 'Division';
  const levelLabel=org.level_label || 'Level';
  const groupLabel=org.group_label || 'Team / Group';

  return <AppShell>
    <div className="eyebrow">Organization home</div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
      <div>
        <h1 style={{marginBottom:8}}>{org.name}</h1>
        <p className="muted" style={{margin:0}}>{[org.organization_type,org.sport,bodies].filter(Boolean).join(' · ')}</p>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <a className="btn secondary" href={`/organization-profile?org=${orgId}`}>Club profile</a>
        <a className="btn secondary" href={`/organization-manage?org=${orgId}`}>Roles & requirements</a>
        <a className="btn green" href={`/organization-groups?org=${orgId}`}>Manage {groupLabel}s</a>
      </div>
    </div>

    <section className="card" style={{marginTop:20,padding:18}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(120px,1fr))',gap:12}}>
        {[
          ['Active people',members.length],
          ['Compliant',compliant],
          ['Needs attention',needsAttention],
          ['Pending review',pending],
          ['Expiring ≤60 days',expiring]
        ].map(([label,value]:any)=><div key={label} style={{padding:'8px 10px'}}>
          <div className="muted" style={{fontSize:13}}>{label}</div>
          <div style={{fontSize:32,fontWeight:800,marginTop:4}}>{value}</div>
        </div>)}
      </div>
    </section>

    <div className="grid two" style={{marginTop:20}}>
      <section className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
          <div>
            <h2 style={{margin:'0 0 4px'}}>People & compliance</h2>
            <div className="muted">{members.length} active participant{members.length===1?'':'s'}</div>
          </div>
          <a className="btn green" href={`/organization-users?org=${orgId}`}>Open roster</a>
        </div>

        <div className="list" style={{marginTop:16}}>
          {members.slice(0,6).map((m:any)=>{
            const name=[m.first_name,m.last_name].filter(Boolean).join(' ') || m.email || 'Participant';
            const status=m.is_compliant ? 'Compliant' : (m.pending_count||0)>0 ? 'Pending' : 'Needs attention';
            const cls=m.is_compliant ? 'green' : (m.pending_count||0)>0 ? 'amber' : 'red';
            return <div className="item" key={m.user_id} style={{padding:12}}>
              <div>
                <strong>{name}</strong>
                <div className="muted" style={{fontSize:13,marginTop:3}}>
                  {m.membership_role || 'Participant'}
                  {(m.groups||[]).length ? ' · '+(m.groups||[]).map((g:any)=>g.group_name).join(', ') : ''}
                </div>
              </div>
              <span className={'status '+cls}>{status}</span>
            </div>
          })}
          {members.length===0 && <div className="muted">No active participants yet.</div>}
        </div>
      </section>

      <section className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
          <div>
            <h2 style={{margin:'0 0 4px'}}>{groupLabel}s</h2>
            <div className="muted">Organize by {divisionLabel.toLowerCase()} → {levelLabel.toLowerCase()} → {groupLabel.toLowerCase()}</div>
          </div>
          <a className="btn secondary" href={`/organization-groups?org=${orgId}`}>Manage</a>
        </div>

        <div className="list" style={{marginTop:16}}>
          {groupSummary.slice(0,6).map((g:any)=><a className="item" key={g.id} href={`/organization-users?org=${orgId}&group=${g.id}`} style={{padding:12}}>
            <div>
              <strong>{g.group_name}</strong>
              <div className="muted" style={{fontSize:13,marginTop:3}}>
                {[g.division_name,g.level_name,g.season].filter(Boolean).join(' · ') || 'No additional classification'}
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <strong>{g.total}</strong>
              <div className="muted" style={{fontSize:12}}>{g.compliant} compliant{g.attention ? ` · ${g.attention} attention` : ''}</div>
            </div>
          </a>)}
          {groups.length===0 && <div className="muted">No {groupLabel.toLowerCase()}s created yet.</div>}
        </div>
      </section>
    </div>

    <section className="card" style={{marginTop:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div>
          <h2 style={{margin:'0 0 4px'}}>Organization setup</h2>
          <div className="muted">{roles.length} role{roles.length===1?'':'s'} · {requirements.length} requirement{requirements.length===1?'':'s'} · {groups.length} active {groupLabel.toLowerCase()}{groups.length===1?'':'s'}</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <a className="btn secondary" href={`/organization-manage?org=${orgId}`}>Edit roles & requirements</a>
          <a className="btn secondary" href={`/organization-groups?org=${orgId}`}>Edit hierarchy</a>
        </div>
      </div>
    </section>

    <style jsx>{`
      @media(max-width:800px){
        section:first-of-type > div{grid-template-columns:1fr 1fr !important}
      }
    `}</style>
  </AppShell>;
}
