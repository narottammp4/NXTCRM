-- Apply after 20260913_nxtcall.sql. Adds client context to permitted call metrics; no data rewrite.
begin;
create or replace function public.crm_snapshot_v2(actor_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; is_admin boolean;
begin
 result:=public.crm_snapshot(actor_id);
 is_admin:=result->'user'->>'role'='admin';
 result:=jsonb_set(result,'{events}',coalesce((
 select jsonb_agg(e.value||jsonb_build_object('client_id',l.client_id) order by e.value->>'created' desc)
 from jsonb_array_elements(coalesce(result->'events','[]'::jsonb)) e
 join public.leads l on l.id=(e.value->>'leadId')::uuid
 ),'[]'::jsonb));
 return result || jsonb_build_object(
 'clients',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.clients c where is_admin or c.name='Uncategorised' or exists(select 1 from public.leads l where l.client_id=c.id and l.assignee=actor_id)),'[]'::jsonb),
 'projects',coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.projects p where is_admin or exists(select 1 from public.leads l where l.client_id=p.client_id and l.assignee=actor_id)),'[]'::jsonb),
 'campaigns',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.campaigns c where is_admin or exists(select 1 from public.leads l where l.client_id=c.client_id and l.assignee=actor_id)),'[]'::jsonb));
end $$;


revoke all on function public.crm_snapshot_v2(uuid) from public,anon,authenticated;
grant execute on function public.crm_snapshot_v2(uuid) to service_role;
commit;
