'use client';
import { FormEvent,useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Login(){
 const router=useRouter(); const [mode,setMode]=useState<'login'|'signup'>('login');
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [first,setFirst]=useState(''); const [last,setLast]=useState(''); const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{if(data.session) router.replace('/')})},[router]);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMsg('');
  if(mode==='login'){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setMsg(error.message);else router.push('/');}
  else{const {data,error}=await supabase.auth.signUp({email,password,options:{data:{first_name:first,last_name:last},emailRedirectTo:window.location.origin+'/'}});
   if(error)setMsg(error.message);else if(data.session)router.push('/');else setMsg('Check your email to confirm your account, then sign in.');}
  setBusy(false);
 }
 return <main className="login-wrap shell"><div className="card"><div className="eyebrow">ActiveClear</div><h1>{mode==='login'?'Welcome back':'Create your profile'}</h1><p className="muted">One profile for your sports credentials, certifications, and organization requirements.</p><div className="tabs"><button className={mode==='login'?'active':''} onClick={()=>setMode('login')}>Sign in</button><button className={mode==='signup'?'active':''} onClick={()=>setMode('signup')}>Create account</button></div><form className="form" onSubmit={submit}>{mode==='signup'&&<div className="row"><div className="field"><label>First name</label><input required value={first} onChange={e=>setFirst(e.target.value)}/></div><div className="field"><label>Last name</label><input required value={last} onChange={e=>setLast(e.target.value)}/></div></div>}<div className="field"><label>Email</label><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></div><div className="field"><label>Password</label><input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)}/></div>{msg&&<div className="notice">{msg}</div>}<button className="btn green" disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':'Create ActiveClear account'}</button></form></div></main>
}