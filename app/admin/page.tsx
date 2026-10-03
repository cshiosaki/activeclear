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

    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:18,alignItems:'center'}}>
      {([
        ['needs_review','Needs Review',counts.needs],
        ['pending','Pending',counts.pending],
        ['verified_today','Verified Today',counts.verified],
        ['failed_today','Failed Today',counts.failed],
        ['all','All',rows.length]
      ] as Array<[Filter,string,number]>).map(([v,t,count])=>
        <button
          key={v}
          className={'btn '+(filter===v?'green':'secondary')}
          onClick={()=>setFilter(v)}
          style={{padding:'8px 12px',minHeight:36}}
        >
          {t} <span style={{opacity:.75}}>({count})</span>
        </button>
      )}
      <input
        placeholder="Search name, credential, issuer or number"
        value={search}
        onChange={e=>setSearch(e.target.value)}
        style={{marginLeft:'auto',minWidth:320,height:38}}
      />
    </div>

    <div style={{marginTop:14,border:'1px solid #dfe6e1',borderRadius:14,overflow:'hidden',background:'#fff'}}>
      {filtered.length===0?<div style={{padding:18}}><p className="muted" style={{margin:0}}>No submissions in this view.</p></div>:filtered.map(item=>{
        const open=openId===item.credential_id;
        const url=signedUrls[item.credential_id];
        const reasons=Array.isArray(item.reasons)?item.reasons:[];
        return <section key={item.credential_id} style={{borderBottom:'1px solid #e7ece8'}}>
          <div
            style={{
              display:'grid',
              gridTemplateColumns:'minmax(150px,1.15fr) minmax(170px,1.25fr) minmax(150px,1.2fr) 150px 145px 270px',
              gap:12,
              alignItems:'center',
              padding:'10px 14px',
              minHeight:58
            }}
          >
            <div style={{minWidth:0}}>
              <strong style={{fontSize:15,display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.person_name||'Unknown user'}</strong>
              <span className={'status '+cls(item.result)} style={{fontSize:11,padding:'3px 8px'}}>{label(item.result)}</span>
            </div>

            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.credential_type}</div>
              <div className="muted" style={{fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.issuing_body||'Issuer not provided'}</div>
            </div>

            <div style={{minWidth:0}}>
              <div style={{fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.credential_number||'No credential #'}</div>
              <div className="muted" style={{fontSize:12}}>{item.issued_date||'—'} → {item.expires_date||'—'}</div>
            </div>

            <div className="muted" style={{fontSize:12}}>
              {new Date(item.submitted_at).toLocaleDateString()}<br/>
              {new Date(item.submitted_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
            </div>

            <div>
              {item.document_path&&<button className="btn secondary" onClick={()=>openDocument(item)} style={{padding:'7px 11px',minHeight:34}}>{open?'Close':'Review'}</button>}
            </div>

            <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
              <button className="btn green" disabled={busyId===item.credential_id} onClick={()=>decide(item,'verified')} style={{padding:'7px 10px',minHeight:34}}>Verify</button>
              <button className="btn" disabled={busyId===item.credential_id} onClick={()=>decide(item,'does_not_meet')} style={{background:'#fde7e7',color:'#9a2626',padding:'7px 10px',minHeight:34}}>Does Not Meet</button>
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
