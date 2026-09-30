'use client';

import { useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function OrganizationUsers(){
  const router=useRouter();
  const [orgId,setOrgId]=useState('');
  const [org,setOrg]=useState<any>(null);
  const [admins,setAdmins]=useState<any[]>([]);
  const [members,setMembers]=useState<any[]>([]);

  useEffect(()=>setOrgId(new URLSearchParams(window.location.search).get('org')||''),[]);

  useEffect(()=>{
    if(!orgId)return;
    (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace('/login');return;}
      const {data:admin}=await supabase.from('organization_admins')
        .select('organization_id').eq('organization_id',orgId).eq('user_id',user.id).maybeSingle();
      if(!admin){router.replace('/organization');return;}

      const [{data:o},{data:a},{data:m}] = await Promise.all([
        supabase.from('organizations').select('id,name').eq('id',orgId).maybeSingle(),
        supabase.from('organization_admins').select('user_id,role,title,created_at').eq('organization_id',orgId),
        supabase.from('organization_memberships').select('id,user_id,role,status').eq('organization_id',orgId).order('role')
      ]);
      setOrg(o);setAdmins(a||[]);setMembers(m||[]);
    })();
  },[orgId,router]);

  if(!org)return <div className="shell">Loading users…</div>;

  return <AppShell>
    <div className="eyebrow">Users & access</div>
    <h1>{org.name}</h1>
    <p className="muted">Organization administrators and connected participants.</p>

    <section className="card" style={{marginTop:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <h2 style={{margin:0}}>Administrators</h2>
        <button className="btn green" type="button" disabled title="Invitation workflow coming next">+ Add user</button>
      </div>
      <div className="list" style={{marginTop:14}}>
        {admins.map((a:any)=><div className="item" key={a.user_id}>
          <div><strong>{a.title || 'Administrator'}</strong><div className="muted">{a.role}</div></div>
        </div>)}
      </div>
    </section>

    <section className="card" style={{marginTop:24}}>
      <h2>Connected participants</h2>
      {members.length===0?<p className="muted">No connected participants yet.</p>:
        <div className="list">{members.map((m:any)=><div className="item" key={m.id}><strong>{m.role || 'Participant'}</strong><span className="status green">{m.status}</span></div>)}</div>
      }
    </section>

    <a className="btn secondary" style={{marginTop:18}} href={`/organization-dashboard?org=${orgId}`}>Back to organization home</a>
  </AppShell>;
}
