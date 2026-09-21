import { prepare, type Field } from './import-leads';
export function phoneKey(value: string) {
 const p = String(value || '').trim().replace(/^p:/i, '').replace(/[\s().-]/g, '');
 return p.length === 10 && /^\d+$/.test(p) ? '+91' + p : '+' + p.replace(/^\+/, '');
}
export function enquiryKey(l: any) {
 const label=String(l.project || '').trim().toLowerCase();
 return JSON.stringify([phoneKey(l.phone),l.client_id || '',l.project_id || 'text:' + (label === 'not specified' ? '' : label)]);
}
export function reviewEnquiries(headers: string[], rows: string[][], mapping: string[], fields: Field[], existing: any[], context: {clientId: string;projectId: string;campaignId: string;projects: any[]}, choices: Record<number, 'keep'|'discard'>) {
 const decorate=(l:any)=>{
  const p=context.projects.find(p=>p.client_id===context.clientId && (context.projectId ? p.id===context.projectId : p.name.trim().toLowerCase()===String(l.project||'').trim().toLowerCase()));
  return {...l,client_id:context.clientId,project_id:context.projectId || p?.id || '',project:p?.name || l.project || 'Not specified',campaign_id:context.campaignId};
 };
 const all=prepare(headers,rows,mapping,fields,[],{skipDuplicateChecks:true}).leads.map(decorate);
 const active=existing.filter(l=>!l.deleted_at);
 const entries=all.map((lead,index)=>({lead,index,duplicates:all.flatMap((other,j)=>j!==index && phoneKey(other.phone)===phoneKey(lead.phone)?[j]:[]),existing:active.filter(other=>enquiryKey(other)===enquiryKey(lead)),related:active.filter(other=>phoneKey(other.phone)===phoneKey(lead.phone) && enquiryKey(other)!==enquiryKey(lead))}));
 const unresolved=entries.filter(e=>choices[e.index]!=='discard' && (e.existing.length>0 || ((e.duplicates.length>0 || e.related.length>0) && choices[e.index]!=='keep')));
 const keptIndexes=entries.filter(e=>choices[e.index]!=='discard' && !e.existing.length && (!(e.duplicates.length || e.related.length) || choices[e.index]==='keep')).map(e=>e.index);
 const result=prepare(headers,keptIndexes.map(i=>rows[i]),mapping,fields,[],{skipDuplicateChecks:true,rowNumbers:keptIndexes.map(i=>i+2)});
 result.leads=result.leads.map(decorate);
 if(unresolved.length)result.errors.unshift('Resolve '+unresolved.length+' duplicate rows using Keep or Discard below.');
 if(new Set(result.leads.map(enquiryKey)).size!==result.leads.length)result.errors.unshift('Keep only one row for each phone within the same client/project.');
 return {entries,keptIndexes,result};
}
