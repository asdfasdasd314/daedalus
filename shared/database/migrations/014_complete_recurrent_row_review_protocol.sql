-- Complete migration 013 after its original daemon-events index exceeded the
-- B-tree key-size limit. Migration 013 may have committed its earlier DDL.

create index if not exists communications_review_idx on communications (user_id, purpose, message);
create index if not exists daemon_payloads_review_idx on daemon_payloads (user_id, kind, message);
create index if not exists agent_tasks_review_idx on agent_tasks (user_id, message, queue_sequence);
create index if not exists orchestration_batches_review_idx on orchestration_batches (user_id, message, created_at);
drop index if exists daemon_events_review_idx;
create index daemon_events_review_idx on daemon_events (user_id, created_at desc)
where message = 'client_review';

drop policy if exists "authenticated users can insert own agent tasks" on agent_tasks;
create policy "authenticated users can insert own agent tasks"
on agent_tasks for insert to authenticated
with check (user_id = auth.uid() and status = 'queued' and message = 'daemon_review');

drop policy if exists "authenticated users can acknowledge own daemon payloads" on daemon_payloads;
create policy "authenticated users can acknowledge own daemon payloads"
on daemon_payloads for update to authenticated
using (user_id = auth.uid() and message = 'client_review')
with check (user_id = auth.uid() and message = 'client_complete');
drop policy if exists "authenticated users can acknowledge own agent tasks" on agent_tasks;
create policy "authenticated users can acknowledge own agent tasks"
on agent_tasks for update to authenticated
using (user_id = auth.uid() and message = 'client_review')
with check (user_id = auth.uid() and message = 'client_complete');
drop policy if exists "authenticated users can acknowledge own daemon events" on daemon_events;
create policy "authenticated users can acknowledge own daemon events"
on daemon_events for update to authenticated
using (user_id = auth.uid() and message = 'client_review')
with check (user_id = auth.uid() and message = 'client_complete');

drop function if exists daemon_get_communication(uuid, text);
create function daemon_get_communication(p_user_id uuid, p_purpose text)
returns table(content text, purpose text)
language sql security definer set search_path = public as $$
  select communications.content, communications.purpose
  from communications
  where communications.user_id = p_user_id
    and communications.purpose = p_purpose
    and communications.message = 'daemon_review'
  limit 1;
$$;

drop function if exists daemon_upsert_communication(uuid, text, text);
drop function if exists daemon_upsert_communication(uuid, text, text, text);
create function daemon_upsert_communication(
  p_user_id uuid, p_purpose text, p_message text, p_content text default null
)
returns void language sql security definer set search_path = public as $$
  insert into communications (user_id, purpose, message, content)
  values (p_user_id, p_purpose, p_message, p_content)
  on conflict (user_id, purpose) do update set
    message = excluded.message, content = excluded.content, updated_at = now();
$$;

create or replace function daemon_upsert_payload(p_user_id uuid, p_kind text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('feature_files', 'parameter_files', 'agent_chat', 'git_sync_result') then
    raise exception 'Unsupported daemon payload kind: %', p_kind;
  end if;
  insert into daemon_payloads (user_id, kind, payload, message)
  values (p_user_id, p_kind, p_payload, 'client_review')
  on conflict (user_id, kind) do update set
    payload = excluded.payload, message = excluded.message, updated_at = now();
end;
$$;

create or replace function daemon_list_agent_tasks(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path = public as $$
  select * from agent_tasks
  where user_id = p_user_id and message = 'daemon_review'
  order by queue_sequence;
$$;

create or replace function daemon_update_agent_task(p_user_id uuid, p_task_id uuid, p_expected_status text, p_updates jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update agent_tasks set
    status = coalesce(p_updates->>'status', status),
    message = coalesce(p_updates->>'message', case when p_updates->>'status' in ('completed', 'failed', 'blocked') then 'client_review' else message end),
    base_commit = coalesce(p_updates->>'base_commit', base_commit),
    branch_name = coalesce(p_updates->>'branch_name', branch_name),
    worktree_path = coalesce(p_updates->>'worktree_path', worktree_path),
    batch_id = coalesce((p_updates->>'batch_id')::uuid, batch_id),
    result = coalesce(p_updates->>'result', result), error = coalesce(p_updates->>'error', error),
    verification_attempts = coalesce((p_updates->>'verification_attempts')::integer, verification_attempts),
    started_at = case when p_updates ? 'started_at' then (p_updates->>'started_at')::timestamptz else started_at end,
    completed_at = case when p_updates ? 'completed_at' then (p_updates->>'completed_at')::timestamptz else completed_at end,
    updated_at = now()
  where id = p_task_id and user_id = p_user_id and status = p_expected_status;
  return found;
end;
$$;

create or replace function daemon_upsert_orchestration_batch(p_user_id uuid, p_batch jsonb)
returns void language sql security definer set search_path = public as $$
  insert into orchestration_batches (id, user_id, repository, base_commit, task_ids, integration_branch, integration_worktree_path, status, message, resolver_attempts, verification_output, quiet_since, completed_at)
  values ((p_batch->>'id')::uuid, p_user_id, p_batch->>'repository', p_batch->>'base_commit', coalesce(p_batch->'task_ids', '[]'::jsonb), p_batch->>'integration_branch', coalesce(p_batch->>'integration_worktree_path', ''), coalesce(p_batch->>'status', 'collecting'), coalesce(p_batch->>'message', case when p_batch->>'status' in ('completed', 'blocked') then 'daemon_complete' else 'daemon_review' end), coalesce((p_batch->>'resolver_attempts')::integer, 0), coalesce(p_batch->>'verification_output', ''), (p_batch->>'quiet_since')::timestamptz, (p_batch->>'completed_at')::timestamptz)
  on conflict (id) do update set task_ids = excluded.task_ids, integration_worktree_path = excluded.integration_worktree_path, status = excluded.status, message = excluded.message, resolver_attempts = excluded.resolver_attempts, verification_output = excluded.verification_output, quiet_since = excluded.quiet_since, completed_at = excluded.completed_at, updated_at = now();
$$;

create or replace function daemon_list_orchestration_batches(p_user_id uuid)
returns setof orchestration_batches language sql security definer set search_path = public as $$
  select * from orchestration_batches
  where user_id = p_user_id and message = 'daemon_review'
  order by created_at;
$$;

create or replace function daemon_record_event(p_user_id uuid, p_repository text, p_task_id uuid, p_batch_id uuid, p_severity text, p_message text)
returns void language sql security definer set search_path = public as $$
  insert into daemon_events (user_id, repository, task_id, batch_id, severity, message, content)
  values (p_user_id, p_repository, p_task_id, p_batch_id, p_severity, 'client_review', p_message);
$$;

grant execute on function daemon_get_communication(uuid, text) to anon;
grant execute on function daemon_upsert_communication(uuid, text, text, text) to anon;
grant execute on function daemon_upsert_payload(uuid, text, jsonb) to anon;
grant execute on function daemon_list_agent_tasks(uuid) to anon;
grant execute on function daemon_update_agent_task(uuid, uuid, text, jsonb) to anon;
grant execute on function daemon_upsert_orchestration_batch(uuid, jsonb) to anon;
grant execute on function daemon_list_orchestration_batches(uuid) to anon;
grant execute on function daemon_record_event(uuid, text, uuid, uuid, text, text) to anon;
