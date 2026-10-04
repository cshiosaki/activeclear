'use client';

import { FormEvent,useEffect,useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function OrganizationGroups(){
  const router=useRouter();
  const [orgId,setOrgId]=useState('');
  const [org,setOrg]=useState<any>(null);
  const [groups,setGroups]=useState<any[]>([]);
  const [roster,setRoster]=useState<any[]>([]);
  const [division,setDivision]=useState('');
  const [level,setLevel]=useState('');
  const [groupName,setGroupName]=useState('');
  const [season,setSeason]=useState('');
  const [seasonId,setSeasonId]=useState('');
  const [seasons,setSeasons]=useState<any[]>([]);
  const [newSeasonName,setNewSeasonName]=useState('');
  const [newSeasonStart,setNewSeasonStart]=useState('');
  const [newSeasonEnd,setNewSeasonEnd]=useState('');
  const [selectedGroup,setSelectedGroup]=useState<any>(null);
  const [selectedMembers,setSelectedMembers]=useState<string[]>([]);
  const [divisionLabel,setDivisionLabel]=useState('Division');
  const [levelLabel,setLevelLabel]=useState('Level');
  const [groupLabel,setGroupLabel]=useState('Team / Group');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);
  const [mergeSource,setMergeSource]=useState<any>(null);
  const [mergeTargetId,setMergeTargetId]=useState('');

  useEffect(()=>setOrgId(new URLSearchParams(window.location.search).get('org')||''),[]);

  async function load(){
    if(!orgId)return;
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){router.replace('/login');return;}

    const {data:admin}=await supabase.from('organization_admins')
      .select('organization_id').eq('organization_id',orgId).eq('user_id',user.id).maybeSingle();
    if(!admin){router.replace('/organization');return;}

    const [{data:o},{data:g},{data:r},{data:s}] = await Promise.all([
      supabase.from('organizations').select('*').eq('id',orgId).maybeSingle(),
      supabase.from('organization_groups').select('*').eq('organization_id',orgId).eq('is_active',true)
        .order('division_name').order('level_name').order('group_name'),
      supabase.rpc('list_organization_roster_for_admin',{p_organization_id:orgId}),
      supabase.from('organization_seasons').select('*').eq('organization_id',orgId).order('start_date',{ascending:false})
    ]);

    setOrg(o);
    setGroups(g||[]);
    setRoster((r||[]).filter((x:any)=>x.membership_id && x.membership_status==='active'));
    setSeasons(s||[]);
    if(!seasonId){const current=(s||[]).find((x:any)=>x.is_current && x.is_active);if(current){setSeasonId(current.id);setSeason(current.name);}}
    setDivisionLabel(o?.division_label || 'Division');
    setLevelLabel(o?.level_label || 'Level');
    setGroupLabel(o?.group_label || 'Team / Group');
  }

  useEffect(()=>{if(orgId)load()},[orgId]);

  const divisions=useMemo(()=>Array.from(new Set(groups.map((g:any)=>g.division_name).filter(Boolean))),[groups]);

  async function createGroup(e:FormEvent){
    e.preventDefault();
    if(!groupName.trim())return;
    setBusy(true);setMsg('');
    const chosenSeason=seasons.find((s:any)=>s.id===seasonId);
    const {error}=await supabase.from('organization_groups').insert({
      organization_id:orgId,
      division_name:division.trim()||null,
      level_name:level.trim()||null,
      group_name:groupName.trim(),
      season:chosenSeason?.name || season.trim()||null,
      season_id:chosenSeason?.id || null,
      is_active:true
    });
    if(error)setMsg(error.message);
    else{
      setDivision('');setLevel('');setGroupName('');
      const current=seasons.find((x:any)=>x.is_current&&x.is_active);setSeasonId(current?.id||'');setSeason(current?.name||'');
      setMsg(`${groupLabel} created.`);
      await load();
    }
    setBusy(false);
  }

  async function createSeason(){
    if(!newSeasonName.trim())return;
    setBusy(true);setMsg('');
    const {data,error}=await supabase.from('organization_seasons').insert({
      organization_id:orgId,
      name:newSeasonName.trim(),
      start_date:newSeasonStart||null,
      end_date:newSeasonEnd||null,
      is_active:true,
      is_current:seasons.filter((x:any)=>x.is_active).length===0
    }).select('id,name,is_current').single();
    if(error)setMsg(error.message);
    else{
      setNewSeasonName('');setNewSeasonStart('');setNewSeasonEnd('');
      setMsg(`${data.name} season created.`);
      await load();
    }
    setBusy(false);
  }

  async function setCurrentSeason(id:string){
    setBusy(true);setMsg('');
    const {error}=await supabase.rpc('set_current_organization_season_for_admin',{p_organization_id:orgId,p_season_id:id});
    setMsg(error?error.message:'Current season updated.');
    if(!error){setSeasonId(id);await load();}
    setBusy(false);
  }

  async function archiveSeason(s:any){
    if(!window.confirm(`Archive ${s.name}?`))return;
    const {error}=await supabase.from('organization_seasons').update({is_active:false,is_current:false,updated_at:new Date().toISOString()}).eq('id',s.id);
    setMsg(error?error.message:`${s.name} archived.`);
    if(!error)await load();
  }

  async function saveLabels(){
    setBusy(true);setMsg('');
    const {error}=await supabase.from('organizations').update({
      division_label:divisionLabel.trim()||'Division',
      level_label:levelLabel.trim()||'Level',
      group_label:groupLabel.trim()||'Team / Group'
    }).eq('id',orgId);
    setMsg(error?error.message:'Hierarchy labels updated.');
    if(!error)await load();
    setBusy(false);
  }

  async function editGroup(g:any){
    const d=window.prompt(divisionLabel,g.division_name||'');
    if(d===null)return;
    const l=window.prompt(levelLabel,g.level_name||'');
    if(l===null)return;
    const n=window.prompt(groupLabel,g.group_name||'');
    if(n===null || !n.trim())return;
    const s=window.prompt('Season',g.season||'');
    if(s===null)return;
    const {error}=await supabase.from('organization_groups').update({
      division_name:d.trim()||null,
      level_name:l.trim()||null,
      group_name:n.trim(),
      season:s.trim()||null,
      needs_manager_review:false
    }).eq('id',g.id);
    setMsg(error?error.message:`${groupLabel} updated.`);
    if(!error)await load();
  }

  async function archiveGroup(g:any){
    if(!window.confirm(`Archive ${g.group_name}?`))return;
    const {error}=await supabase.from('organization_groups').update({is_active:false}).eq('id',g.id);
    setMsg(error?error.message:`${groupLabel} archived.`);
    if(!error){
      if(selectedGroup?.id===g.id){setSelectedGroup(null);setSelectedMembers([]);}
      await load();
    }
  }

  async function mergeGroup(){
    if(!mergeSource || !mergeTargetId)return;
    const target=groups.find((g:any)=>g.id===mergeTargetId);
    if(!target)return;
    const ok=window.confirm(`Merge "${mergeSource.group_name}" into "${target.group_name}"? Everyone assigned to the first group will be moved to the second, and the first group will be archived.`);
    if(!ok)return;
    setBusy(true);setMsg('');
    const {error}=await supabase.rpc('merge_organization_groups_for_admin',{
      p_organization_id:orgId,
      p_source_group_id:mergeSource.id,
      p_target_group_id:mergeTargetId
    });
    if(error)setMsg(error.message);
    else{
      setMsg(`${mergeSource.group_name} merged into ${target.group_name}.`);
      setMergeSource(null);setMergeTargetId('');
      await load();
    }
    setBusy(false);
  }

  async function openAssignments(g:any){
    setSelectedGroup(g);
    const ids=roster
      .filter((m:any)=>(m.groups||[]).some((x:any)=>x.id===g.id))
      .map((m:any)=>m.membership_id);
    setSelectedMembers(ids);
    window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
  }

  async function saveAssignments(){
    if(!selectedGroup)return;
    setBusy(true);setMsg('');
    const {data:existing,error:readErr}=await supabase.from('organization_group_members')
      .select('membership_id').eq('group_id',selectedGroup.id);
    if(readErr){setMsg(readErr.message);setBusy(false);return;}

    const current=(existing||[]).map((x:any)=>x.membership_id);
    const toAdd=selectedMembers.filter(id=>!current.includes(id));
    const toRemove=current.filter((id:string)=>!selectedMembers.includes(id));

    if(toRemove.length){
      const {error}=await supabase.from('organization_group_members')
        .delete().eq('group_id',selectedGroup.id).in('membership_id',toRemove);
      if(error){setMsg(error.message);setBusy(false);return;}
    }

    if(toAdd.length){
      const {error}=await supabase.from('organization_group_members')
        .insert(toAdd.map(membership_id=>({group_id:selectedGroup.id,membership_id})));
      if(error){setMsg(error.message);setBusy(false);return;}
    }

    setMsg(`${groupLabel} roster updated.`);
    await load();
    setBusy(false);
  }

  if(!org)return <div className="shell">Loading groups…</div>;

  return <AppShell>
    <div className="eyebrow">Organization structure</div>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start',flexWrap:'wrap'}}>
      <div>
        <h1 style={{marginBottom:8}}>{org.name}</h1>
        <p className="muted" style={{margin:0}}>Teams and groups are normally created from participant registration. Managers can review, correct, or create exceptions here.</p>
      </div>
      <a className="btn secondary" href={`/organization-dashboard?org=${orgId}`}>Back to organization home</a>
    </div>

    <div className="grid two" style={{marginTop:24}}>
      <section className="card">
        <h2 style={{marginTop:0}}>Hierarchy labels</h2>
        <p className="muted">Use terminology that fits the organization. For example: Age Division → Level → Team, or Program → Class → Group.</p>
        <div className="form">
          <div className="field"><label>Top level</label><input value={divisionLabel} onChange={e=>setDivisionLabel(e.target.value)}/></div>
          <div className="field"><label>Second level</label><input value={levelLabel} onChange={e=>setLevelLabel(e.target.value)}/></div>
          <div className="field"><label>Team / group level</label><input value={groupLabel} onChange={e=>setGroupLabel(e.target.value)}/></div>
          <button className="btn secondary" type="button" onClick={saveLabels} disabled={busy}>Save labels</button>
        </div>
      </section>

      <section className="card">
        <h2 style={{marginTop:0}}>Create {groupLabel} manually</h2>
        <p className="muted">Use this only when a team/group needs to be added before someone registers.</p>
        <form className="form" onSubmit={createGroup}>
          <div className="field"><label>{divisionLabel}</label><input placeholder="Example: 8U Boys" value={division} onChange={e=>setDivision(e.target.value)}/></div>
          <div className="field"><label>{levelLabel}</label><input placeholder="Example: Double A" value={level} onChange={e=>setLevel(e.target.value)}/></div>
          <div className="field"><label>{groupLabel}</label><input required placeholder="Example: Stars" value={groupName} onChange={e=>setGroupName(e.target.value)}/></div>
          <div className="field"><label>Season</label>
            {seasons.some((s:any)=>s.is_active) ? <select value={seasonId} onChange={e=>{setSeasonId(e.target.value);setSeason(seasons.find((s:any)=>s.id===e.target.value)?.name||'')}}>
              <option value="">No season</option>
              {seasons.filter((s:any)=>s.is_active).map((s:any)=><option key={s.id} value={s.id}>{s.name}{s.is_current?' · Current':''}</option>)}
            </select> : <input placeholder="Example: Spring 2027" value={season} onChange={e=>setSeason(e.target.value)}/>}
          </div>
          <button className="btn green" disabled={busy || !groupName.trim()}>{busy?'Saving…':`Create ${groupLabel}`}</button>
        </form>
      </section>
    </div>


    <section className="card" style={{marginTop:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
        <div>
          <h2 style={{margin:'0 0 4px'}}>Seasons</h2>
          <div className="muted">Keep current and past rosters separate without deleting historical teams.</div>
        </div>
      </div>

      <div className="grid two" style={{marginTop:16}}>
        <div className="form">
          <div className="field"><label>Season name</label><input placeholder="Example: Spring 2027" value={newSeasonName} onChange={e=>setNewSeasonName(e.target.value)}/></div>
          <div className="row">
            <div className="field"><label>Start date</label><input type="date" value={newSeasonStart} onChange={e=>setNewSeasonStart(e.target.value)}/></div>
            <div className="field"><label>End date</label><input type="date" value={newSeasonEnd} onChange={e=>setNewSeasonEnd(e.target.value)}/></div>
          </div>
          <button className="btn green" type="button" disabled={busy||!newSeasonName.trim()} onClick={createSeason}>Add season</button>
        </div>

        <div className="list">
          {seasons.map((s:any)=><div className="item" key={s.id} style={{padding:12}}>
            <div>
              <strong>{s.name}</strong>{s.is_current&&<span className="status green" style={{marginLeft:8}}>Current</span>}{!s.is_active&&<span className="status red" style={{marginLeft:8}}>Archived</span>}
              <div className="muted" style={{fontSize:13,marginTop:3}}>{[s.start_date,s.end_date].filter(Boolean).join(' → ') || 'Dates not set'}</div>
            </div>
            {s.is_active&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {!s.is_current&&<button className="btn secondary" type="button" onClick={()=>setCurrentSeason(s.id)}>Make current</button>}
              <button className="btn secondary" type="button" onClick={()=>archiveSeason(s)}>Archive</button>
            </div>}
          </div>)}
          {seasons.length===0&&<div className="muted">No seasons created yet.</div>}
        </div>
      </div>
    </section>

    <section className="card" style={{marginTop:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div>
          <h2 style={{margin:'0 0 4px'}}>Current {groupLabel}s</h2>
          <div className="muted">{groups.length} active {groupLabel.toLowerCase()}{groups.length===1?'':'s'} across {divisions.length} {divisionLabel.toLowerCase()}{divisions.length===1?'':'s'}</div>
        </div>
        <a className="btn secondary" href={`/organization-users?org=${orgId}`}>View roster</a>
      </div>

      <div className="list" style={{marginTop:16}}>
        {groups.map((g:any)=>{
          const assigned=roster.filter((m:any)=>(m.groups||[]).some((x:any)=>x.id===g.id));
          const compliant=assigned.filter((m:any)=>m.is_compliant).length;
          return <div className="item" key={g.id} style={{alignItems:'flex-start'}}>
            <div>
              <strong>{g.group_name}</strong>{g.needs_manager_review && <span className="status amber" style={{marginLeft:8}}>Review</span>}
              <div className="muted" style={{marginTop:4}}>{[g.division_name,g.level_name,g.season].filter(Boolean).join(' · ') || 'No additional classification'}</div>
              <div style={{marginTop:8,fontSize:13}}>{assigned.length} people · {compliant} compliant · {assigned.length-compliant} need review/attention</div>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
              <button className="btn secondary" type="button" onClick={()=>openAssignments(g)}>Assign people</button>
              <button className="btn secondary" type="button" onClick={()=>editGroup(g)}>Edit</button>
              <button className="btn secondary" type="button" onClick={()=>{setMergeSource(g);setMergeTargetId('')}}>Merge</button>
              <button className="btn" type="button" style={{background:'#fde7e7',color:'#9a2626'}} onClick={()=>archiveGroup(g)}>Archive</button>
            </div>
          </div>
        })}
        {groups.length===0 && <div className="muted">No {groupLabel.toLowerCase()}s created yet.</div>}
      </div>
    </section>


    {mergeSource && <section className="card" style={{marginTop:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow">Merge duplicate</div>
          <h2 style={{margin:'6px 0 4px'}}>Merge {mergeSource.group_name}</h2>
          <div className="muted">Choose the correct {groupLabel.toLowerCase()} to keep. Members from this group will be reassigned automatically.</div>
        </div>
        <button className="btn secondary" type="button" onClick={()=>{setMergeSource(null);setMergeTargetId('')}}>Cancel</button>
      </div>

      <div className="field" style={{maxWidth:620,marginTop:16}}>
        <label>Keep this {groupLabel}</label>
        <select value={mergeTargetId} onChange={e=>setMergeTargetId(e.target.value)}>
          <option value="">Select target {groupLabel.toLowerCase()}</option>
          {groups.filter((g:any)=>g.id!==mergeSource.id).map((g:any)=><option key={g.id} value={g.id}>
            {[g.division_name,g.level_name,g.group_name,g.season].filter(Boolean).join(' · ')}
          </option>)}
        </select>
      </div>

      <div className="notice" style={{marginTop:12}}>
        <strong>{mergeSource.group_name}</strong> will be archived after the merge. Existing member assignments will move to the selected group.
      </div>

      <button className="btn green" type="button" disabled={busy || !mergeTargetId} onClick={mergeGroup} style={{marginTop:14}}>
        {busy?'Merging…':'Merge groups'}
      </button>
    </section>}

    {selectedGroup && <section className="card" style={{marginTop:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow">Assign people</div>
          <h2 style={{margin:'6px 0 4px'}}>{selectedGroup.group_name}</h2>
          <div className="muted">{[selectedGroup.division_name,selectedGroup.level_name,selectedGroup.season].filter(Boolean).join(' · ')}</div>
        </div>
        <button className="btn secondary" type="button" onClick={()=>{setSelectedGroup(null);setSelectedMembers([])}}>Close</button>
      </div>

      <div className="list" style={{marginTop:16}}>
        {roster.map((m:any)=>{
          const name=[m.first_name,m.last_name].filter(Boolean).join(' ') || m.email || 'Participant';
          return <label className="item" key={m.membership_id} style={{cursor:'pointer'}}>
            <div>
              <strong>{name}</strong>
              <div className="muted" style={{fontSize:13,marginTop:3}}>{m.membership_role || 'Participant'}</div>
            </div>
            <input
              type="checkbox"
              checked={selectedMembers.includes(m.membership_id)}
              onChange={e=>setSelectedMembers(e.target.checked
                ? [...selectedMembers,m.membership_id]
                : selectedMembers.filter(x=>x!==m.membership_id)
              )}
              style={{width:20,height:20}}
            />
          </label>
        })}
      </div>
      <button className="btn green" type="button" onClick={saveAssignments} disabled={busy} style={{marginTop:16}}>
        {busy?'Saving…':'Save assignments'}
      </button>
    </section>}

    {msg && <div className="notice" style={{marginTop:16}}>{msg}</div>}
  </AppShell>;
}
