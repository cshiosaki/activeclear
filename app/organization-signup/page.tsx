'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

const ORG_TYPES = [
  'Youth Sports League',
  'Club',
  'Dojo / Martial Arts School',
  'Recreation Program',
  'School / Athletic Program',
  'Tournament / Event Organizer',
  'Governing Body / Association',
  'Nonprofit',
  'Other',
];

const SPORTS = [
  'Baseball',
  'Basketball',
  'Football',
  'Judo',
  'Soccer',
  'Softball',
  'Volleyball',
  'Cheer',
  'Wrestling',
  'Martial Arts',
  'Other',
];

const GOVERNING_BODIES: Record<string,string[]> = {
  Baseball: ['Little League','Babe Ruth League','PONY Baseball','USSSA','None / Local','Other'],
  Football: ['TYSA','USA Football','Pop Warner','None / Local','Other'],
  Judo: ['USJF','USA Judo','USJA','USJF / USA Judo','None / Local','Other'],
  Basketball: ['AAU','NYA / Local','None / Local','Other'],
  Soccer: ['US Youth Soccer','AYSO','US Club Soccer','None / Local','Other'],
  Softball: ['Little League','USA Softball','USSSA','None / Local','Other'],
  Volleyball: ['USA Volleyball','AAU','None / Local','Other'],
  Cheer: ['USA Cheer','None / Local','Other'],
  Wrestling: ['USA Wrestling','AAU','None / Local','Other'],
  'Martial Arts': ['None / Local','Other'],
  Other: ['None / Local','Other'],
};

