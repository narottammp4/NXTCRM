-- NxtCall incremental update. Run after the original schema.sql, never instead of it.
-- Safe to rerun. Existing accounts, leads, calls and custom fields are preserved.
begin;
create table if not exists public.clients (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(trim(name)) between 1 and 120)
);
create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
 name text not null check(length(trim(name)) between 1 and 150), unique(client_id,name)
);
create table if not exists public.campaigns (
 id uuid primary key default gen_random_uuid(),client_id uuid not null references public.clients(id),
 project_id uuid references public.projects(id),name text not null check(length(trim(name)) between 1 and 150)
);
create unique index if not exists campaign_unique_name on public.campaigns(client_id,coalesce(project_id,'00000000-0000-0000-0000-000000000000'::uuid),name);
alter table public.leads add column if not exists client_id uuid references public.clients(id);
alter table public.leads add column if not exists project_id uuid references public.projects(id);
alter table public.leads add column if not exists campaign_id uuid references public.campaigns(id);
create index if not exists leads_category on public.leads(client_id,project_id,campaign_id);
insert into public.clients(name) values('Uncategorised') on conflict(name) do nothing;
update public.leads set client_id=(select id from public.clients where name='Uncategorised') where client_id is null;
insert into public.projects(client_id,name)
 select distinct client_id,project from public.leads where project not in ('','Not specified') and project_id is null
 on conflict(client_id,name) do nothing;
update public.leads l set project_id=p.id from public.projects p where l.project_id is null and p.client_id=l.client_id and p.name=l.project;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.campaigns enable row level security;
revoke all on public.clients,public.projects,public.campaigns from anon,authenticated;
grant all on public.clients,public.projects,public.campaigns to service_role;

create or replace function public.nxtcall_category(actor_id uuid,b jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u public.users; c uuid; p uuid; k uuid; project_name text;
begin
 select * into u from public.users where id=actor_id and active;
 if u.id is null then raise exception '403:Account disabled';end if;
 c:=coalesce(nullif(b->>'client_id','')::uuid,(select id from public.clients where name='Uncategorised'));
 p:=nullif(b->>'project_id','')::uuid;k:=nullif(b->>'campaign_id','')::uuid;
 if not exists(select 1 from public.clients where id=c) then raise exception 'Choose a valid client';end if;
 if u.role<>'admin' and not exists(select 1 from public.leads where assignee=u.id and client_id=c)
 and not exists(select 1 from public.clients where id=c and name='Uncategorised') then raise exception '403:Client access denied';end if;
 if p is not null then
 select name into project_name from public.projects where id=p and client_id=c;
 if project_name is null then raise exception 'Project does not belong to this client';end if;
 end if;
 if k is not null and not exists(select 1 from public.campaigns where id=k and client_id=c and (project_id is null or project_id=p)) then raise exception 'Campaign does not match this client/project';end if;
 return jsonb_build_object('client_id',c,'project_id',p,'campaign_id',k,'project',coalesce(project_name,'Not specified'));
end $$;

create or replace function public.crm_snapshot_v2(actor_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; is_admin boolean;
begin
 result:=public.crm_snapshot(actor_id);
 is_admin:=result->'user'->>'role'='admin';
 return result || jsonb_build_object(
 'clients',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.clients c where is_admin or c.name='Uncategorised' or exists(select 1 from public.leads l where l.client_id=c.id and l.assignee=actor_id)),'[]'::jsonb),
 'projects',coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.projects p where is_admin or exists(select 1 from public.leads l where l.client_id=p.client_id and l.assignee=actor_id)),'[]'::jsonb),
 'campaigns',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.campaigns c where is_admin or exists(select 1 from public.leads l where l.client_id=c.client_id and l.assignee=actor_id)),'[]'::jsonb));
end $$;

create or replace function public.crm_mutate_v2(actor_id uuid,b jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u public.users; x jsonb; category jsonb; items jsonb:='[]'; result jsonb; phone_value text; new_id uuid;
begin
 select * into u from public.users where id=actor_id and active for update;
 if u.id is null then raise exception '403:Account disabled';end if;
 if b->>'action'='catalog' then
 if u.role<>'admin' then raise exception '403:Admin access required';end if;
 if coalesce(length(trim(b->>'name')),0) not between 1 and 120 then raise exception 'Enter a name of 1–120 characters';end if;
 if b->>'kind'='client' then insert into public.clients(name) values(trim(b->>'name')) returning id into new_id;
 elsif b->>'kind'='project' then
 insert into public.projects(client_id,name) values((b->>'client_id')::uuid,trim(b->>'name')) returning id into new_id;
 elsif b->>'kind'='campaign' then
 category:=public.nxtcall_category(actor_id,b);
 insert into public.campaigns(client_id,project_id,name) values((category->>'client_id')::uuid,(category->>'project_id')::uuid,trim(b->>'name')) returning id into new_id;
 else raise exception 'Unknown category';end if;
 return jsonb_build_object('ok',true,'id',new_id);
 elsif b->>'action'='categorize' then
 if u.role<>'admin' then raise exception '403:Admin access required';end if;
 category:=public.nxtcall_category(actor_id,b);
 update public.leads set client_id=(category->>'client_id')::uuid,project_id=(category->>'project_id')::uuid,campaign_id=(category->>'campaign_id')::uuid,project=category->>'project',updated=now() where id=(b->>'id')::uuid;
 if not found then raise exception '404:Lead not found';end if;
 insert into public.activities("leadId","userId",type,note) values((b->>'id')::uuid,u.id,'classification','Client/project/campaign updated');
 return '{"ok":true}'::jsonb;
 elsif b->>'action' in ('lead','import') then
 if b->>'action'='lead' then items:=jsonb_build_array(b->'lead');else items:=b->'rows';end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 500 then raise exception 'Import between 1 and 500 leads';end if;
 b:=jsonb_set(b,'{rows}','[]');
 for x in select value from jsonb_array_elements(items) loop
 category:=public.nxtcall_category(actor_id,x);
 -- Keep legacy mapped project text only when no structured project is chosen.
 x:=x||case when nullif(x->>'project_id','') is null and nullif(x->>'project','') is not null then category||jsonb_build_object('project',left(x->>'project',150)) else category end;
 b:=jsonb_set(b,'{rows}',(b->'rows')||jsonb_build_array(x));
 end loop;
 result:=public.crm_mutate(actor_id,b||'{"action":"import"}'::jsonb);
 for x in select value from jsonb_array_elements(b->'rows') loop
 phone_value:=regexp_replace(x->>'phone','[^+0-9]','','g');
 if length(phone_value)=10 then phone_value:='+91'||phone_value;else phone_value:='+'||ltrim(phone_value,'+');end if;
 update public.leads set client_id=(x->>'client_id')::uuid,project_id=(x->>'project_id')::uuid,campaign_id=(x->>'campaign_id')::uuid where phone=phone_value;
 end loop;
 return result;
 else return public.crm_mutate(actor_id,b);
 end if;
end $$;
revoke all on function public.nxtcall_category(uuid,jsonb),public.crm_snapshot_v2(uuid),public.crm_mutate_v2(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nxtcall_category(uuid,jsonb),public.crm_snapshot_v2(uuid),public.crm_mutate_v2(uuid,jsonb) to service_role;
commit;
