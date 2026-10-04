'use client';

import { useEffect,useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

type Tab='people'|'teams'|'setup';

export default function OrganizationDashboard(){
  const router=useRouter();
  const [orgId,setOrgId]=useState('');
  const [org,setOrg]=useState<any>(null);
  const [roles,setRoles]=useState<any[]>([]);
  const [requirements,setRequirements]=useState<any[]>([]);
  const [roster,setRoster]=useState<any[]>([]);
  const [groups,setGroups]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<Tab>('people');
  const [search,setSearch]=useState('');
  const [groupFilter,setGroupFilter]=useState('');
  const [roleFilter,setRoleFilter]=useState('');
  const [statusFilter,setStatusFilter]=useState('all');

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    setOrgId(params.get('org')||'');
    const qTab=params.get('tab');
    if(qTab==='teams'||qTab==='setup'||qTab==='people') setTab(qTab);
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
        supabase.from('organization_requirements').select('id,name').eq('organization_id',orgId).eq('active',true).order('name'),
        supabase.rpc('list_organization_roster_detailed_for_admin',{p_organization_id:orgId}),
        supabase.from('organization_groups').select('*').eq('organization_id',orgId).eq('is_active',true)
          .order('division_name').order('level_name').order('group_name')
      ]);

      setOrg(o);
      setRoles(r||[]);
      setRequirements(reqs||[]);
      setRoster(rosterData||[]);
      setGroups(groupData||[]);
      setLoading(false);
    })();
  },[orgId,router]);

  const members=useMemo(
    ()=>roster.filter((r:any)=>r.membership_id && r.membership_status==='active'),
    [roster]
  );

  const compliant=members.filter((m:any)=>m.is_compliant).length;
  const needsAttention=members.filter((m:any)=>(m.needs_attention_count||0)>0).length;
  const pending=members.filter((m:any)=>(m.pending_count||0)>0).length;
  const expiring=members.filter((m:any)=>(m.expiring_soon_count||0)>0).length;

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return members.filter((m:any)=>{
      const text=[m.first_name,m.last_name,m.email,m.membership_role]
        .filter(Boolean).join(' ').toLowerCase();
      const matchesSearch=!q || text.includes(q);
      const matchesGroup=!groupFilter || (m.groups||[]).some((g:any)=>g.id===groupFilter);
      const matchesRole=!roleFilter || m.role_id===roleFilter;
      const matchesStatus=statusFilter==='all'
        || (statusFilter==='compliant' && m.is_compliant)
        || (statusFilter==='attention' && (m.needs_attention_count||0)>0)
        || (statusFilter==='pending' && (m.pending_count||0)>0)
        || (statusFilter==='expiring' && (m.expiring_soon_count||0)>0);
      return matchesSearch && matchesGroup && matchesRole && matchesStatus;
    });
  },[members,search,groupFilter,roleFilter,statusFilter]);

  const groupSummary=useMemo(()=>groups.map((g:any)=>{
    const people=members.filter((m:any)=>(m.groups||[]).some((x:any)=>x.id===g.id));
    return {
      ...g,
      total:people.length,
      compliant:people.filter((m:any)=>m.is_compliant).length,
      attention:people.filter((m:any)=>(m.needs_attention_count||0)>0).length,
      pending:people.filter((m:any)=>(m.pending_count||0)>0).length
    };
  }),[groups,members]);

  function changeTab(next:Tab){
    setTab(next);
    const url=new URL(window.location.href);
    url.searchParams.set('tab',next);
    window.history.replaceState({},'',url.toString());
  }

  function selectStatus(status:string){
    setTab('people');
    setStatusFilter(status);
  }

  if(loading) return <div className="shell">Loading organization…</div>;
  if(!org) return <div className="shell">Organization not found.</div>;

  const bodies=org.governing_bodies?.length ? org.governing_bodies.join(' · ') : org.governing_body;
  const divisionLabel=org.division_label || 'Division';
  const levelLabel=org.level_label || 'Level';
  const groupLabel=org.group_label || 'Team / Group';

  return <AppShell>
    <div className="eyebrow">Organization home</div>
    <h1 style={{marginBottom:8}}>{org.name}</h1>
    <p className="muted" style={{marginTop:0}}>{[org.organization_type,org.sport,bodies].filter(Boolean).join(' · ')}</p>

    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:18}}>
      <button className={'btn '+(tab==='people'?'green':'secondary')} onClick={()=>changeTab('people')}>People</button>
      <button className={'btn '+(tab==='teams'?'green':'secondary')} onClick={()=>changeTab('teams')}>{groupLabel}s</button>
      <button className={'btn '+(tab==='setup'?'green':'secondary')} onClick={()=>changeTab('setup')}>Organization setup</button>
    </div>

    {tab==='people' && <>
      <section className="card" style={{marginTop:18,padding:14}}>
        <div className="summaryGrid">
          {[
            ['Active people',members.length,'all'],
            ['Compliant',compliant,'compliant'],
            ['Needs attention',needsAttention,'attention'],
            ['Pending review',pending,'pending'],
            ['Expiring ≤60 days',expiring,'expiring']
          ].map(([label,value,status]:any)=><button
            key={label}
            type="button"
            onClick={()=>selectStatus(status)}
            style={{
              border:0,background:statusFilter===status?'#eef7f1':'transparent',
              borderRadius:10,padding:'10px 12px',textAlign:'left',cursor:'pointer'
            }}
          >
            <div className="muted" style={{fontSize:13}}>{label}</div>
            <div style={{fontSize:30,fontWeight:800,marginTop:3}}>{value}</div>
          </button>)}
        </div>
      </section>

      <section className="card" style={{marginTop:18,padding:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div>
            <h2 style={{margin:'0 0 4px'}}>People & compliance</h2>
            <div className="muted">All members are shown here. Use the filters to sort the roster.</div>
          </div>
          <div className="muted">{filtered.length} of {members.length} people</div>
        </div>

        <div className="filterGrid" style={{marginTop:14}}>
          <input placeholder="Search name or email" value={search} onChange={e=>setSearch(e.target.value)}/>
          <select value={groupFilter} onChange={e=>setGroupFilter(e.target.value)}>
            <option value="">All {groupLabel}s</option>
            {groups.map((g:any)=><option key={g.id} value={g.id}>
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
      </section>

      <section className="card" style={{marginTop:18,padding:0,overflow:'hidden'}}>
        <div className="rosterHeader">
          <div>Member</div>
          <div>{groupLabel}</div>
          <div>Role</div>
          <div>Needs / status</div>
          <div>Compliance</div>
        </div>

        {filtered.map((m:any)=>{
          const name=[m.first_name,m.last_name].filter(Boolean).join(' ') || m.email || 'Participant';
          const status=m.is_compliant ? 'Compliant' : (m.pending_count||0)>0 ? 'Pending' : 'Needs attention';
          const cls=m.is_compliant ? 'green' : (m.pending_count||0)>0 ? 'amber' : 'red';
          const needs=(m.needs_items||[]).map((x:any)=>x.name);
          const pendingItems=(m.pending_items||[]).map((x:any)=>x.name);
          const expiringItems=(m.expiring_items||[]);

          return <div className="rosterRow" key={m.user_id}>
            <div>
              <a href={`/organization-member?org=${orgId}&user=${m.user_id}`} style={{fontWeight:800,textDecoration:'underline',textUnderlineOffset:3}}>{name}</a>
              {m.email && <div className="muted small">{m.email}</div>}
            </div>
            <div className="small">
              {(m.groups||[]).length
                ? (m.groups||[]).map((g:any)=><div key={g.id}>
                    {[g.division_name,g.level_name,g.group_name].filter(Boolean).join(' / ')}
                  </div>)
                : <span className="muted">Not assigned</span>}
            </div>
            <div className="small">{m.membership_role || 'Participant'}</div>
            <div className="small">
              {needs.length>0 && <div><strong>Needs:</strong> {needs.join(', ')}</div>}
              {pendingItems.length>0 && <div><strong>Pending:</strong> {pendingItems.join(', ')}</div>}
              {expiringItems.length>0 && <div><strong>Expiring:</strong> {expiringItems.map((x:any)=>x.expires ? `${x.name} (${x.expires})` : x.name).join(', ')}</div>}
              {needs.length===0 && pendingItems.length===0 && expiringItems.length===0 && <span className="muted">No action needed</span>}
            </div>
            <div><span className={'status '+cls}>{status}</span></div>
          </div>
        })}

        {filtered.length===0 && <div style={{padding:22}} className="muted">No members match these filters.</div>}
      </section>
    </>}

    {tab==='teams' && <>
      <section className="card" style={{marginTop:18}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div>
            <h2 style={{margin:'0 0 4px'}}>{groupLabel}s</h2>
            <div className="muted">Review and organize by {divisionLabel.toLowerCase()} → {levelLabel.toLowerCase()} → {groupLabel.toLowerCase()}.</div>
          </div>
          <a className="btn green" href={`/organization-groups?org=${orgId}`}>Manage {groupLabel}s</a>
        </div>

        <div className="list" style={{marginTop:16}}>
          {groupSummary.map((g:any)=><div className="item" key={g.id}>
            <div>
              <strong>{g.group_name}</strong>
              <div className="muted small">{[g.division_name,g.level_name,g.season].filter(Boolean).join(' · ') || 'No additional classification'}</div>
            </div>
            <div style={{textAlign:'right'}} className="small">
              <strong>{g.total} people</strong>
              <div className="muted">{g.compliant} compliant · {g.attention} attention · {g.pending} pending</div>
            </div>
          </div>)}
          {groups.length===0 && <div className="muted">No {groupLabel.toLowerCase()}s created yet. They will normally be created as people register.</div>}
        </div>
      </section>
    </>}

    {tab==='setup' && <>
      <div className="grid three" style={{marginTop:18}}>
        <section className="card">
          <h2>Club profile</h2>
          <p className="muted">Organization details, contacts, sport, affiliations, website, and address.</p>
          <a className="btn green" href={`/organization-profile?org=${orgId}`}>Edit club profile</a>
        </section>
        <section className="card">
          <h2>Roles & requirements</h2>
          <div style={{fontSize:32,fontWeight:800}}>{roles.length}</div>
          <p className="muted">{requirements.length} active requirements</p>
          <a className="btn green" href={`/organization-manage?org=${orgId}`}>Manage roles & requirements</a>
        </section>
        <section className="card">
          <h2>{groupLabel} structure</h2>
          <div style={{fontSize:32,fontWeight:800}}>{groups.length}</div>
          <p className="muted">Edit hierarchy labels or correct groups created during registration.</p>
          <a className="btn green" href={`/organization-groups?org=${orgId}`}>Manage hierarchy</a>
        </section>
      </div>
    </>}

    <style jsx>{`
      .summaryGrid{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:8px}
      .filterGrid{display:grid;grid-template-columns:2fr repeat(3,1fr);gap:10px}
      .rosterHeader,.rosterRow{display:grid;grid-template-columns:1.4fr 1.35fr .9fr 2fr .85fr;gap:14px;align-items:start}
      .rosterHeader{padding:11px 16px;background:#f3f5f2;border-bottom:1px solid #dfe4df;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
      .rosterRow{padding:14px 16px;border-bottom:1px solid #e6e9e5}
      .rosterRow:last-child{border-bottom:0}
      .small{font-size:13px;line-height:1.45}
      @media(max-width:900px){
        .summaryGrid{grid-template-columns:1fr 1fr}
        .filterGrid{grid-template-columns:1fr}
        .rosterHeader{display:none}
        .rosterRow{grid-template-columns:1fr}
      }
    `}</style>
  </AppShell>;
}
