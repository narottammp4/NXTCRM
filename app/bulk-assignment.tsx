"use client";
import { useState } from 'react';
import ImportSelect from './import-select';
export default function BulkAssignment({clients,campaigns,users,initialCampaign='',post,onSaved}:{clients:any[];campaigns:any[];users:any[];initialCampaign?:string;post:(body:any)=>Promise<any>;onSaved:()=>Promise<any>}) {
 const [scope,setScope]=useState(initialCampaign?'campaign':'clients');
 const [selected,setSelected]=useState<string[]>([]),[campaign,setCampaign]=useState(initialCampaign),[caller,setCaller]=useState('');
 const [preview,setPreview]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const reset=()=>{setPreview(null);setError('');setSuccess('');};
 async function run(confirm=false) {
  setBusy(true);setError('');setSuccess('');
  try {
   const r=await post({scope,client_ids:selected,campaign_id:campaign,assignee:caller,action:confirm?'bulkAssign':'bulkAssignPreview',...(confirm?{signature:preview.signature}:{})});
   if(confirm){setPreview(null);await onSaved();setSuccess(r.count+' leads assigned successfully.');}else setPreview(r);
  }catch(e:any){setError(e.message);setPreview(null);}finally{setBusy(false);}
 }
 return <section className="panel" style={{padding:20}}>
  <h2>Assign leads to a caller</h2>
  <p>Assign all current active leads from selected clients or one full campaign. Existing assignments will be replaced. Leads in Trash are excluded. Future imports keep their own assignment.</p>
  <fieldset disabled={busy} style={{border:0,padding:0,display:'grid',gap:16,marginTop:16}}>
   <label>Assign by<ImportSelect disabled={busy} aria-label="Assignment scope" value={scope} onChange={e=>{reset();setScope(e.target.value);}}><option value="clients">Multiple clients</option><option value="campaign">Full campaign</option></ImportSelect></label>
   {scope==='clients'?<div>
    <label style={{display:'flex',gap:10,alignItems:'center',marginBottom:12}}><input type="checkbox" checked={clients.length>0 && selected.length===clients.length} onChange={e=>{reset();setSelected(e.target.checked?clients.map(c=>c.id):[]);}}/>Select all clients ({clients.length})</label>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(220px,100%),1fr))',gap:12,maxHeight:300,overflowY:'auto'}}>{clients.map(c=><label key={c.id} style={{display:'flex',gap:10,alignItems:'center',overflowWrap:'anywhere'}}><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>{reset();setSelected(ids=>e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id));}}/>{c.name}</label>)}</div>
    <p>{selected.length} clients selected. All their projects and campaigns are included.</p>
   </div>:<label>Campaign<ImportSelect disabled={busy} aria-label="Campaign to assign" value={campaign} onChange={e=>{reset();setCampaign(e.target.value);}}><option value="">Choose campaign</option>{campaigns.map(c=><option key={c.id} value={c.id}>{clients.find(cl=>cl.id===c.client_id)?.name} · {c.name}</option>)}</ImportSelect></label>}
   <label>Assign to<ImportSelect disabled={busy} aria-label="Assign to caller" value={caller} onChange={e=>{reset();setCaller(e.target.value);}}><option value="">Choose active caller</option>{users.filter(u=>u.role==='caller' && u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</ImportSelect></label>
   <button type="button" className="secondary" disabled={busy || !caller || (scope==='clients'?!selected.length:!campaign)} onClick={()=>run()}>Review assignment</button>
   {preview && <div className="import-review" role="status"><strong>{preview.total} active leads found</strong><p>{preview.changed} leads will be reassigned to {users.find(u=>u.id===caller)?.name}. {preview.total-preview.changed} already belong to this caller. Notes and history are preserved; pending call prompts for reassigned leads are cleared.</p><button type="button" className="primary" disabled={busy || !preview.changed} onClick={()=>run(true)}>{busy?'Assigning…':'Confirm assignment of '+preview.changed+' leads'}</button></div>}
  </fieldset>
  {error && <p role="alert">{error}</p>}{success && <p role="status">{success}</p>}
 </section>;
}
