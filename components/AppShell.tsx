'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AppShell({children}:{children:React.ReactNode}){
  const router = useRouter();
  const [isActiveClearAdmin,setIsActiveClearAdmin]=useState(false);

  useEffect(()=>{
    (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)return;
      const {data}=await supabase
        .from('activeclear_admins')
        .select('is_active')
        .eq('user_id',user.id)
        .eq('is_active',true)
        .maybeSingle();
      setIsActiveClearAdmin(!!data);
    })();
  },[]);

  async function signOut(){ await supabase.auth.signOut(); router.push('/login'); }
  return <div className="shell">
    <div className="topbar">
      <Link href="/" className="brand">Active<span>Clear</span></Link>
      <nav className="nav">
        <Link href="/">Home</Link>
        <Link href="/profile">Profile</Link>
        <Link href="/credentials">Credentials</Link>
        <Link href="/organizations">Organizations</Link>
        <Link href="/organization">Organization Portal</Link>
        {isActiveClearAdmin && <Link href="/admin">ActiveClear Admin</Link>}
        <button onClick={signOut}>Sign out</button>
      </nav>
    </div>
    {children}
  </div>
}
