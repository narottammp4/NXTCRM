-- Run once in a NEW Supabase project's SQL Editor.
begin;
create table public.users (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique, name text not null, role text not null check(role in ('admin','caller')),
 active boolean not null default true
);
create unique index one_admin on public.users(role) where role='admin';
create table public.fields (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 type text not null check(type in ('text','number','date','dropdown','multi-select','checkbox')),
 options text not null default '[]', required boolean not null default false, position integer not null default 0
);
create table public.leads (
 id uuid primary key default gen_random_uuid(),name text not null,phone text not null unique,
 email text not null default '', project text not null default '', budget text not null default '',
 bhk text not null default '',location text not null default '',source text not null default 'Manual',
 status text not null default 'New' check(status in ('New','Contacted','Interested','Follow-up Required','Site Visit Booked','Site Visit Completed','Negotiation','Booked / Won','Not Interested / Lost')),
 assignee uuid not null references public.users(id),followup timestamptz,visit timestamptz,
 custom text not null default '{}',created timestamptz not null default now(),updated timestamptz not null default now()
);
create table public.activities (
 id uuid primary key default gen_random_uuid(),"leadId" uuid not null references public.leads(id) on delete cascade,
 "userId" uuid not null references public.users(id),type text not null,
 outcome text,status text,note text not null default '',created timestamptz not null default now()
);
create table public.pending (
 "userId" uuid primary key references public.users(id) on delete cascade,
 "leadId" uuid not null references public.leads(id) on delete cascade,created timestamptz not null default now()
);
create index leads_owner_updated on public.leads(assignee,updated desc);
create index leads_followup on public.leads(followup) where followup is not null;
create index activities_lead_date on public.activities("leadId",created desc);
create index activities_user_date on public.activities("userId",created desc);

-- Browser database access is denied. All CRM operations go through the Next.js
-- API, which validates the Supabase session; RPCs also validate active roles.
-- The service key must remain server-only.
alter table public.users enable row level security;
alter table public.fields enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;
alter table public.pending enable row level security;
revoke all on public.users,public.fields,public.leads,public.activities,public.pending from anon,authenticated;
grant all on public.users,public.fields,public.leads,public.activities,public.pending to service_role;

create function public.crm_snapshot(actor_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u public.users;
begin
 select * into u from public.users where id=actor_id and active;
 if u.id is null then raise exception '403:Account disabled';end if;
 return jsonb_build_object(
 'user',to_jsonb(u),
 'leads',coalesce((select jsonb_agg(to_jsonb(l) order by l.updated desc) from public.leads l where u.role='admin' or l.assignee=u.id),'[]'::jsonb),
 'activities',coalesce((select jsonb_agg(to_jsonb(a) order by a.created desc) from public.activities a join public.leads l on l.id=a."leadId" where u.role='admin' or l.assignee=u.id),'[]'::jsonb),
 'users',coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.users p where u.role='admin' or p.id=u.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'leadId',a."leadId",'userId',a."userId",'type',a.type,'outcome',a.outcome,'created',a.created) order by a.created desc) from public.activities a where (u.role='admin' or a."userId"=u.id) and a.created>=now()-interval '31 days'),'[]'::jsonb),
 'fields',coalesce((select jsonb_agg(to_jsonb(f) order by f.position,f.name) from public.fields f),'[]'::jsonb),
 'pending',(select to_jsonb(p) from public.pending p where p."userId"=u.id));
end $$;

