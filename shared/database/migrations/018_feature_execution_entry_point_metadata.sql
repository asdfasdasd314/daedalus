alter table feature_execution_runs
  add column entry_point_path text not null default '';

create or replace function daemon_update_feature_execution_run(
  p_user_id uuid, p_run_id uuid, p_expected_status text, p_updates jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update feature_execution_runs set
    status = coalesce(p_updates->>'status', status),
    message = coalesce(p_updates->>'message', case when p_updates->>'status' in ('completed', 'failed', 'cancelled') then 'client_review' else message end),
    parameter_file_path = coalesce(p_updates->>'parameter_file_path', parameter_file_path),
    entry_point_path = coalesce(p_updates->>'entry_point_path', entry_point_path),
    command = coalesce(p_updates->'command', command),
    process_id = coalesce((p_updates->>'process_id')::integer, process_id),
    exit_code = case when p_updates ? 'exit_code' then (p_updates->>'exit_code')::integer else exit_code end,
    stdout_tail = coalesce(p_updates->>'stdout_tail', stdout_tail),
    stderr_tail = coalesce(p_updates->>'stderr_tail', stderr_tail),
    error = coalesce(p_updates->>'error', error),
    started_at = case when p_updates ? 'started_at' then now() else started_at end,
    completed_at = case when p_updates ? 'completed_at' then now() else completed_at end,
    updated_at = now()
  where id = p_run_id and user_id = p_user_id and status = p_expected_status;
  return found;
end;
$$;