function normalizeWebsite(value:string){
  const v=value.trim();
  if(!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export default function OrganizationSignup(){
  const router=useRouter();
  const [uid,setUid]=useState('');
  const [mode,setMode]=useState<'create'|'existing'>('create');

  const [orgs,setOrgs]=useState<any[]>([]);
  const [selected,setSelected]=useState('');
  const [note,setNote]=useState('');
  const [requests,setRequests]=useState<any[]>([]);

  const [form,setForm]=useState({
    name:'',
    organization_type:'',
    sport:'',
    governing_body:'',
    governing_bodies:[] as string[],
    other_governing_body:'',
    description:'',
    admin_title:'',
    contact_name:'',
    contact_email:'',
    contact_phone:'',
    website:'',
    address_line1:'',
    address_line2:'',
    city:'',
    state:'',
    postal_code:'',
  });

  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  async function load(userId:string){
    const [{data:o},{data:r}] = await Promise.all([
      supabase.rpc('list_active_organization_directory'),
      supabase.from('organization_claim_requests')
        .select('*,organizations(name,sport,governing_body)')
        .eq('user_id',userId)
        .order('created_at',{ascending:false})
    ]);
    setOrgs(o||[]);
    setRequests(r||[]);
    if(!selected && o?.[0]) setSelected(o[0].id);
  }

  useEffect(()=>{
    (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace('/login');return;}
      setUid(user.id);
      await load(user.id);
    })();
  },[router]);

  function setSport(sport:string){
    setForm({...form,sport,governing_body:'',governing_bodies:[],other_governing_body:''});
  }

  async function createOrganization(e:FormEvent){
    e.preventDefault();
    if(!form.name.trim()) return;

    setBusy(true);
    setMsg('');

    const {data,error}=await supabase.rpc('create_organization_for_current_user',{
      p_name:form.name.trim(),
      p_sport:form.sport || null,
      p_governing_body:form.governing_bodies[0] || null,
      p_governing_bodies:form.governing_bodies,
      p_organization_type:form.organization_type || 'Club',
      p_description:form.description || null,
      p_admin_title:form.admin_title || null,
      p_contact_name:form.contact_name || null,
      p_contact_email:form.contact_email || null,
      p_contact_phone:form.contact_phone || null,
      p_website:normalizeWebsite(form.website) || null,
      p_address_line1:form.address_line1 || null,
      p_address_line2:form.address_line2 || null,
      p_city:form.city || null,
      p_state:form.state || null,
      p_postal_code:form.postal_code || null,
    });

    if(error){
      setMsg(error.message);
      setBusy(false);
      return;
    }

    for(const body of form.governing_bodies){
      if(!governingOptions.includes(body)){
        await supabase.rpc('add_governing_body_option',{
          p_sport:form.sport,
          p_name:body,
          p_source_organization_id:data
        });
      }
    }

    setMsg('Organization created. Opening setup…');
    router.push(`/organization-manage?org=${data}`);
  }

  async function requestAccess(e:FormEvent){
    e.preventDefault();
    if(!selected) return;
    setBusy(true);
    setMsg('');

    const {error}=await supabase.from('organization_claim_requests').insert({
      organization_id:selected,
      user_id:uid,
      requested_role:'admin',
      request_note:note || null
    });

    setMsg(error?.message || 'Organization access request submitted.');
    if(!error){
      setNote('');
      await load(uid);
    }
    setBusy(false);
  }

  const governingOptions=form.sport ? (GOVERNING_BODIES[form.sport] || ['None / Local','Other']) : [];

  return <AppShell>
    <div className="eyebrow">Organization onboarding</div>
    <h1>Set up an organization</h1>
    <p className="muted">
      Create a new organization, or request access to one that already exists in ActiveClear.
    </p>

    <div className="tabs" style={{maxWidth:560}}>
      <button className={mode==='create'?'active':''} onClick={()=>{setMode('create');setMsg('')}}>
        Create new organization
      </button>
      <button className={mode==='existing'?'active':''} onClick={()=>{setMode('existing');setMsg('')}}>
        Existing organization
      </button>
    </div>

    {mode==='create' ? (
      <section className="card" style={{maxWidth:820}}>
        <h2>Organization profile</h2>
        <form className="form" onSubmit={createOrganization}>
          <div className="field">
            <label>Organization name</label>
            <input
              required
              placeholder="South Bay Judo"
              value={form.name}
              onChange={e=>setForm({...form,name:e.target.value})}
            />
          </div>

          <div className="field">
            <label>Your role with this organization</label>
            <input
              required
              placeholder="Example: Board Member, President, Compliance Administrator"
              value={form.admin_title}
              onChange={e=>setForm({...form,admin_title:e.target.value})}
            />
          </div>

          <div className="field">
            <label>What does the organization do?</label>
            <textarea
              required
              placeholder="Describe the organization, who it serves, and the activities or sports it provides."
              value={form.description}
              onChange={e=>setForm({...form,description:e.target.value})}
            />
          </div>

          <div className="row">
            <div className="field">
              <label>Organization type</label>
              <select required value={form.organization_type} onChange={e=>setForm({...form,organization_type:e.target.value})}>
                <option value="">Select organization type</option>
                {ORG_TYPES.map(x=><option key={x} value={x}>{x}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Primary sport / activity</label>
              <select required value={form.sport} onChange={e=>setSport(e.target.value)}>
                <option value="">Select sport / activity</option>
                {SPORTS.map(x=><option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Governing body / affiliation</label>
            {!form.sport ? (
              <div className="muted">Select a sport first.</div>
            ) : (
              <div className="list">
                {governingOptions.filter(x=>x!=='Other').map(x=>(
                  <label className="item" key={x} style={{cursor:'pointer'}}>
                    <span>{x}</span>
                    <input
                      type="checkbox"
                      checked={form.governing_bodies.includes(x)}
                      onChange={e=>setForm({
                        ...form,
                        governing_bodies:e.target.checked
                          ? [...form.governing_bodies,x]
                          : form.governing_bodies.filter(v=>v!==x)
                      })}
                      style={{width:20,height:20}}
                    />
                  </label>
                ))}
                <label className="item" style={{cursor:'pointer'}}>
                  <span>Other</span>
                  <input
                    type="checkbox"
                    checked={form.governing_body==='Other'}
                    onChange={e=>setForm({
                      ...form,
                      governing_body:e.target.checked?'Other':'',
                      other_governing_body:e.target.checked?form.other_governing_body:''
                    })}
                    style={{width:20,height:20}}
                  />
                </label>
              </div>
            )}
          </div>

          {form.governing_body==='Other' && (
            <div className="field">
              <label>Enter other governing body / affiliation</label>
              <div style={{display:'flex',gap:8}}>
                <input
                  placeholder="Type the full organization name"
                  value={form.other_governing_body}
                  onChange={e=>setForm({...form,other_governing_body:e.target.value})}
                />
                <button
                  className="btn secondary"
                  type="button"
                  onClick={()=>{
                    const v=form.other_governing_body.trim();
                    if(!v) return;
                    if(!form.governing_bodies.includes(v)){
                      setForm({...form,governing_bodies:[...form.governing_bodies,v],other_governing_body:'',governing_body:''});
                    }else{
                      setForm({...form,other_governing_body:'',governing_body:''});
                    }
                  }}
                >
                  Add
                </button>
              </div>
              <small className="muted">You can add more than one affiliation. New names are saved for future organization setups.</small>
            </div>
          )}

          {form.governing_bodies.length>0 && (
            <div className="notice">
              <strong>Selected:</strong> {form.governing_bodies.join(' · ')}
            </div>
          )}

          <h3>Organization contact information</h3>
          <div className="row">
            <div className="field">
              <label>Contact name</label>
              <input value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})}/>
            </div>
            <div className="field">
              <label>Contact email</label>
              <input type="email" value={form.contact_email} onChange={e=>setForm({...form,contact_email:e.target.value})}/>
            </div>
            <div className="field">
              <label>Contact phone</label>
              <input value={form.contact_phone} onChange={e=>setForm({...form,contact_phone:e.target.value})}/>
            </div>
            <div className="field">
              <label>Website</label>
              <input
                type="text"
                inputMode="url"
                placeholder="www.example.com"
                value={form.website}
                onChange={e=>setForm({...form,website:e.target.value})}
                onBlur={()=>setForm(current=>({...current,website:normalizeWebsite(current.website)}))}
              />
              <small className="muted">You can enter www.example.com — ActiveClear will add https:// automatically.</small>
            </div>
          </div>

          <h3>Address</h3>
          <div className="field">
            <label>Address</label>
            <input value={form.address_line1} onChange={e=>setForm({...form,address_line1:e.target.value})}/>
          </div>
          <div className="field">
            <label>Address line 2</label>
            <input value={form.address_line2} onChange={e=>setForm({...form,address_line2:e.target.value})}/>
          </div>
          <div className="row">
            <div className="field">
              <label>City</label>
              <input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/>
            </div>
            <div className="field">
              <label>State</label>
              <input value={form.state} onChange={e=>setForm({...form,state:e.target.value})}/>
            </div>
          </div>
          <div className="field" style={{maxWidth:220}}>
            <label>ZIP / postal code</label>
            <input value={form.postal_code} onChange={e=>setForm({...form,postal_code:e.target.value})}/>
          </div>

          {msg && <div className="notice">{msg}</div>}

          <button className="btn green" disabled={busy}>
            {busy ? 'Creating…' : 'Create organization'}
          </button>
        </form>
      </section>
    ) : (
      <div className="grid two">
        <section className="card">
          <h2>Request organization access</h2>
          <form className="form" onSubmit={requestAccess}>
            <div className="field">
              <label>Organization</label>
              <select value={selected} onChange={e=>setSelected(e.target.value)}>
                {orgs.map(o=><option key={o.id} value={o.id}>
                  {o.name}{o.sport ? ' — '+o.sport : ''}
                </option>)}
              </select>
            </div>

            <div className="field">
              <label>Your role / note</label>
              <textarea
                placeholder="Explain your connection to the organization."
                value={note}
                onChange={e=>setNote(e.target.value)}
              />
            </div>

            <div className="notice">
              Access to an existing organization requires approval.
            </div>

            {msg && <div className="notice">{msg}</div>}

            <button className="btn green" disabled={busy}>
              {busy ? 'Submitting…' : 'Request admin access'}
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Your access requests</h2>
          {requests.length===0 ? <p className="muted">No organization requests yet.</p> :
            <div className="list">
              {requests.map(r=>{
                const org:any=Array.isArray(r.organizations)?r.organizations[0]:r.organizations;
                return <div className="item" key={r.id}>
                  <div>
                    <strong>{org?.name || 'Organization'}</strong>
                    <div className="muted">
                      {[org?.sport,org?.governing_body].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className={'status '+(r.status==='approved'?'green':r.status==='rejected'?'red':'amber')}>
                    {r.status}
                  </span>
                </div>
              })}
            </div>
          }
        </section>
      </div>
    )}
  </AppShell>
}
