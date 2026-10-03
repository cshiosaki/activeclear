'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

type QueueItem = {
  credential_id:string; person_name:string; credential_type:string; issuing_body:string|null;
  credential_number:string|null; issued_date:string|null; expires_date:string|null;
  document_path:string|null; submitted_at:string; result:string; confidence:number|null;
  reasons:any; extracted_name:string|null; extracted_issuer:string|null;
  extracted_credential_type:string|null; extracted_credential_number:string|null;
  extracted_issue_date:string|null; extracted_expiration_date:string|null; reviewed_at:string|null;
};
type Filter='needs_review'|'pending'|'verified_today'|'failed_today'|'all';

function isToday(value:string|null){
  if(!value)return false;
  const d=new Date(value), n=new Date();
  return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();
}
function label(result:string){
  if(result==='verified')return 'Verified';
  if(result==='needs_human_review')return 'Needs Review';
  if(result==='does_not_meet')return 'Does Not Meet';
  if(result==='wrong_credential_type')return 'Wrong Credential';
  if(result==='unreadable')return 'Unreadable';
  if(result==='expired')return 'Expired';
  return 'Pending';
}
function cls(result:string){ return result==='verified'?'green':result==='pending'||result==='needs_human_review'?'amber':'red'; }

export default function ActiveClearAdmin(){
  const router=useRouter();
  const [rows,setRows]=useState<QueueItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [authorized,setAuthorized]=useState(false);
  const [filter,setFilter]=useState<Filter>('needs_review');
  const [search,setSearch]=useState('');
  const [openId,setOpenId]=useState<string|null>(null);
  const [signedUrls,setSignedUrls]=useState<Record<string,string>>({});
  const [busyId,setBusyId]=useState<string|null>(null);
  const [msg,setMsg]=useState('');

  async function load(){
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){router.replace('/login');return;}
    const {data:access}=await supabase.from('activeclear_admins').select('role,is_active').eq('user_id',user.id).eq('is_active',true).maybeSingle();
    if(!access){setAuthorized(false);setLoading(false);return;}
    setAuthorized(true);
    const {data,error}=await supabase.rpc('get_activeclear_review_queue');
    if(error){setMsg(error.message);setRows([]);} else setRows((data||[]) as QueueItem[]);
    setLoading(false);
  }

  useEffect(()=>{void load();},[]);

  async function openDocument(item:QueueItem){
    setOpenId(openId===item.credential_id?null:item.credential_id);
    if(!item.document_path||signedUrls[item.credential_id])return;
    const {data,error}=await supabase.storage.from('credential-documents').createSignedUrl(item.document_path,900);
    if(error){setMsg(error.message);return;}
    if(data?.signedUrl)setSignedUrls(v=>({...v,[item.credential_id]:data.signedUrl}));
  }

  async function decide(item:QueueItem,result:string){
    let note:string|null=null;
    if(result!=='verified'){note=window.prompt('Optional reviewer note.');if(note===null)return;}
    setBusyId(item.credential_id);setMsg('');
    const {error}=await supabase.rpc('resolve_activeclear_review',{p_credential_id:item.credential_id,p_result:result,p_note:note||null});
    if(error){setMsg(error.message);setBusyId(null);return;}
    await load();setBusyId(null);setOpenId(null);
    setMsg(result==='verified'?'Credential verified.':'Credential review updated.');
  }

  const filtered=useMemo(()=>rows.filter(row=>{
    const q=search.trim().toLowerCase();
    const matches=!q||row.person_name?.toLowerCase().includes(q)||row.credential_type?.toLowerCase().includes(q)||row.issuing_body?.toLowerCase().includes(q)||row.credential_number?.toLowerCase().includes(q);
    if(!matches)return false;
    if(filter==='needs_review')return row.result==='needs_human_review';
    if(filter==='pending')return row.result==='pending';
    if(filter==='verified_today')return row.result==='verified'&&isToday(row.reviewed_at);
    if(filter==='failed_today')return ['does_not_meet','wrong_credential_type','unreadable','expired'].includes(row.result)&&isToday(row.reviewed_at);
    return true;
  }),[rows,filter,search]);

  const counts={
    needs:rows.filter(r=>r.result==='needs_human_review').length,
    pending:rows.filter(r=>r.result==='pending').length,
    verified:rows.filter(r=>r.result==='verified'&&isToday(r.reviewed_at)).length,
    failed:rows.filter(r=>['does_not_meet','wrong_credential_type','unreadable','expired'].includes(r.result)&&isToday(r.reviewed_at)).length
  };

  if(loading)return <div className="shell">Loading ActiveClear Admin…</div>;
  if(!authorized)return <AppShell><div className="eyebrow">ActiveClear Admin</div><h1>Access denied</h1><section className="card"><p className="muted">This account does not have ActiveClear Admin access.</p></section></AppShell>;

  return <AppShell>
    <div className="eyebrow">ActiveClear Admin</div>
    <h1>Credential review queue</h1>
    <p className="muted">Fast review of credentials that need a master ActiveClear decision.</p>
    {msg&&<div className="notice" style={{marginTop:12}}>{msg}</div>}

    <div className="grid four" style={{marginTop:22}}>
      <button className="card" onClick={()=>setFilter('needs_review')} style={{textAlign:'left',cursor:'pointer'}}><div className="muted">Needs review</div><div className="metric">{counts.needs}</div></button>
      <button className="card" onClick={()=>setFilter('pending')} style={{textAlign:'left',cursor:'pointer'}}><div className="muted">Pending</div><div className="metric">{counts.pending}</div></button>
      <button className="card" onClick={()=>setFilter('verified_today')} style={{textAlign:'left',cursor:'pointer'}}><div className="muted">Verified today</div><div className="metric">{counts.verified}</div></button>
      <button className="card" onClick={()=>setFilter('failed_today')} style={{textAlign:'left',cursor:'pointer'}}><div className="muted">Failed today</div><div className="metric">{counts.failed}</div></button>
    </div>

    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:20,alignItems:'center'}}>
      {([['needs_review','Needs Review'],['pending','Pending'],['verified_today','Verified Today'],['failed_today','Failed Today'],['all','All']] as Array<[Filter,string]>).map(([v,t])=>
        <button key={v} className={'btn '+(filter===v?'green':'secondary')} onClick={()=>setFilter(v)}>{t}</button>
      )}
      <input placeholder="Search name or credential" value={search} onChange={e=>setSearch(e.target.value)} style={{marginLeft:'auto',minWidth:260}}/>
    </div>

    <div className="list" style={{marginTop:18}}>
      {filtered.length===0?<section className="card"><p className="muted">No submissions in this view.</p></section>:filtered.map(item=>{
        const open=openId===item.credential_id;
        const url=signedUrls[item.credential_id];
        const reasons=Array.isArray(item.reasons)?item.reasons:[];
        return <section className="card" key={item.credential_id} style={{padding:0,overflow:'hidden'}}>
          <div className="item" style={{border:0,borderRadius:0,alignItems:'flex-start'}}>
            <div>
              <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><strong style={{fontSize:18}}>{item.person_name||'Unknown user'}</strong><span className={'status '+cls(item.result)}>{label(item.result)}</span></div>
              <div style={{fontWeight:700,marginTop:4}}>{item.credential_type}</div>
              <div className="muted">{[item.issuing_body,item.credential_number].filter(Boolean).join(' · ')||'No issuer/number extracted'}</div>
              <div className="muted">{item.issued_date?'Issued '+item.issued_date:'Issue date not shown'} · {item.expires_date?'Expires '+item.expires_date:'No expiration date on file'}</div>
              <div className="muted" style={{fontSize:12,marginTop:4}}>Submitted {new Date(item.submitted_at).toLocaleString()}</div>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
              {item.document_path&&<button className="btn secondary" onClick={()=>openDocument(item)}>{open?'Close':'Review'}</button>}
              <button className="btn green" disabled={busyId===item.credential_id} onClick={()=>decide(item,'verified')}>Verify</button>
              <button className="btn" disabled={busyId===item.credential_id} onClick={()=>decide(item,'does_not_meet')} style={{background:'#fde7e7',color:'#9a2626'}}>Does Not Meet</button>
            </div>
          </div>

          {open&&<div style={{padding:'0 16px 16px'}}>
            <div className="grid two">
              <div className="card" style={{margin:0}}>
                <h3 style={{marginTop:0}}>Credential details</h3>
                <div className="list">
                  <div><strong>Issuer</strong><div className="muted">{item.issuing_body||'Not provided'}</div></div>
                  <div><strong>Credential #</strong><div className="muted">{item.credential_number||'Not provided'}</div></div>
                  <div><strong>Issue date</strong><div className="muted">{item.issued_date||'Not provided'}</div></div>
                  <div><strong>Expiration</strong><div className="muted">{item.expires_date||'Not provided'}</div></div>
                </div>

                {(item.extracted_name||item.extracted_issuer||item.extracted_credential_number||item.extracted_issue_date||item.extracted_expiration_date)&&<>
                  <h3>AI extracted</h3>
                  <div className="list">
                    {item.extracted_name&&<div><strong>Name</strong><div className="muted">{item.extracted_name}</div></div>}
                    {item.extracted_issuer&&<div><strong>Issuer</strong><div className="muted">{item.extracted_issuer}</div></div>}
                    {item.extracted_credential_number&&<div><strong>Credential #</strong><div className="muted">{item.extracted_credential_number}</div></div>}
                    {item.extracted_issue_date&&<div><strong>Issue date</strong><div className="muted">{item.extracted_issue_date}</div></div>}
                    {item.extracted_expiration_date&&<div><strong>Expiration</strong><div className="muted">{item.extracted_expiration_date}</div></div>}
                  </div>
                </>}

                {reasons.length>0&&<><h3>Why review is needed</h3><div className="notice">{reasons.map((r:string,i:number)=><div key={i}>{r}</div>)}</div></>}

                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}}>
                  <button className="btn secondary" onClick={()=>decide(item,'wrong_credential_type')}>Wrong Credential</button>
                  <button className="btn secondary" onClick={()=>decide(item,'unreadable')}>Unreadable</button>
                  <button className="btn secondary" onClick={()=>decide(item,'expired')}>Expired</button>
                </div>
              </div>

              <div className="card" style={{margin:0,minHeight:560}}>
                <h3 style={{marginTop:0}}>Document</h3>
                {!url?<p className="muted">Preparing secure document preview…</p>:item.document_path?.toLowerCase().endsWith('.pdf')?
                  <iframe src={url} title="Credential document" style={{width:'100%',height:500,border:0,borderRadius:8}}/>:
                  <img src={url} alt="Credential document" style={{width:'100%',maxHeight:500,objectFit:'contain',borderRadius:8}}/>
                }
              </div>
            </div>
          </div>}
        </section>;
      })}
    </div>
  </AppShell>;
}
