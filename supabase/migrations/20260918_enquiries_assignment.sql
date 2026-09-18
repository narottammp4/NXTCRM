-- Requires 20260915_trash.sql. Existing lead records/history are preserved.
begin;
-- Give legacy named projects a structured identity before changing uniqueness.
insert into public.projects(client_id,name)
 select distinct client_id,trim(project) from public.leads l where project_id is null and client_id is not null and lower(trim(project)) not in ('','not specified')
 and not exists(select 1 from public.projects p where p.client_id=l.client_id and lower(trim(p.name))=lower(trim(l.project)))
 on conflict(client_id,name) do nothing;
update public.leads l set project_id=p.id,project=p.name from public.projects p
 where l.project_id is null and l.client_id=p.client_id and lower(trim(l.project))=lower(trim(p.name));
-- Replace global phone uniqueness with client + project enquiry uniqueness.
alter table public.leads drop constraint if exists leads_phone_key;
create or replace function public.nxtcall_project_key(p uuid, label text) returns text
language sql immutable set search_path='' as $$
 select case when p is not null then p::text else 'text:'||case when lower(trim(coalesce(label,''))) in ('','not specified') then '' else lower(trim(label)) end end
$$;
create unique index if not exists leads_enquiry_unique on public.leads(phone,client_id,public.nxtcall_project_key(project_id,project));

create or replace function public.crm_mutate_v4(actor_id uuid,b jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u public.users; x jsonb; f public.fields; v jsonb; category jsonb;
 action text:=b->>'action'; owner_id uuid; n integer:=0; phone_value text;
 ids uuid[]; matched uuid[]; signature text; total integer; changed integer; target_project uuid;
begin
 select * into u from public.users where id=actor_id and active for update;
 if u.id is null then raise exception '403:Account disabled';end if;
 if action in ('bulkAssignPreview','bulkAssign') then
  if u.role<>'admin' then raise exception '403:Admin access required';end if;
  owner_id:=(b->>'assignee')::uuid;
  perform id from public.users where id=owner_id and active and role='caller' for update;
  if not found then raise exception 'Choose an active caller';end if;
  if b->>'scope'='clients' then
   if jsonb_typeof(b->'client_ids') is distinct from 'array' then raise exception 'Choose clients';end if;
   select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(b->'client_ids');
   if coalesce(cardinality(ids),0)=0 then raise exception 'Choose clients';end if;
   if (select count(*) from public.clients where id=any(ids))<>cardinality(ids) then raise exception 'Client no longer exists';end if;
   select array_agg(id order by id) into matched from public.leads where deleted_at is null and client_id=any(ids);
  elsif b->>'scope'='campaign' then
   perform id from public.campaigns where id=(b->>'campaign_id')::uuid for share;
   if not found then raise exception 'Campaign no longer exists';end if;
   select array_agg(id order by id) into matched from public.leads where deleted_at is null and campaign_id=(b->>'campaign_id')::uuid;
  else raise exception 'Choose clients or a campaign';end if;
  perform id from public.leads where id=any(matched) order by id for update;
  select count(*),count(*) filter(where assignee<>owner_id),md5(coalesce(string_agg(id::text||assignee::text||updated::text,'|' order by id),'')) into total,changed,signature from public.leads where id=any(matched) and deleted_at is null;
  if action='bulkAssignPreview' then return jsonb_build_object('ok',true,'total',total,'changed',changed,'signature',signature);end if;
  if b->>'signature' is distinct from signature then raise exception 'Leads changed since preview. Review assignment again.';end if;
  insert into public.activities("leadId","userId",type,note) select id,u.id,'assignment','Bulk assigned to '||(select name from public.users where id=owner_id) from public.leads where id=any(matched) and deleted_at is null and assignee<>owner_id;
  delete from public.pending where "leadId" in (select id from public.leads where id=any(matched) and deleted_at is null and assignee<>owner_id);
  update public.leads set assignee=owner_id,updated=now() where id=any(matched) and deleted_at is null and assignee<>owner_id;
  return jsonb_build_object('ok',true,'count',changed);
 elsif action in ('lead','import') then
  if action='lead' then b:=jsonb_set(b,'{rows}',jsonb_build_array(b->'lead'));end if;
  if jsonb_typeof(b->'rows') is distinct from 'array' then raise exception 'Import between 1 and 500 leads';end if;
  if jsonb_array_length(b->'rows') not between 1 and 500 then raise exception 'Import between 1 and 500 leads';end if;
  for x in select value from jsonb_array_elements(b->'rows') loop
   category:=public.nxtcall_category(actor_id,x);
   -- Resolve a mapped project name to an existing structured project when possible.
   if nullif(category->>'project_id','') is null and lower(trim(coalesce(x->>'project',''))) not in ('','not specified') then
    select id into target_project from public.projects where client_id=(category->>'client_id')::uuid and lower(trim(name))=lower(trim(x->>'project')) order by id limit 1;
    if target_project is null then
     if u.role<>'admin' then raise exception 'Ask an admin to create the mapped project first';end if;
     insert into public.projects(client_id,name) values((category->>'client_id')::uuid,left(trim(x->>'project'),150)) on conflict(client_id,name) do update set name=excluded.name returning id into target_project;
    end if;
    category:=public.nxtcall_category(actor_id,x||jsonb_build_object('project_id',target_project));
   end if;
   x:=x||category;
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
   insert into public.leads(name,phone,email,project,budget,bhk,location,source,assignee,custom,client_id,project_id,campaign_id)
   values(trim(x->>'name'),phone_value,left(coalesce(x->>'email',''),150),x->>'project',left(coalesce(x->>'budget',''),80),left(coalesce(x->>'bhk',''),40),left(coalesce(x->>'location',''),100),left(coalesce(nullif(x->>'source',''),'Manual'),80),owner_id,(x->'custom')::text,(x->>'client_id')::uuid,nullif(x->>'project_id','')::uuid,nullif(x->>'campaign_id','')::uuid);
   n:=n+1;
  end loop;
  return jsonb_build_object('ok',true,'count',n);
 else return public.crm_mutate_v3(actor_id,b);end if;
end $$;
revoke all on function public.nxtcall_project_key(uuid,text),public.crm_mutate_v4(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nxtcall_project_key(uuid,text),public.crm_mutate_v4(uuid,jsonb) to service_role;
commit;
