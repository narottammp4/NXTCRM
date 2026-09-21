-- Apply after 20260918_enquiries_assignment.sql, before deploying this patch.
-- No leads or history are deleted. Trash no longer reserves a phone/project.
begin;
drop index if exists public.leads_enquiry_unique;
create unique index leads_enquiry_unique
 on public.leads(phone,client_id,public.nxtcall_project_key(project_id,project))
 where deleted_at is null;
-- Restoring a conflicting trashed lead is rejected atomically by this index.
commit;
