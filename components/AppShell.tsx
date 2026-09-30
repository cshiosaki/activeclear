'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AppShell({children}:{children:React.ReactNode}){
  const router = useRouter();
  async function signOut(){ await supabase.auth.signOut(); router.push('/login'); }
  return <div className="shell">
    <div className="topbar">
      <Link href="/" className="brand">Active<span>Clear</span></Link>
      <nav className="nav">
        <Link href="/">Home</Link>
        <Link href="/profile">Profile</Link>
        <Link href="/credentials">Credentials</Link>
        <Link href="/organizations">Organizations</Link>
        <button onClick={signOut}>Sign out</button>
      </nav>
    </div>
    {children}
  </div>
}
