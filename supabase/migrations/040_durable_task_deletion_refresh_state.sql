-- The browser reads deletion lifecycle state directly under the table's existing
-- owner-only RLS policy.  This index keeps the unresolved/recent viewer snapshot
-- bounded without granting clients any daemon-only mutation capability.
create index if not exists agent_task_deletion_requests_viewer_state_idx
  on agent_task_deletion_requests (user_id, updated_at desc, id)
  where status in ('requested', 'completed', 'rejected');

grant select on agent_task_deletion_requests to authenticated;
