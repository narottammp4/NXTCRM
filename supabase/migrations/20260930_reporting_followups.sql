-- Apply after 20260921_active_enquiries.sql. Run before deploying the patch.
begin;
alter table public.leads add column if not exists followup_important boolean not null default false;
alter table public.leads drop constraint if exists leads_status_check;
-- The old combined status cannot be split reliably. Preserve every lead and map it to Not Interested.
update public.leads set status='Not Interested' where status='Not Interested / Lost';
update public.activities set status='Not Interested' where status='Not Interested / Lost';
alter table public.leads add constraint leads_status_check check(status in
 ('New','Contacted','Interested','Follow-up Required','Site Visit Booked','Site Visit Completed','Negotiation','Booked / Won','Not Interested','Lost'));

create or replace function public.crm_snapshot_v4(actor_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 r:=public.crm_snapshot_v3(actor_id);
 -- A reassigned lead must not expose another caller's activity history.
 if r->'user'->>'role'<>'admin' then
  r:=jsonb_set(r,'{activities}',coalesce((select jsonb_agg(e order by e->>'created' desc) from jsonb_array_elements(r->'activities') e where e->>'userId'=actor_id::text),'[]'::jsonb));
 end if;
 return r;
end $$;

create or replace function public.crm_report(actor_id uuid, date_from timestamptz, date_to timestamptz, client_filter uuid default null, caller_filter uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u public.users; effective_caller uuid;
begin
 select * into u from public.users where id=actor_id and active;
 if u.id is null then raise exception '403:Account disabled';end if;
 if date_from is null or date_to is null or not isfinite(date_from) or not isfinite(date_to) or date_to<=date_from then raise exception 'Choose a valid date range';end if;
 if u.role<>'admin' and caller_filter is not null and caller_filter<>u.id then raise exception '403:You can only view your own reports';end if;
 effective_caller:=case when u.role='admin' then caller_filter else u.id end;
 if effective_caller is not null and not exists(select 1 from public.users where id=effective_caller) then raise exception '404:Caller not found';end if;
 return jsonb_build_object(
 'events',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('phone',l.phone,'name',l.name,'client_id',l.client_id,'project',l.project) order by a.created,a.id)
  from public.activities a join public.leads l on l.id=a."leadId"
  where l.deleted_at is null and a.created>=date_from and a.created<date_to
  and (client_filter is null or l.client_id=client_filter)
  and (effective_caller is null or a."userId"=effective_caller)),'[]'::jsonb),
 'leads',coalesce((select jsonb_agg(to_jsonb(l) order by l.updated desc) from public.leads l
  where l.deleted_at is null and (client_filter is null or l.client_id=client_filter)
  and (effective_caller is null or l.assignee=effective_caller)),'[]'::jsonb),
 'users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name) from public.users p
  where effective_caller is null or p.id=effective_caller),'[]'::jsonb));
end $$;
create index if not exists activities_report_date on public.activities(created,"userId");

create or replace function public.crm_mutate_v5(actor_id uuid,b jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u public.users; l public.leads; status_value text; followup_value timestamptz; visit_value timestamptz; important_value boolean;
begin
 if b->>'action' is distinct from 'update' then return public.crm_mutate_v4(actor_id,b);end if;
 select * into u from public.users where id=actor_id and active for update;
 if u.id is null then raise exception '403:Account disabled';end if;
 select * into l from public.leads where id=(b->>'id')::uuid and deleted_at is null for update;
 if l.id is null then raise exception '404:Active lead not found';end if;
 if u.role<>'admin' and l.assignee<>u.id then raise exception '403:Lead access denied';end if;
 status_value:=coalesce(nullif(b->>'status',''),l.status);
 followup_value:=case when b ? 'followup' then nullif(b->>'followup','')::timestamptz else l.followup end;
 visit_value:=case when b ? 'visit' then nullif(b->>'visit','')::timestamptz else l.visit end;
 if b ? 'followup_important' and jsonb_typeof(b->'followup_important') is distinct from 'boolean' then raise exception 'Important must be true or false';end if;
 important_value:=case when b ? 'followup_important' then (b->>'followup_important')::boolean else l.followup_important end;
 if status_value in ('Booked / Won','Not Interested','Lost') then followup_value:=null;end if;
 if followup_value is null then important_value:=false;end if;
 if status_value='Site Visit Booked' and visit_value is null then raise exception 'Choose a site visit date and time';end if;
 if status_value='Follow-up Required' and followup_value is null then raise exception 'Choose a follow-up date and time';end if;
 if coalesce(b->>'outcome','')<>'' and b->>'outcome' not in ('Answered','Not Answered','Busy','Switched Off / Unreachable','Wrong Number','Cancelled / Not Dialled') then raise exception 'Invalid call outcome';end if;
 if coalesce(b->>'outcome','')='' and trim(coalesce(b->>'note',''))='' and status_value=l.status
  and followup_value is not distinct from l.followup and visit_value is not distinct from l.visit
  and important_value=l.followup_important then raise exception 'Add a note or update the lead';end if;
 update public.leads set status=status_value,followup=followup_value,visit=visit_value,followup_important=important_value,updated=now() where id=l.id;
 insert into public.activities("leadId","userId",type,outcome,status,note)
 values(l.id,u.id,case when coalesce(b->>'outcome','')<>'' then 'call' else 'update' end,nullif(b->>'outcome',''),status_value,
 left(trim(coalesce(b->>'note','')),4800)||case when important_value is distinct from l.followup_important then case when important_value then E'\nFollow-up marked Important.' else E'\nImportant flag removed.' end else '' end);
 if coalesce(b->>'outcome','')<>'' then delete from public.pending where "userId"=u.id and "leadId"=l.id;end if;
 return '{"ok":true}'::jsonb;
end $$;
revoke all on function public.crm_snapshot_v4(uuid),public.crm_report(uuid,timestamptz,timestamptz,uuid,uuid),public.crm_mutate_v5(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_snapshot_v4(uuid),public.crm_report(uuid,timestamptz,timestamptz,uuid,uuid),public.crm_mutate_v5(uuid,jsonb) to service_role;
commit;
