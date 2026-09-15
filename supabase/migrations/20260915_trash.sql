-- Apply after both 20260913 migrations, before deploying the replacement API.
begin;
alter table public.leads add column if not exists deleted_at timestamptz;
alter table public.leads add column if not exists deleted_by uuid;
create index if not exists leads_deleted_at on public.leads(deleted_at);

create or replace function public.crm_snapshot_v3(actor_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb; k text; admin_access boolean;
begin
 r:=public.crm_snapshot_v2(actor_id);
 admin_access:=r->'user'->>'role'='admin';
 r:=r||jsonb_build_object('trash',case when admin_access then coalesce((select jsonb_agg(to_jsonb(l) order by deleted_at desc) from public.leads l where deleted_at is not null),'[]'::jsonb) else '[]'::jsonb end);
 r:=jsonb_set(r,'{leads}',coalesce((select jsonb_agg(e) from jsonb_array_elements(r->'leads') e where e->>'deleted_at' is null),'[]'::jsonb));
 foreach k in array array['activities','events'] loop
  r:=jsonb_set(r,array[k],coalesce((select jsonb_agg(e) from jsonb_array_elements(r->k) e join public.leads l on l.id=(e->>'leadId')::uuid where l.deleted_at is null),'[]'::jsonb));
 end loop;
 if not admin_access then
  foreach k in array array['clients','projects','campaigns'] loop
   r:=jsonb_set(r,array[k],coalesce((select jsonb_agg(e) from jsonb_array_elements(r->k) e where (k='clients' and e->>'name'='Uncategorised') or exists(select 1 from public.leads l where l.deleted_at is null and l.assignee=actor_id and l.client_id=(case when k='clients' then e->>'id' else e->>'client_id' end)::uuid)),'[]'::jsonb));
  end loop;
 end if;
 if exists(select 1 from public.leads where id=(r->'pending'->>'leadId')::uuid and deleted_at is not null) then r:=jsonb_set(r,'{pending}','null');end if;
 return r;
end $$;

create or replace function public.crm_mutate_v3(actor_id uuid,b jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u public.users; a text:=b->>'action'; ids uuid[]; n integer; lead public.leads; campaign public.campaigns;
begin
 select * into u from public.users where id=actor_id and active for update;
 if u.id is null then raise exception '403:Account disabled';end if;
 if a in ('trashLeads','restoreLeads','purgeLeads','deleteCampaign') then
  if u.role<>'admin' then raise exception '403:Admin access required';end if;
  if a='deleteCampaign' then
   select * into campaign from public.campaigns where id=(b->>'id')::uuid for update;
   if not found then raise exception '404:Campaign not found';end if;
   insert into public.activities("leadId","userId",type,note)
    select id,u.id,'classification','Campaign deleted: '||campaign.name||'. Lead kept without a campaign.' from public.leads where campaign_id=campaign.id;
   update public.leads set campaign_id=null,updated=now() where campaign_id=campaign.id;
   delete from public.campaigns where id=campaign.id;
   return '{"ok":true}'::jsonb;
  end if;
  if jsonb_typeof(b->'ids') is distinct from 'array' then raise exception 'Select leads';end if;
  if jsonb_array_length(b->'ids') not between 1 and 500 then raise exception 'Select between 1 and 500 leads';end if;
  select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(b->'ids');
  perform id from public.leads where id=any(ids) order by id for update;
  select count(*) into n from public.leads where id=any(ids) and ((a='trashLeads' and deleted_at is null) or (a<>'trashLeads' and deleted_at is not null));
  if n<>cardinality(ids) then raise exception 'Some leads changed or no longer exist. Refresh and select again.';end if;
  if a='purgeLeads' then
   delete from public.leads where id=any(ids);
  elsif a='trashLeads' then
   update public.leads set deleted_at=now(),deleted_by=u.id,updated=now() where id=any(ids);
   delete from public.pending where "leadId"=any(ids);
   insert into public.activities("leadId","userId",type,note) select unnest(ids),u.id,'trash','Moved to Trash';
  else
   update public.leads set deleted_at=null,deleted_by=null,updated=now() where id=any(ids);
   insert into public.activities("leadId","userId",type,note) select unnest(ids),u.id,'restore','Restored from Trash';
  end if;
  return jsonb_build_object('ok',true,'count',n);
 end if;
 if a in ('assign','startCall','update','categorize') then
  select * into lead from public.leads where id=(b->>'id')::uuid for update;
  if not found or lead.deleted_at is not null then raise exception '404:Active lead not found';end if;
 end if;
 return public.crm_mutate_v2(actor_id,b);
end $$;
revoke all on function public.crm_snapshot_v3(uuid),public.crm_mutate_v3(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_snapshot_v3(uuid),public.crm_mutate_v3(uuid,jsonb) to service_role;
commit;