create function public.crm_mutate(actor_id uuid, b jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u public.users; l public.leads; x jsonb; f public.fields; v jsonb;
 action text:=b->>'action'; target uuid; owner_id uuid; n integer:=0;
 phone_value text; status_value text; followup_value timestamptz; visit_value timestamptz;
 pending_id uuid;
begin
 -- Lock the actor so access changes and simultaneous writes serialize.
 select * into u from public.users where id=actor_id and active for update;
 if u.id is null then raise exception '403:Account disabled';end if;
 if action in ('toggleUser','field','assign') and u.role<>'admin' then raise exception '403:Admin access required';end if;
 if action='toggleUser' then
  update public.users set active=(b->>'active')::boolean where id=(b->>'id')::uuid and role='caller';
  if not found then raise exception '404:Caller not found';end if;
 elsif action='field' then
  if length(trim(b->>'name')) not between 1 and 80 then raise exception 'Enter a field name';end if;
  if b->>'type' in ('dropdown','multi-select') and jsonb_array_length(b->'options')=0 then raise exception 'Add options';end if;
  insert into public.fields(name,type,options,required,position) values(trim(b->>'name'),b->>'type',coalesce(b->'options','[]'::jsonb)::text,coalesce((b->>'required')::boolean,false),coalesce((b->>'position')::integer,0));
 elsif action in ('lead','import') then
  if action='lead' then b:=jsonb_set(b,'{rows}',jsonb_build_array(b->'lead'));end if;
  if jsonb_typeof(b->'rows')<>'array' or jsonb_array_length(b->'rows') not between 1 and 500 then raise exception 'Import between 1 and 500 leads';end if;
  for x in select value from jsonb_array_elements(b->'rows') loop
   if coalesce(length(trim(x->>'name')),0) not between 1 and 150 then raise exception 'Each lead needs a name (maximum 150 characters)';end if;
   phone_value:=regexp_replace(x->>'phone','[^+0-9]','','g');
   if phone_value is null or phone_value !~ '^\+?[0-9]{10,15}$' then raise exception 'Each lead needs a valid phone number';end if;
   if length(phone_value)=10 then phone_value:='+91'||phone_value;else phone_value:='+'||ltrim(phone_value,'+');end if;
   owner_id:=case when u.role='admin' then coalesce(nullif(x->>'assignee','')::uuid,u.id) else u.id end;
   if not exists(select 1 from public.users where id=owner_id and active) then raise exception 'Choose an active caller';end if;
   if x->'custom' is null then x:=jsonb_set(x,'{custom}','{}');end if;
   if jsonb_typeof(x->'custom')<>'object' or length((x->'custom')::text)>20000 then raise exception 'Invalid custom data';end if;
   for f in select * from public.fields loop
    v:=x->'custom'->f.id::text;
    if f.required and (v is null or v in ('null'::jsonb,'""'::jsonb,'[]'::jsonb)) then raise exception '% is required',f.name;end if;
    if v is not null and v not in ('null'::jsonb,'""'::jsonb) then
     if f.type='number' then perform (v#>>'{}')::numeric;end if;
     if f.type='date' then perform (v#>>'{}')::date;end if;
     if f.type='checkbox' and jsonb_typeof(v)<>'boolean' then raise exception 'Invalid checkbox';end if;
     if f.type='dropdown' and not (f.options::jsonb @> jsonb_build_array(v)) then raise exception 'Invalid option for %',f.name;end if;
     if f.type='multi-select' and (jsonb_typeof(v)<>'array' or not (f.options::jsonb @> v)) then raise exception 'Invalid options for %',f.name;end if;
    end if;
   end loop;
   insert into public.leads(name,phone,email,project,budget,bhk,location,source,assignee,custom)
   values(trim(x->>'name'),phone_value,left(coalesce(x->>'email',''),150),left(coalesce(nullif(x->>'project',''),'Not specified'),150),left(coalesce(x->>'budget',''),80),left(coalesce(x->>'bhk',''),40),left(coalesce(x->>'location',''),100),left(coalesce(nullif(x->>'source',''),'Manual'),80),owner_id,(x->'custom')::text);
   n:=n+1;
  end loop;
  return jsonb_build_object('ok',true,'count',n);
 elsif action in ('assign','startCall','update') then
  target:=(b->>'id')::uuid;
  select * into l from public.leads where id=target for update;
  if l.id is null then raise exception '404:Lead not found';end if;
  if u.role<>'admin' and l.assignee<>u.id then raise exception '403:Lead access denied';end if;
  if action='assign' then
   owner_id:=(b->>'assignee')::uuid;
   if not exists(select 1 from public.users where id=owner_id and active) then raise exception 'Choose an active caller';end if;
   update public.leads set assignee=owner_id,updated=now() where id=target;
   insert into public.activities("leadId","userId",type,note) values(target,u.id,'assignment','Lead reassigned');
   delete from public.pending where "leadId"=target;
  elsif action='startCall' then
   select "leadId" into pending_id from public.pending where "userId"=u.id;
   if pending_id is not null and pending_id<>target then raise exception 'Finish the previous call update first';end if;
   insert into public.pending("userId","leadId") values(u.id,target) on conflict("userId") do nothing;
  else
   status_value:=coalesce(nullif(b->>'status',''),l.status);
   followup_value:=case when b ? 'followup' then nullif(b->>'followup','')::timestamptz else l.followup end;
   visit_value:=case when b ? 'visit' then nullif(b->>'visit','')::timestamptz else l.visit end;
   if status_value='Site Visit Booked' and visit_value is null then raise exception 'Choose a site visit date and time';end if;
   if status_value='Follow-up Required' and followup_value is null then raise exception 'Choose a follow-up date and time';end if;
   if coalesce(b->>'outcome','')<>'' and b->>'outcome' not in ('Answered','Not Answered','Busy','Switched Off / Unreachable','Wrong Number','Cancelled / Not Dialled') then raise exception 'Invalid call outcome';end if;
   if coalesce(b->>'outcome','')='' and trim(coalesce(b->>'note',''))='' and status_value=l.status and followup_value is not distinct from l.followup and visit_value is not distinct from l.visit then raise exception 'Add a note or update the lead';end if;
   update public.leads set status=status_value,followup=followup_value,visit=visit_value,updated=now() where id=target;
   insert into public.activities("leadId","userId",type,outcome,status,note) values(target,u.id,case when coalesce(b->>'outcome','')<>'' then 'call' else 'update' end,nullif(b->>'outcome',''),status_value,left(trim(coalesce(b->>'note','')),5000));
   if coalesce(b->>'outcome','')<>'' then delete from public.pending where "userId"=u.id and "leadId"=target;end if;
  end if;
 else raise exception 'Unknown action';
 end if;
 return '{"ok":true}'::jsonb;
end $$;
revoke all on function public.crm_snapshot(uuid),public.crm_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_snapshot(uuid),public.crm_mutate(uuid,jsonb) to service_role;
commit;
