-- Terminal batches do not require future daemon review. Correct rows written
-- before terminal status was made authoritative and prevent stale input state
-- from overriding the derived review state in future upserts.

update orchestration_batches
set message = 'daemon_complete'
where status in ('completed', 'blocked')
  and message <> 'daemon_complete';

create or replace function daemon_upsert_orchestration_batch(p_user_id uuid, p_batch jsonb)
returns void language sql security definer set search_path = public as $$
  insert into orchestration_batches (id, user_id, repository, base_commit, task_ids, integration_branch, integration_worktree_path, status, message, resolver_attempts, verification_output, quiet_since, completed_at)
  values ((p_batch->>'id')::uuid, p_user_id, p_batch->>'repository', p_batch->>'base_commit', coalesce(p_batch->'task_ids', '[]'::jsonb), p_batch->>'integration_branch', coalesce(p_batch->>'integration_worktree_path', ''), coalesce(p_batch->>'status', 'collecting'), case when p_batch->>'status' in ('completed', 'blocked') then 'daemon_complete' else 'daemon_review' end, coalesce((p_batch->>'resolver_attempts')::integer, 0), coalesce(p_batch->>'verification_output', ''), (p_batch->>'quiet_since')::timestamptz, (p_batch->>'completed_at')::timestamptz)
  on conflict (id) do update set task_ids = excluded.task_ids, integration_worktree_path = excluded.integration_worktree_path, status = excluded.status, message = excluded.message, resolver_attempts = excluded.resolver_attempts, verification_output = excluded.verification_output, quiet_since = excluded.quiet_since, completed_at = excluded.completed_at, updated_at = now();
$$;
