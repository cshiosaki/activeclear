'use client';

import { useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function OrganizationDashboard(){
  const router=useRouter();
  const [orgId,setOrgId]=useState('');
  const [org,setOrg]=useState<any>(null);
  const [roles,setRoles]=useState<any[]>([]);
  const [admins,setAdmins]=useState<any[]>([]);
  const [members,setMembers]=useState<any[]>([]);
  const [requirements,setRequirements]=useState<any[]>([]);
  const [compliance,setCompliance]=useState({total_users:0,compliant_users:0,noncompliant_users:0});
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

      const [{data:o},{data:r},{data:a},{data:m},{data:reqs},{data:summary}] = await Promise.all([
        supabase.from('organizations').select('*').eq('id',orgId).maybeSingle(),
        supabase.from('organization_roles').select('*').eq('organization_id',orgId).eq('is_active',true).order('name'),
        supabase.from('organization_admins').select('user_id,role,title').eq('organization_id',orgId),
        supabase.from('organization_memberships').select('id,user_id,role,status').eq('organization_id',orgId).eq('status','active'),
        supabase.from('organization_requirements').select('id').eq('organization_id',orgId).eq('active',true),
        supabase.rpc('get_organization_compliance_summary',{p_organization_id:orgId})
      ]);

      setOrg(o);
      setRoles(r||[]);
      setAdmins(a||[]);
      setMembers(m||[]);
      setRequirements(reqs||[]);
      setCompliance(summary?.[0] || {total_users:0,compliant_users:0,noncompliant_users:0});
      setLoading(false);
    })();
  },[orgId,router]);

  if(loading) return <div className="shell">Loading organization…</div>;
  if(!org) return <div className="shell">Organization not found.</div>;

  const bodies=org.governing_bodies?.length ? org.governing_bodies.join(' · ') : org.governing_body;

  return <AppShell>
    <div className="eyebrow">Organization home</div>
    <h1>{org.name}</h1>
    <p className="muted">{[org.organization_type,org.sport,bodies].filter(Boolean).join(' · ')}</p>

    <div className="grid three" style={{marginTop:24}}>
      <section className="card">
        <h2>Club profile</h2>
        <p className="muted">Edit organization details, contact information, sport, affiliations, website, and address.</p>
        <a className="btn green" href={`/organization-profile?org=${orgId}`}>Edit club profile</a>
      </section>

      <section className="card">
        <h2>Users & access</h2>
        <div className="metric">{admins.length + members.length}</div>
        <p className="muted">{admins.length} admin{admins.length===1?'':'s'} · {members.length} active member{members.length===1?'':'s'}</p>
        <a className="btn green" href={`/organization-users?org=${orgId}`}>Manage users</a>
      </section>

      <section className="card">
        <h2>Roles & requirements</h2>
        <div className="metric">{roles.length}</div>
        <p className="muted">{roles.length} current role{roles.length===1?'':'s'} · {requirements.length} requirement{requirements.length===1?'':'s'}</p>
        <a className="btn green" href={`/organization-manage?org=${orgId}`}>Manage roles & requirements</a>
      </section>
    </div>

    <section className="card" style={{marginTop:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <h2 style={{margin:0}}>Compliance</h2>
        <a className="btn secondary" href={`/organization-users?org=${orgId}`}>View users</a>
      </div>
      <div className="grid three" style={{marginTop:16}}>
        <div>
          <div className="muted">Users</div>
          <div className="metric">{compliance.total_users}</div>
        </div>
        <div>
          <div className="muted">Compliant</div>
          <div className="metric">{compliance.compliant_users}</div>
        </div>
        <div>
          <div className="muted">Non-compliant</div>
          <div className="metric">{compliance.noncompliant_users}</div>
        </div>
      </div>
    </section>

    <section className="card" style={{marginTop:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <h2 style={{margin:0}}>Current roles</h2>
        <a className="btn secondary" href={`/organization-manage?org=${orgId}`}>Edit roles</a>
      </div>
      {roles.length===0 ? <p className="muted">No roles created yet.</p> :
        <div className="list" style={{marginTop:14}}>
          {roles.map(role=><div className="item" key={role.id}><strong>{role.name}</strong></div>)}
        </div>
      }
    </section>
  </AppShell>;
}
