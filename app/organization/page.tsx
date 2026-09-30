'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function OrganizationPortal(){
  const router=useRouter();
  const [admins,setAdmins]=useState<any[]>([]);
  const [requests,setRequests]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace('/login');return;}

      const [{data:a},{data:r}] = await Promise.all([
        supabase.from('organization_admins')
          .select('organization_id,role,organizations(name,sport,governing_body)')
          .eq('user_id',user.id),
        supabase.from('organization_claim_requests')
          .select('status,organization_id,organizations(name,sport,governing_body)')
          .eq('user_id',user.id)
      ]);

      setAdmins(a||[]);
      setRequests(r||[]);
      setLoading(false);
    })();
  },[router]);

  if(loading) return <div className="shell">Loading organization access…</div>;

  return <AppShell>
    <div className="eyebrow">Organization portal</div>
    <h1>Organization access</h1>

    {admins.length===0 ? (
      <section className="card">
        <h2>No approved organization admin access yet</h2>
        <p className="muted">
          If you manage a sports organization, request access below. Once approved, this page will become the organization compliance dashboard.
        </p>
        <a href="/organization-signup" className="btn green">Request organization access</a>

        {requests.length>0 && <div style={{marginTop:20}} className="list">
          {requests.map((r:any,index:number)=>{
            const org:any=Array.isArray(r.organizations)?r.organizations[0]:r.organizations;
            return <div className="item" key={index}>
              <div>
                <strong>{org?.name}</strong>
                <div className="muted">{org?.sport || 'Program'}</div>
              </div>
              <span className={'status '+(r.status==='approved'?'green':r.status==='rejected'?'red':'amber')}>{r.status}</span>
            </div>
          })}
        </div>}
      </section>
    ) : (
      <div className="list">
        {admins.map((a:any,index:number)=>{
          const org:any=Array.isArray(a.organizations)?a.organizations[0]:a.organizations;
          return <section className="card" key={index}>
            <h2>{org?.name}</h2>
            <p className="muted">{[org?.sport,org?.governing_body].filter(Boolean).join(' · ')}</p>
            <span className="status green">Admin access active</span>
            <p style={{marginTop:18}}>The full organization roster and compliance dashboard is the next build step.</p>
          </section>
        })}
      </div>
    )}
  </AppShell>
}
