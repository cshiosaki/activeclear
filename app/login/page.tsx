'use client';
import { FormEvent,useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Portal='individual'|'admin';

export default function Login(){
 const router=useRouter();
 const [portal,setPortal]=useState<Portal>('individual');
 const [mode,setMode]=useState<'login'|'signup'>('login');
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [first,setFirst]=useState('');
 const [last,setLast]=useState('');
 const [msg,setMsg]=useState('');
 const [busy,setBusy]=useState(false);

 const destination=portal==='admin'?'/organization':'/';

 useEffect(()=>{
  supabase.auth.getSession().then(({data})=>{
   if(data.session) router.replace(destination);
  });
 },[router,portal]);

 async function submit(e:FormEvent){
  e.preventDefault();
  setBusy(true);
  setMsg('');

  if(mode==='login'){
   const {error}=await supabase.auth.signInWithPassword({email,password});
   if(error)setMsg(error.message);
   else router.push(destination);
  }else{
   const {data,error}=await supabase.auth.signUp({
    email,
    password,
    options:{
     data:{first_name:first,last_name:last},
     emailRedirectTo:window.location.origin+'/login'
    }
   });

   if(error)setMsg(error.message);
   else if(data.session)router.push(destination);
   else setMsg('Check your email to confirm your account, then sign in.');
  }

  setBusy(false);
 }

 return <main className="login-wrap shell">
  <div className="card">
   <div className="eyebrow">ActiveClear</div>
   <h1>{mode==='login'?'Welcome back':'Create your account'}</h1>
   <p className="muted">Use the same email and password for either portal.</p>

   <div className="grid two" style={{marginTop:18}}>
    <button
     type="button"
     className={'card '+(portal==='individual'?'selected':'')}
     onClick={()=>setPortal('individual')}
     style={{textAlign:'left',cursor:'pointer',border:portal==='individual'?'2px solid #1f8f5f':undefined}}
    >
     <strong>Individual</strong>
     <div className="muted" style={{marginTop:6}}>My profile, credentials, organizations, and compliance status.</div>
    </button>

    <button
     type="button"
     className={'card '+(portal==='admin'?'selected':'')}
     onClick={()=>setPortal('admin')}
     style={{textAlign:'left',cursor:'pointer',border:portal==='admin'?'2px solid #1f8f5f':undefined}}
    >
     <strong>Organization Sign In</strong>
     <div className="muted" style={{marginTop:6}}>Manage organization setup, roles, requirements, and participants.</div>
    </button>
   </div>

   <div className="tabs" style={{marginTop:18}}>
    <button className={mode==='login'?'active':''} onClick={()=>setMode('login')}>Sign in</button>
    <button className={mode==='signup'?'active':''} onClick={()=>setMode('signup')}>Create account</button>
   </div>

   <form className="form" onSubmit={submit}>
    {mode==='signup'&&<div className="row">
     <div className="field">
      <label>First name</label>
      <input required value={first} onChange={e=>setFirst(e.target.value)}/>
     </div>
     <div className="field">
      <label>Last name</label>
      <input required value={last} onChange={e=>setLast(e.target.value)}/>
     </div>
    </div>}

    <div className="field">
     <label>Email</label>
     <input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/>
    </div>

    <div className="field">
     <label>Password</label>
     <input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)}/>
    </div>

    {msg&&<div className="notice">{msg}</div>}

    <button className="btn green" disabled={busy}>
     {busy?'Please wait…':mode==='login'
      ? portal==='admin'?'Sign in to Organization Portal':'Sign in to Coach Portal'
      :'Create ActiveClear account'}
    </button>
   </form>
  </div>
 </main>;
}
