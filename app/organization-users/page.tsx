'use client';

import { useEffect,useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function OrganizationUsers(){
  const router=useRouter();
  const [orgId,setOrgId]=useState('');
  const [org,setOrg]=useState<any>(null);
  const [roster,setRoster]=useState<any[]>([]);
  const [groups,setGroups]=useState<any[]>([]);
  const [roles,setRoles]=useState<any[]>([]);
  const [search,setSearch]=useState('');
  const [groupFilter,setGroupFilter]=useState('');
  const [roleFilter,setRoleFilter]=useState('');
  const [statusFilter,setStatusFilter]=useState('all');
  const [view,setView]=useState<'list'|'groups'>('list');

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    setOrgId(params.get('org')||'');
    setGroupFilter(params.get('group')||'');
  },[]);

  useEffect(()=>{
    if(!orgId)return;
    (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace('/login');return;}
      const {data:admin}=await supabase.from('organization_admins')
        .select('organization_id').eq('organization_id',orgId).eq('user_id',user.id).maybeSingle();
      if(!admin){router.replace('/organization');return;}

      const [{data:o},{data:r},{data:g},{data:roleData}] = await Promise.all([
        supabase.from('organizations').select('*').eq('id',orgId).maybeSingle(),
        supabase.rpc('list_organization_roster_for_admin',{p_organization_id:orgId}),
        supabase.from('organization_groups').select('*').eq('organization_id',orgId).eq('is_active',true)
          .order('division_name').order('level_name').order('group_name'),
        supabase.from('organization_roles').select('id,name').eq('organization_id',orgId).eq('is_active',true).order('name')
      ]);
      setOrg(o);
      setRoster(r||[]);
      setGroups(g||[]);
      setRoles(roleData||[]);
    })();
  },[orgId,router]);

  const members=useMemo(()=>roster.filter((r:any)=>r.membership_id && r.membership_status==='active'),[roster]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return members.filter((m:any)=>{
      const name=[m.first_name,m.last_name,m.email].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch=!q || name.includes(q);
      const matchesGroup=!groupFilter || (m.groups||[]).some((g:any)=>g.id===groupFilter);
      const matchesRole=!roleFilter || m.role_id===roleFilter || m.membership_role===roleFilter;
      const matchesStatus=statusFilter==='all'
        || (statusFilter==='compliant' && m.is_compliant)
        || (statusFilter==='attention' && (m.needs_attention_count||0)>0)
        || (statusFilter==='pending' && (m.pending_count||0)>0)
        || (statusFilter==='expiring' && (m.expiring_soon_count||0)>0);
      return matchesSearch && matchesGroup && matchesRole && matchesStatus;
    });
  },[members,search,groupFilter,roleFilter,statusFilter]);

  const grouped=useMemo(()=>groups.map((g:any)=>({
    ...g,
    people:filtered.filter((m:any)=>(m.groups||[]).some((x:any)=>x.id===g.id))
  })).filter((g:any)=>g.people.length>0),[groups,filtered]);

  if(!org)return <div className="shell">Loading roster…</div>;

  const groupLabel=org.group_label || 'Team / Group';
  const divisionLabel=org.division_label || 'Division';
  const levelLabel=org.level_label || 'Level';

  function PersonRow({m}:{m:any}){
    const name=[m.first_name,m.last_name].filter(Boolean).join(' ') || m.email || 'Participant';
    const status=m.is_compliant ? 'Compliant' : (m.pending_count||0)>0 ? 'Pending review' : 'Needs attention';
    const cls=m.is_compliant ? 'green' : (m.pending_count||0)>0 ? 'amber' : 'red';
    return <div className="item" style={{padding:12,alignItems:'flex-start'}}>
      <div style={{minWidth:0}}>
        <strong>{name}</strong>
        <div className="muted" style={{fontSize:13,marginTop:4}}>
          {m.membership_role || 'Participant'}
          {(m.groups||[]).length ? ' · '+(m.groups||[]).map((g:any)=>[g.division_name,g.level_name,g.group_name].filter(Boolean).join(' / ')).join(', ') : ''}
        </div>
        {!m.is_compliant && <div style={{fontSize:12,marginTop:6}}>
          {(m.needs_attention_count||0)>0 && <span style={{marginRight:10}}>{m.needs_attention_count} need attention</span>}
          {(m.pending_count||0)>0 && <span style={{marginRight:10}}>{m.pending_count} pending</span>}
          {(m.expiring_soon_count||0)>0 && <span>{m.expiring_soon_count} expiring soon</span>}
        </div>}
      </div>
      <span className={'status '+cls}>{status}</span>
    </div>
  }

  return <AppShell>
    <div className="eyebrow">People & compliance</div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
      <div>
        <h1 style={{marginBottom:8}}>{org.name}</h1>
        <p className="muted" style={{margin:0}}>Filter the roster by {divisionLabel.toLowerCase()}, {levelLabel.toLowerCase()}, {groupLabel.toLowerCase()}, role, or compliance status.</p>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <a className="btn secondary" href={`/organization-groups?org=${orgId}`}>Manage {groupLabel}s</a>
        <a className="btn secondary" href={`/organization-dashboard?org=${orgId}`}>Organization home</a>
      </div>
    </div>

    <section className="card" style={{marginTop:24,padding:16}}>
      <div style={{display:'grid',gridTemplateColumns:'2fr repeat(3,1fr)',gap:10}}>
        <input placeholder="Search name or email" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select value={groupFilter} onChange={e=>setGroupFilter(e.target.value)}>
          <option value="">All {groupLabel}s</option>
          {groups.map((g:any)=><option value={g.id} key={g.id}>
            {[g.division_name,g.level_name,g.group_name].filter(Boolean).join(' · ')}
          </option>)}
        </select>
        <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {roles.map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All compliance</option>
          <option value="compliant">Compliant</option>
          <option value="attention">Needs attention</option>
          <option value="pending">Pending review</option>
          <option value="expiring">Expiring ≤60 days</option>
        </select>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginTop:12,flexWrap:'wrap'}}>
        <div className="muted">{filtered.length} of {members.length} people</div>
        <div style={{display:'flex',gap:8}}>
          <button className={'btn '+(view==='list'?'green':'secondary')} type="button" onClick={()=>setView('list')}>List</button>
          <button className={'btn '+(view==='groups'?'green':'secondary')} type="button" onClick={()=>setView('groups')}>By {groupLabel}</button>
        </div>
      </div>
    </section>

    {view==='list' ? <section className="card" style={{marginTop:20}}>
      <h2 style={{marginTop:0}}>Roster</h2>
      <div className="list">
        {filtered.map((m:any)=><PersonRow key={m.user_id} m={m}/>)}
        {filtered.length===0 && <div className="muted">No people match these filters.</div>}
      </div>
    </section> : <div style={{display:'grid',gap:18,marginTop:20}}>
      {grouped.map((g:any)=><section className="card" key={g.id}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
          <div>
            <h2 style={{margin:'0 0 4px'}}>{g.group_name}</h2>
            <div className="muted">{[g.division_name,g.level_name,g.season].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{fontWeight:700}}>{g.people.length} people</div>
        </div>
        <div className="list" style={{marginTop:14}}>
          {g.people.map((m:any)=><PersonRow key={m.user_id} m={m}/>)}
        </div>
      </section>)}
      {grouped.length===0 && <section className="card"><div className="muted">No grouped results match these filters.</div></section>}
    </div>}

    <style jsx>{`
      @media(max-width:900px){
        section.card > div:first-child[style*="grid-template-columns"]{grid-template-columns:1fr !important}
      }
    `}</style>
  </AppShell>;
}
