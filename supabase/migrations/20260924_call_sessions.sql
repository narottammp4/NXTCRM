-- Apply after 20260921_active_enquiries.sql and BEFORE deploying the matching API/app code.
-- Turns the existing one-row-per-user "pending" call into an explicit call session:
--   call_session_id (new) | leadId (lead_id) | userId (user_id, the user who clicked Call)
--   created (started_at)  | status (new)
-- No data is rewritten apart from giving existing pending rows a session id.
-- Recent Calls / Activity (public.activities) is untouched and stays global for admins.
begin;

alter table public.pending add column if not exists call_session_id uuid not null default gen_random_uuid();
alter table public.pending add column if not exists status text not null default 'active';
alter table public.pending drop constraint if exists pending_status_check;
alter table public.pending add constraint pending_status_check check (status in ('active','expired'));
create unique index if not exists pending_call_session_id on public.pending(call_session_id);

-- Snapshot: 'pending' is only ever the ACTOR's own active, non-stale session.
create or replace function public.crm_snapshot_v4(actor_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb; s public.pending;
begin
 r:=public.crm_snapshot_v3(actor_id);
 select * into s from public.pending
  where "userId"=actor_id and status='active' and created>now()-interval '12 hours';
 -- v3 already nulls the session when its lead is in Trash.
 if not found or coalesce(jsonb_typeof(r->'pending'),'null')='null' then
  return jsonb_set(r,'{pending}','null'::jsonb);
 end if;
 return jsonb_set(r,'{pending}',to_jsonb(s)||jsonb_build_object('started_at',s.created));
end $$;

create or replace function public.crm_mutate_v5(actor_id uuid,b jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a text:=b->>'action'; result jsonb; s public.pending;
begin
 if a='startCall' then
  -- Drop this user's own stale/expired session so it cannot block a new call.
  delete from public.pending where "userId"=actor_id and (status<>'active' or created<=now()-interval '12 hours');
  result:=public.crm_mutate_v4(actor_id,b);
  -- Re-dialling the same lead keeps its session id but restarts the clock.
  update public.pending set created=now()
   where "userId"=actor_id and "leadId"=(b->>'id')::uuid and status='active' returning * into s;
  return result||jsonb_build_object('session',to_jsonb(s)||jsonb_build_object('started_at',s.created));
 elsif a='update' and coalesce(b->>'callSessionId','')<>'' then
  -- A call outcome may only be saved against a session owned by the caller of this function.
  if not exists(select 1 from public.pending
    where call_session_id=(b->>'callSessionId')::uuid and "userId"=actor_id
      and "leadId"=(b->>'id')::uuid and status='active') then
   raise exception '409:This call session is not active for your account (it may have expired or already been saved). Refresh and try again.';
  end if;
 end if;
 return public.crm_mutate_v4(actor_id,b);
end $$;

revoke all on function public.crm_snapshot_v4(uuid),public.crm_mutate_v5(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_snapshot_v4(uuid),public.crm_mutate_v5(uuid,jsonb) to service_role;
commit;
