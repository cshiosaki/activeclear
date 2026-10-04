'use client';

import { useEffect,useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function OrganizationMember(){
  const router=useRouter();
  const [orgId,setOrgId]=useState('');
  const [userId,setUserId]=useState('');
  const [org,setOrg]=useState<any>(null);
  const [detail,setDetail]=useState<any>(null);
  const [roles,setRoles]=useState<any[]>([]);
  const [groups,setGroups]=useState<any[]>([]);
  const [notes,setNotes]=useState<any[]>([]);
  const [newNote,setNewNote]=useState('');
  const [editAssignment,setEditAssignment]=useState(false);
  const [roleId,setRoleId]=useState('');
  const [groupIds,setGroupIds]=useState<string[]>([]);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);
  const [documentUrls,setDocumentUrls]=useState<Record<string,string>>({});
  const [privateInfo,setPrivateInfo]=useState<any>(null);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    setOrgId(params.get('org')||'');
    setUserId(params.get('user')||'');
  },[]);

  async function load(){
    if(!orgId||!userId)return;
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){router.replace('/login');return;}

    const {data:admin}=await supabase.from('organization_admins')
      .select('organization_id').eq('organization_id',orgId).eq('user_id',user.id).maybeSingle();
    if(!admin){router.replace('/organization');return;}

    const [{data:o},{data:d,error:detailError},{data:r},{data:g},{data:n},{data:pi}] = await Promise.all([
      supabase.from('organizations').select('*').eq('id',orgId).maybeSingle(),
      supabase.rpc('get_organization_member_detail_for_admin',{p_organization_id:orgId,p_user_id:userId}),
      supabase.from('organization_roles').select('id,name').eq('organization_id',orgId).eq('is_active',true).order('name'),
      supabase.from('organization_groups').select('*').eq('organization_id',orgId).eq('is_active',true)
        .order('division_name').order('level_name').order('group_name'),
      supabase.rpc('get_organization_member_notes_for_admin',{p_organization_id:orgId,p_user_id:userId}),
      supabase.rpc('get_organization_member_private_info_for_admin',{p_organization_id:orgId,p_user_id:userId})
    ]);

    if(detailError){setMsg(detailError.message);return;}
    setOrg(o);
    setDetail(d);
    setRoles(r||[]);
    setGroups(g||[]);
    setNotes(n||[]);
    setPrivateInfo(pi||null);
    setRoleId(d?.membership?.role_id || '');
    setGroupIds((d?.groups||[]).map((x:any)=>x.id));
  }

  useEffect(()=>{load()},[orgId,userId]);

  const requirements=detail?.requirements||[];
  const met=requirements.filter((r:any)=>r.status==='met').length;
  const pending=requirements.filter((r:any)=>r.status==='pending').length;
  const needs=requirements.filter((r:any)=>['missing','does_not_meet','supporting_document_required'].includes(r.status)).length;
  const expiring=requirements.filter((r:any)=>{
    if(r.status!=='met'||!r.effective_expiration_date)return false;
    const now=new Date();
    const exp=new Date(r.effective_expiration_date+'T00:00:00');
    const days=Math.ceil((exp.getTime()-now.getTime())/86400000);
    return days>=0 && days<=60;
  }).length;

  const isCompliant=requirements.length>0 && needs===0 && pending===0;
  const fullName=[detail?.person?.first_name,detail?.person?.last_name].filter(Boolean).join(' ') || detail?.person?.email || 'Member';
  const groupLabel=org?.group_label || 'Team / Group';
  const divisionLabel=org?.division_label || 'Division';
  const levelLabel=org?.level_label || 'Level';

  async function saveAssignment(){
    setBusy(true);setMsg('');
    const {error}=await supabase.rpc('update_organization_member_assignment_for_admin',{
      p_organization_id:orgId,
      p_user_id:userId,
      p_role_id:roleId||null,
      p_group_ids:groupIds
    });
    if(error)setMsg(error.message);
    else{
      setMsg('Role and team assignment updated.');
      setEditAssignment(false);
      await load();
    }
    setBusy(false);
  }

  async function requestFollowup(req:any){
    const note=window.prompt('What should ActiveClear review or correct?');
    if(note===null)return;
    const {error}=await supabase.rpc('request_organization_member_review_for_admin',{
      p_organization_id:orgId,
      p_user_id:userId,
      p_requirement_id:req.requirement_id,
      p_credential_id:req.credential_id||null,
      p_note:note.trim()||'Organization manager requested ActiveClear review.'
    });
    if(error)setMsg(error.message);
    else{
      setMsg('Review request sent to the ActiveClear Admin queue.');
      await load();
    }
  }

  async function openCredentialDocument(req:any){
    const path=req?.credential?.document_path;
    if(!path){
      setMsg('No supporting document is available for this credential.');
      return;
    }
    if(documentUrls[req.credential_id]){
      window.open(documentUrls[req.credential_id],'_blank','noopener,noreferrer');
      return;
    }
    const {data,error}=await supabase.storage.from('credential-documents').createSignedUrl(path,600);
    if(error||!data?.signedUrl){
      setMsg(error?.message || 'Could not open the credential document.');
      return;
    }
    setDocumentUrls(v=>({...v,[req.credential_id]:data.signedUrl}));
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }

  async function addNote(){
    if(!newNote.trim())return;
    setBusy(true);setMsg('');
    const {error}=await supabase.rpc('add_organization_member_note_for_admin',{
      p_organization_id:orgId,
      p_user_id:userId,
      p_note:newNote.trim()
    });
    if(error)setMsg(error.message);
    else{
      setNewNote('');
      setMsg('Organization note added.');
      await load();
    }
    setBusy(false);
  }

  async function deleteNote(noteId:string){
    if(!window.confirm('Delete this organization note?'))return;
    const {error}=await supabase.rpc('delete_organization_member_note_for_admin',{
      p_organization_id:orgId,
      p_note_id:noteId
    });
    if(error)setMsg(error.message);
    else{
      setMsg('Organization note deleted.');
      await load();
    }
  }

  function statusLabel(status:string){
    if(status==='met')return 'Met';
    if(status==='pending')return 'Pending review';
    if(status==='does_not_meet')return 'Does not meet';
    if(status==='supporting_document_required')return 'Document required';
    return 'Missing';
  }

  function statusClass(status:string){
    if(status==='met')return 'green';
    if(status==='pending')return 'amber';
    return 'red';
  }

  if(!org||!detail)return <div className="shell">{msg || 'Loading member…'}</div>;

  return <AppShell>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
      <div>
        <div className="eyebrow">{org.name} · Member detail</div>
        <h1 style={{marginBottom:6}}>{fullName}</h1>
        <div className="muted">{detail.person?.email}{detail.person?.phone ? ' · '+detail.person.phone : ''}</div>
      </div>
      <a className="btn secondary" href={`/organization-dashboard?org=${orgId}&tab=people`}>Back to people</a>
    </div>

    {msg && <div className="notice" style={{marginTop:16}}>{msg}</div>}

    <section className="card" style={{marginTop:20,padding:16}}>
      <div className="summaryGrid">
        <div><div className="muted small">Overall</div><span className={'status '+(isCompliant?'green':'red')} style={{marginTop:7}}>{isCompliant?'Compliant':'Needs attention'}</span></div>
        <div><div className="muted small">Requirements met</div><div className="metricSmall">{met}/{requirements.length}</div></div>
        <div><div className="muted small">Needs attention</div><div className="metricSmall">{needs}</div></div>
        <div><div className="muted small">Pending</div><div className="metricSmall">{pending}</div></div>
        <div><div className="muted small">Expiring ≤60 days</div><div className="metricSmall">{expiring}</div></div>
      </div>
    </section>

    <section className="card" style={{marginTop:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div>
          <h2 style={{margin:'0 0 4px'}}>Organization assignment</h2>
          <div className="muted">Role and {groupLabel.toLowerCase()} assignment for this organization.</div>
        </div>
        <button className="btn secondary" type="button" onClick={()=>setEditAssignment(!editAssignment)}>{editAssignment?'Cancel':'Edit assignment'}</button>
      </div>

      {!editAssignment ? <div className="assignmentGrid" style={{marginTop:16}}>
        <div><div className="muted small">Role</div><strong>{detail.membership?.role || 'Participant'}</strong></div>
        <div><div className="muted small">{groupLabel}</div>
          {(detail.groups||[]).length ? (detail.groups||[]).map((g:any)=><div key={g.id} style={{marginTop:4}}>
            <strong>{g.group_name}</strong>
            <div className="muted small">{[g.division_name,g.level_name,g.season].filter(Boolean).join(' · ')}</div>
          </div>) : <span className="muted">Not assigned</span>}
        </div>
      </div> : <div style={{marginTop:16}}>
        <div className="field" style={{maxWidth:420}}>
          <label>Role</label>
          <select value={roleId} onChange={e=>setRoleId(e.target.value)}>
            <option value="">Participant</option>
            {roles.map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div style={{marginTop:14}}>
          <strong>{groupLabel}s</strong>
          <div className="muted small" style={{marginTop:3}}>A person can belong to more than one group.</div>
          <div className="list" style={{marginTop:10}}>
            {groups.map((g:any)=><label className="item" key={g.id} style={{cursor:'pointer',padding:12}}>
              <div>
                <strong>{g.group_name}</strong>
                <div className="muted small">{[g.division_name,g.level_name,g.season].filter(Boolean).join(' · ')}</div>
              </div>
              <input
                type="checkbox"
                checked={groupIds.includes(g.id)}
                onChange={e=>setGroupIds(e.target.checked ? [...groupIds,g.id] : groupIds.filter(x=>x!==g.id))}
                style={{width:20,height:20}}
              />
            </label>)}
          </div>
        </div>
        <button className="btn green" type="button" onClick={saveAssignment} disabled={busy} style={{marginTop:14}}>{busy?'Saving…':'Save assignment'}</button>
      </div>}
    </section>

    <section className="card" style={{marginTop:18}}>
      <h2 style={{marginTop:0}}>Compliance requirements</h2>
      <div className="list">
        {requirements.map((req:any)=>{
          const cred=req.credential;
          const expiringSoon=(()=>{
            if(req.status!=='met'||!req.effective_expiration_date)return false;
            const days=Math.ceil((new Date(req.effective_expiration_date+'T00:00:00').getTime()-Date.now())/86400000);
            return days>=0&&days<=60;
          })();
          return <div className="item" key={req.requirement_id} style={{alignItems:'flex-start'}}>
            <div style={{minWidth:0}}>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <strong>{req.requirement_name}</strong>
                <span className={'status '+statusClass(req.status)}>{statusLabel(req.status)}</span>
                {expiringSoon && <span className="status amber">Expiring soon</span>}
                {req.exemption_id && <span className="status green">Exemption</span>}
              </div>

              {cred ? <div className="detailGrid" style={{marginTop:10}}>
                <div><span className="muted">Credential</span><br/>{cred.credential_type || req.requirement_name}</div>
                <div><span className="muted">Issuer</span><br/>{cred.issuing_body || '—'}</div>
                <div><span className="muted">Credential #</span><br/>{cred.credential_number || '—'}</div>
                <div><span className="muted">Issued</span><br/>{cred.issued_date || '—'}</div>
                <div><span className="muted">Expires</span><br/>{req.effective_expiration_date || cred.expires_date || 'No expiration'}</div>
                <div><span className="muted">Review</span><br/>{cred.verification_result || req.review_result || '—'}</div>
              </div> : <div className="muted small" style={{marginTop:8}}>No credential is currently satisfying this requirement.</div>}

              {req.exemption && <div className="notice" style={{marginTop:10}}>
                <strong>Approved exemption</strong>
                {req.exemption.request_reason && <div className="muted small">{req.exemption.request_reason}</div>}
                {req.exemption.exemption_expires_date && <div className="small">Expires: {req.exemption.exemption_expires_date}</div>}
              </div>}

              {cred?.reviewer_notes && <div className="muted small" style={{marginTop:8}}>Review note: {cred.reviewer_notes}</div>}
            </div>

            <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
              {cred?.document_path && <button className="btn secondary" type="button" onClick={()=>openCredentialDocument(req)}>View document</button>}
              <button className="btn secondary" type="button" onClick={()=>requestFollowup(req)}>Send to ActiveClear</button>
            </div>
          </div>
        })}
        {requirements.length===0 && <div className="muted">No requirements apply to this member’s role.</div>}
      </div>
    </section>



    <section className="card" style={{marginTop:18}}>
      <details>
        <summary style={{cursor:'pointer',fontWeight:800,fontSize:20}}>Personal, medical & emergency information</summary>
        <div className="muted small" style={{marginTop:6}}>
          Organization-only information for member safety and emergency response.
        </div>

        <div className="detailGrid" style={{marginTop:16}}>
          <div><span className="muted">Phone</span><br/>{privateInfo?.profile?.phone || '—'}</div>
          <div><span className="muted">Date of birth</span><br/>{privateInfo?.profile?.date_of_birth || '—'}</div>
          <div><span className="muted">Email</span><br/>{privateInfo?.profile?.email || '—'}</div>
          <div style={{gridColumn:'1 / -1'}}>
            <span className="muted">Address</span><br/>
            {[privateInfo?.profile?.address_line1,privateInfo?.profile?.address_line2,privateInfo?.profile?.city,privateInfo?.profile?.state,privateInfo?.profile?.postal_code].filter(Boolean).join(', ') || '—'}
          </div>
        </div>

        <h3 style={{marginBottom:8}}>Emergency contacts</h3>
        <div className="list">
          {(privateInfo?.emergency_contacts||[]).map((ec:any)=><div className="item" key={ec.id} style={{padding:12}}>
            <div>
              <strong>{ec.name}</strong>{ec.is_primary && <span className="status green" style={{marginLeft:8}}>Primary</span>}
              <div className="muted small">{ec.relationship || 'Relationship not provided'}</div>
            </div>
            <div className="small" style={{textAlign:'right'}}>
              <div>{ec.phone}</div>
              {ec.alternate_phone && <div className="muted">{ec.alternate_phone}</div>}
            </div>
          </div>)}
          {(privateInfo?.emergency_contacts||[]).length===0 && <div className="muted">No emergency contact on file.</div>}
        </div>

        <h3 style={{marginBottom:8}}>Medical information</h3>
        {privateInfo?.medical ? <div className="detailGrid">
          <div><span className="muted">Medical conditions</span><br/>{privateInfo.medical.medical_conditions || 'None listed'}</div>
          <div><span className="muted">Allergies</span><br/>{privateInfo.medical.allergies || 'None listed'}</div>
          <div><span className="muted">Medications</span><br/>{privateInfo.medical.medications || 'None listed'}</div>
          <div><span className="muted">Physical limitations</span><br/>{privateInfo.medical.physical_limitations || 'None listed'}</div>
          <div style={{gridColumn:'1 / -1'}}><span className="muted">Emergency notes</span><br/>{privateInfo.medical.emergency_notes || 'None listed'}</div>
        </div> : <div className="muted">No medical information on file.</div>}

        <h3 style={{marginBottom:8}}>Insurance</h3>
        {privateInfo?.medical ? <div className="detailGrid">
          <div><span className="muted">Insurance company</span><br/>{privateInfo.medical.insurance_company || '—'}</div>
          <div><span className="muted">Member ID</span><br/>{privateInfo.medical.insurance_member_id || '—'}</div>
          <div><span className="muted">Group #</span><br/>{privateInfo.medical.insurance_group_number || '—'}</div>
          <div><span className="muted">Insurance phone</span><br/>{privateInfo.medical.insurance_phone || '—'}</div>
        </div> : <div className="muted">No insurance information on file.</div>}
      </details>
    </section>

    <section className="card" style={{marginTop:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
        <div>
          <h2 style={{margin:'0 0 4px'}}>Organization notes</h2>
          <div className="muted small">Optional internal notes for this member. These are visible to organization managers, not the member.</div>
        </div>
        <div className="muted small">{notes.length} note{notes.length===1?'':'s'}</div>
      </div>

      <div style={{marginTop:14}}>
        <textarea
          placeholder="Add a note about this member, assignment, follow-up, or other organization-specific information…"
          value={newNote}
          onChange={e=>setNewNote(e.target.value)}
          style={{minHeight:90}}
        />
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:8}}>
          <button className="btn green" type="button" disabled={busy || !newNote.trim()} onClick={addNote}>
            {busy?'Saving…':'Add note'}
          </button>
        </div>
      </div>

      {notes.length>0 && <div className="list" style={{marginTop:16}}>
        {notes.map((n:any)=><div className="item" key={n.id} style={{alignItems:'flex-start',padding:12}}>
          <div style={{whiteSpace:'pre-wrap',lineHeight:1.45}}>
            {n.note}
            <div className="muted small" style={{marginTop:6}}>
              {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
            </div>
          </div>
          <button
            className="btn"
            type="button"
            style={{background:'#fde7e7',color:'#9a2626',padding:'7px 10px'}}
            onClick={()=>deleteNote(n.id)}
          >
            Delete
          </button>
        </div>)}
      </div>}
    </section>

    <section className="card" style={{marginTop:18}}>
      <h2 style={{marginTop:0}}>Activity history</h2>
      <div className="list">
        {(detail.history||[]).map((h:any)=><div className="item" key={h.id} style={{padding:12,alignItems:'flex-start'}}>
          <div>
            <strong>{h.event_label || h.event_type}</strong>
            {h.notes && <div className="muted small" style={{marginTop:3}}>{h.notes}</div>}
          </div>
          <div className="muted small" style={{whiteSpace:'nowrap'}}>{h.event_date ? new Date(h.event_date).toLocaleString() : ''}</div>
        </div>)}
        {(detail.history||[]).length===0 && <div className="muted">No organization activity has been recorded yet.</div>}
      </div>
    </section>

    <style jsx>{`
      .summaryGrid{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:14px}
      .metricSmall{font-size:28px;font-weight:800;margin-top:4px}
      .assignmentGrid{display:grid;grid-template-columns:1fr 2fr;gap:22px}
      .detailGrid{display:grid;grid-template-columns:repeat(3,minmax(130px,1fr));gap:10px 20px;font-size:13px;line-height:1.4}
      .small{font-size:13px;line-height:1.45}
      @media(max-width:900px){
        .summaryGrid{grid-template-columns:1fr 1fr}
        .assignmentGrid,.detailGrid{grid-template-columns:1fr}
      }
    `}</style>
  </AppShell>;
}
