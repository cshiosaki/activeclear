'use client';
import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import AppShell from '@/components/AppShell';
import {supabase} from '@/lib/supabase';

export default function Home(){
 const router=useRouter(); const [name,setName]=useState(''); const [creds,setCreds]=useState<any[]>([]); const [orgs,setOrgs]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [pct,setPct]=useState(0);
 useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user){router.replace('/login');return;}
  const [{data:p},{data:c},{data:m},{data:e},{data:med}]=await Promise.all([
   supabase.from('profiles').select('*').eq('user_id',user.id).maybeSingle(),
   supabase.from('credentials').select('id,expires_date,status,credential_types(name)').order('expires_date'),
   supabase.from('organization_memberships').select('id,organization_id,organizations(name,sport)').eq('status','active'),
   supabase.from('emergency_contacts').select('id').eq('user_id',user.id).limit(1),
   supabase.from('medical_profiles').select('user_id').eq('user_id',user.id).maybeSingle()
  ]);
  setName([p?.first_name,p?.last_name].filter(Boolean).join(' ')||user.email||'Member');setCreds(c||[]);setOrgs(m||[]);
  const checks=[p?.first_name,p?.last_name,p?.phone,p?.date_of_birth,p?.address_line1,(e||[]).length>0,!!med];setPct(Math.round(checks.filter(Boolean).length/checks.length*100));setLoading(false);
 })()},[router]);
 const expiring=useMemo(()=>creds.filter(c=>c.expires_date&&((new Date(c.expires_date).getTime()-Date.now())/86400000)>=0&&((new Date(c.expires_date).getTime()-Date.now())/86400000)<=60).length,[creds]);
 const expired=useMemo(()=>creds.filter(c=>c.expires_date&&new Date(c.expires_date)<new Date()).length,[creds]);
 if(loading)return <div className="shell">Loading ActiveClear…</div>;
 const overall=expired>0?'Action Required':expiring>0?'Expiring Soon':'Clear';
 return <AppShell><div className="hero"><section className="card"><div className="eyebrow">Profile Home</div><h1>Welcome, {name.split(' ')[0]}</h1><p className="muted">Your credentials stay with you. Organizations apply their own requirements to the same profile.</p><span className={'status '+(overall==='Clear'?'green':overall==='Expiring Soon'?'amber':'red')}>ActiveClear Status: {overall}</span></section><section className="card"><div className="muted">Profile completeness</div><div className="metric">{pct}%</div><div className="progress"><div style={{width:pct+'%'}}/></div></section></div><h2 className="section-title">At a glance</h2><div className="grid three"><div className="card"><div className="muted">Credentials</div><div className="metric">{creds.length}</div></div><div className="card"><div className="muted">Expiring in 60 days</div><div className="metric">{expiring}</div></div><div className="card"><div className="muted">Connected organizations</div><div className="metric">{orgs.length}</div></div></div></AppShell>
}