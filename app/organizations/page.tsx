'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import AppShell from '@/components/AppShell';
import {supabase} from '@/lib/supabase';
export default function Organizations(){
 const router=useRouter();const[uid,setUid]=useState('');const[orgs,setOrgs]=useState<any[]>([]);const[memberships,setMemberships]=useState<any[]>([]);
 async function load(id:string){const [{data:o},{data:m}]=await Promise.all([supabase.from('organizations').select('*').eq('is_active',true).order('name'),supabase.from('organization_memberships').select('*').eq('user_id',id).eq('status','active')]);setOrgs(o||[]);setMemberships(m||[])}
 useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user){router.replace('/login');return;}setUid(user.id);await load(user.id)})()},[router]);
 async function connect(orgId:string){await supabase.from('organization_memberships').insert({organization_id:orgId,user_id:uid,role:'Coach / Volunteer',status:'active'});await load(uid)}
 async function disconnect(id:string){await supabase.from('organization_memberships').delete().eq('id',id);await load(uid)}
 return <AppShell><div className="eyebrow">Organizations</div><h1>Connect your programs</h1><p className="muted">ActiveClear applies your credentials to each organization’s requirements.</p><div className="list">{orgs.map(o=>{const m=memberships.find(x=>x.organization_id===o.id);return <div className="item" key={o.id}><div><strong>{o.name}</strong><div className="muted">{o.sport||'Program'}{o.governing_body?' · '+o.governing_body:''}</div></div>{m?<button className="btn secondary" onClick={()=>disconnect(m.id)}>Disconnect</button>:<button className="btn green" onClick={()=>connect(o.id)}>Connect</button>}</div>})}</div></AppShell>
}