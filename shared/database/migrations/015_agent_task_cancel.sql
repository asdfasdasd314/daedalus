-- Hard cancel for durable agent-mode worktree tasks.

alter table agent_tasks drop constraint if exists agent_tasks_status_check;
alter table agent_tasks
  add constraint agent_tasks_status_check
  check (status in (
    'queued', 'running', 'verifying', 'ready', 'failed', 'integrating',
    'resolving', 'completed', 'blocked', 'cancelled'
  ));

alter table agent_tasks
  add column if not exists cancel_requested boolean not null default false;

drop policy if exists "authenticated users can request cancel on own agent tasks" on agent_tasks;
create policy "authenticated users can request cancel on own agent tasks"
on agent_tasks for update to authenticated
using (
  user_id = auth.uid()
  and cancel_requested = false
  and status in ('queued', 'running', 'verifying', 'ready', 'integrating', 'resolving')
)
with check (
  user_id = auth.uid()
  and cancel_requested = true
);

create or replace function daemon_update_agent_task(
  p_user_id uuid, p_task_id uuid, p_expected_status text, p_updates jsonb
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update agent_tasks set
    status = coalesce(p_updates->>'status', status),
    message = coalesce(
      p_updates->>'message',
      case
        when p_updates->>'status' in ('completed', 'failed', 'blocked', 'cancelled')
          then 'client_review'
        else message
      end
    ),
    base_commit = coalesce(p_updates->>'base_commit', base_commit),
    branch_name = coalesce(p_updates->>'branch_name', branch_name),
    worktree_path = coalesce(p_updates->>'worktree_path', worktree_path),
    batch_id = coalesce((p_updates->>'batch_id')::uuid, batch_id),
    result = coalesce(p_updates->>'result', result),
    error = coalesce(p_updates->>'error', error),
    verification_attempts = coalesce(
      (p_updates->>'verification_attempts')::integer, verification_attempts
    ),
    cancel_requested = coalesce(
      (p_updates->>'cancel_requested')::boolean, cancel_requested
    ),
    started_at = case
      when p_updates ? 'started_at' then (p_updates->>'started_at')::timestamptz
      else started_at
    end,
    completed_at = case
      when p_updates ? 'completed_at' then (p_updates->>'completed_at')::timestamptz
      else completed_at
    end,
    updated_at = now()
  where id = p_task_id and user_id = p_user_id and status = p_expected_status;
  return found;
end;
$$;

grant execute on function daemon_update_agent_task(uuid, uuid, text, jsonb) to anon;
