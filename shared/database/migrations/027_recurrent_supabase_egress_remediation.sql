-- Consolidate recurrent browser, daemon, and manager traffic into one bounded
-- recipient-filtered request per component cycle. Legacy RPCs remain available
-- for mixed-version rollout and can be revoked in a later migration.

create or replace function daemon_list_communication_reviews(p_user_id uuid)
returns table(purpose text, content text, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select communications.purpose, communications.content, communications.updated_at
  from communications
  where communications.user_id = p_user_id
    and communications.message = 'daemon_review'
    and communications.purpose in ('agent_prompt', 'git_sync_request', 'feature_file_load', 'parameter_file_load', 'parameter_file_update', 'entry_point_update')
  order by communications.purpose
  limit 6;
$$;

create function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path = public as $$
  with owner as (select auth.uid() as user_id)
  select jsonb_build_object(
    'communications', coalesce((select jsonb_agg(to_jsonb(row_data) order by purpose) from (
      select purpose, content, updated_at from communications, owner
      where communications.user_id = owner.user_id and message = 'client_review'
      order by purpose limit 10
    ) row_data), '[]'::jsonb),
    'daemonPayloads', coalesce((select jsonb_agg(to_jsonb(row_data) order by kind) from (
      select kind, payload, updated_at from daemon_payloads, owner
      where daemon_payloads.user_id = owner.user_id and message = 'client_review'
      order by kind limit 3
    ) row_data), '[]'::jsonb),
    'agentTasks', coalesce((select jsonb_agg(to_jsonb(row_data) order by updated_at, id) from (
      select id, repository, prompt, provider, model, reasoning, planning_mode,
        targeted_feature_paths, status, queue_sequence, created_at, started_at,
        completed_at, error, verification_attempts, cancel_requested, updated_at
      from agent_tasks, owner
      where agent_tasks.user_id = owner.user_id and message = 'client_review'
      order by updated_at, id limit 50
    ) row_data), '[]'::jsonb),
    'featureExecutionRuns', coalesce((select jsonb_agg(to_jsonb(row_data) order by updated_at, id) from (
      select id, project_directory, feature_file_path, status, cancel_requested,
        command, parameter_file_path, entry_point_path, started_at, completed_at,
        exit_code, stdout_tail, stderr_tail, error, updated_at
      from feature_execution_runs, owner
      where feature_execution_runs.user_id = owner.user_id and message = 'client_review'
      order by updated_at, id limit 50
    ) row_data), '[]'::jsonb),
    'daemonEvents', coalesce((select jsonb_agg(to_jsonb(row_data) order by created_at, id) from (
      select id, severity, content, created_at from daemon_events, owner
      where daemon_events.user_id = owner.user_id and message = 'client_review'
      order by created_at, id limit 50
    ) row_data), '[]'::jsonb),
    'managerStatus', (select case when state_row.user_id is null then null else jsonb_build_object(
      'state', state_row.state, 'accepts_work', state_row.accepts_work,
      'manager_heartbeat_at', state_row.manager_heartbeat_at,
      'execution_process_id', state_row.execution_process_id,
      'execution_generation', state_row.execution_generation,
      'execution_started_at', state_row.execution_started_at,
      'last_successful_restart_at', state_row.last_successful_restart_at,
      'status_detail', state_row.status_detail, 'updated_at', state_row.updated_at,
      'activeRequest', case when request_row.id is null then null else jsonb_build_object(
        'id', request_row.id, 'status', request_row.status, 'blockers', request_row.blockers) end
    ) end from owner
      left join daemon_manager_state state_row
        on state_row.user_id = owner.user_id and state_row.message = 'client_review'
      left join daemon_manager_requests request_row on request_row.id = state_row.active_request_id)
  );
$$;
revoke all on function get_client_review_inbox() from public;
grant execute on function get_client_review_inbox() to authenticated;

create function acknowledge_client_reviews(receipts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid := auth.uid();
  receipt jsonb;
  receipt_id text;
  acknowledged jsonb := '[]'::jsonb;
  rejected jsonb := '[]'::jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(receipts) <> 'array' then raise exception 'Receipts must be an array'; end if;
  for receipt in select value from jsonb_array_elements(receipts)
  loop
    receipt_id := coalesce(receipt->>'receiptId', '');
    case receipt->>'transport'
      when 'communications' then
        update communications set message = 'client_complete'
        where user_id = owner_id and purpose = receipt->>'key'
          and message = 'client_review' and updated_at = (receipt->>'updatedAt')::timestamptz;
      when 'daemonPayloads' then
        update daemon_payloads set message = 'client_complete'
        where user_id = owner_id and kind = receipt->>'key'
          and message = 'client_review' and updated_at = (receipt->>'updatedAt')::timestamptz;
      when 'agentTasks' then
        update agent_tasks set message = 'client_complete'
        where user_id = owner_id and id = (receipt->>'key')::uuid
          and message = 'client_review' and updated_at = (receipt->>'updatedAt')::timestamptz;
      when 'featureExecutionRuns' then
        update feature_execution_runs set message = 'client_complete'
        where user_id = owner_id and id = (receipt->>'key')::uuid
          and message = 'client_review' and updated_at = (receipt->>'updatedAt')::timestamptz;
      when 'managerStatus' then
        update daemon_manager_state set message = 'client_complete'
        where user_id = owner_id and message = 'client_review'
          and updated_at = (receipt->>'updatedAt')::timestamptz;
      when 'daemonEvents' then
        update daemon_events set message = 'client_complete'
        where user_id = owner_id and id = (receipt->>'key')::bigint and message = 'client_review';
      else
        rejected := rejected || jsonb_build_array(receipt_id);
        continue;
    end case;
    if found then acknowledged := acknowledged || jsonb_build_array(receipt_id);
    else rejected := rejected || jsonb_build_array(receipt_id); end if;
  end loop;
  return jsonb_build_object('acknowledged', acknowledged, 'rejected', rejected);
end;
$$;
revoke all on function acknowledge_client_reviews(jsonb) from public;
grant execute on function acknowledge_client_reviews(jsonb) to authenticated;

create function daemon_poll_work(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare claimed_id uuid; result jsonb;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Invalid daemon user scope';
  end if;
  select id into claimed_id from feature_execution_runs
  where user_id = p_user_id and message = 'daemon_review' and status = 'queued'
    and cancel_requested = false order by created_at, id for update skip locked limit 1;
  if claimed_id is not null then
    update feature_execution_runs set status = 'running', started_at = now(), updated_at = now()
    where id = claimed_id;
  end if;
  select jsonb_build_object(
    'communications', coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (
      select purpose, content, updated_at from communications where user_id = p_user_id
      and message = 'daemon_review'
      and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')
      order by purpose limit 6) r), '[]'::jsonb),
    'agentTasks', coalesce((select jsonb_agg(to_jsonb(r) order by queue_sequence) from (
      select id, repository, prompt, provider, model, reasoning, planning_mode,
        targeted_feature_paths, status, queue_sequence, base_commit, branch_name,
        worktree_path, batch_id, error, verification_attempts, cancel_requested,
        created_at, started_at, completed_at, updated_at
      from agent_tasks where user_id = p_user_id and message = 'daemon_review'
      order by queue_sequence limit 100) r), '[]'::jsonb),
    'orchestrationBatches', coalesce((select jsonb_agg(to_jsonb(r) order by created_at) from (
      select id, repository, base_commit, task_ids, integration_branch,
        integration_worktree_path, status, message, resolver_attempts, quiet_since,
        created_at, completed_at, updated_at
      from orchestration_batches where user_id = p_user_id and message = 'daemon_review'
      order by created_at limit 100) r), '[]'::jsonb),
    'featureRunControls', coalesce((select jsonb_agg(to_jsonb(r) order by created_at, id) from (
      select id, status, cancel_requested, created_at from feature_execution_runs
      where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running')
        and id is distinct from claimed_id
      order by created_at, id limit 100) r), '[]'::jsonb),
    'claimedFeatureRun', (select case when r.id is null then null else to_jsonb(r) end from (
      select id, project_directory, feature_file_path, status, cancel_requested
      from feature_execution_runs where id = claimed_id) r)
  ) into result;
  return result;
end;
$$;
revoke all on function daemon_poll_work(uuid) from public;
grant execute on function daemon_poll_work(uuid) to anon;

create function daemon_get_agent_task_control(p_user_id uuid, p_task_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when task.id is null then null else jsonb_build_object(
    'id', task.id, 'status', task.status, 'cancel_requested', task.cancel_requested,
    'updated_at', task.updated_at) end
  from (select 1) seed
  left join agent_tasks task on task.id = p_task_id and task.user_id = p_user_id
    and task.message = 'daemon_review';
$$;
revoke all on function daemon_get_agent_task_control(uuid, uuid) from public;
grant execute on function daemon_get_agent_task_control(uuid, uuid) to anon;

create function daemon_manager_tick(
  p_user_id uuid, p_manager_instance_id uuid, p_execution_process_id integer,
  p_execution_started_at timestamptz, p_status_detail text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  update daemon_manager_state set manager_heartbeat_at = now(),
    execution_process_id = p_execution_process_id,
    execution_started_at = p_execution_started_at,
    status_detail = coalesce(p_status_detail, status_detail),
    message = 'client_review', updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id;
  if not found then raise exception 'Manager lease ownership was lost'; end if;
  select jsonb_build_object(
    'activeRequest', case when request_row.id is null then null else jsonb_build_object(
      'id', request_row.id, 'status', request_row.status, 'updated_at', request_row.updated_at) end,
    'drainSummary', case when request_row.status <> 'draining' then null else jsonb_build_object(
      'total',
        (select count(*) from agent_tasks where user_id=p_user_id and message='daemon_review') +
        (select count(*) from orchestration_batches where user_id=p_user_id and message='daemon_review') +
        (select count(*) from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status in ('queued','running')) +
        (select count(*) from communications where user_id=p_user_id and message='daemon_review'),
      'agentTasks', (select count(*) from agent_tasks where user_id=p_user_id and message='daemon_review'),
      'orchestrationBatches', (select count(*) from orchestration_batches where user_id=p_user_id and message='daemon_review'),
      'featureExecutions', (select count(*) from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status in ('queued','running')),
      'communications', coalesce((select jsonb_object_agg(purpose, count) from (
        select purpose, count(*) as count from communications where user_id=p_user_id
        and message='daemon_review' group by purpose order by purpose limit 10) counts), '{}'::jsonb)
    ) end
  ) into result
  from daemon_manager_state state_row
  left join daemon_manager_requests request_row
    on request_row.id = state_row.active_request_id and request_row.message = 'daemon_review'
  where state_row.user_id = p_user_id and state_row.manager_instance_id = p_manager_instance_id;
  return result;
end;
$$;
revoke all on function daemon_manager_tick(uuid, uuid, integer, timestamptz, text) from public;
grant execute on function daemon_manager_tick(uuid, uuid, integer, timestamptz, text) to anon;

create type agent_output_history_summary as (
  id uuid, prompt_id text, task_id uuid, conversation_id text, repository text,
  prompt_snippet text, provider text, model text, reasoning text, mode text,
  source text, targeted_feature_paths jsonb, status text, status_detail text,
  created_at timestamptz, started_at timestamptz, completed_at timestamptz, updated_at timestamptz
);
drop function if exists search_agent_output_history(text, integer);
create function search_agent_output_history(p_query text, p_limit integer default 50)
returns setof agent_output_history_summary language sql stable security definer set search_path = public as $$
  select history.id, history.prompt_id, history.task_id, history.conversation_id,
    history.repository, left(history.prompt, 240), history.provider, history.model,
    history.reasoning, history.mode, history.source, history.targeted_feature_paths,
    history.status, history.status_detail, history.created_at, history.started_at,
    history.completed_at, history.updated_at
  from agent_output_history history
  where history.user_id = auth.uid() and (nullif(trim(p_query), '') is null or
    concat_ws(' ', history.prompt, history.repository, history.targeted_feature_paths::text,
      history.provider, history.model, history.mode, history.status) ilike '%' || trim(p_query) || '%')
  order by coalesce(history.completed_at, history.updated_at) desc, history.id desc
  limit least(greatest(p_limit, 1), 50);
$$;
revoke all on function search_agent_output_history(text, integer) from public;
grant execute on function search_agent_output_history(text, integer) to authenticated;

create function get_agent_output_history_page(
  p_cursor_completed_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 31
) returns setof agent_output_history_summary
language sql stable security definer set search_path = public as $$
  select history.id, history.prompt_id, history.task_id, history.conversation_id,
    history.repository, left(history.prompt, 240), history.provider, history.model,
    history.reasoning, history.mode, history.source, history.targeted_feature_paths,
    history.status, history.status_detail, history.created_at, history.started_at,
    history.completed_at, history.updated_at
  from agent_output_history history
  where history.user_id = auth.uid() and history.completed_at is not null
    and (p_cursor_completed_at is null or (history.completed_at, history.id) < (p_cursor_completed_at, p_cursor_id))
  order by history.completed_at desc, history.id desc
  limit least(greatest(p_limit, 1), 31);
$$;
revoke all on function get_agent_output_history_page(timestamptz, uuid, integer) from public;
grant execute on function get_agent_output_history_page(timestamptz, uuid, integer) to authenticated;
