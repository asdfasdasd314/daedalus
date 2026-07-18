alter table architecture_views
  add column architecture_document jsonb;

update architecture_views
set status = 'failed',
    error = 'Structured architecture unavailable. Regenerate this Architecture View.'
where status = 'completed' and architecture_document is null;

alter table architecture_views
  add constraint architecture_views_document_object_check
    check (architecture_document is null or jsonb_typeof(architecture_document) = 'object'),
  add constraint architecture_views_completed_document_check
    check (status <> 'completed' or architecture_document is not null);

drop function if exists daemon_complete_architecture_view(
  uuid, uuid, integer, timestamptz, text, jsonb, text, text, text, text, text
);

alter table architecture_views drop column report_markdown;

create function daemon_complete_architecture_view(
  p_user_id uuid, p_view_id uuid, p_generation integer,
  p_expected_updated_at timestamptz, p_status text,
  p_changed_files jsonb, p_architecture_document jsonb, p_error text,
  p_provider text, p_model text, p_reasoning text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('completed', 'failed') then
    raise exception 'Unsupported architecture completion status: %', p_status;
  end if;
  if p_status = 'completed' and (
    p_architecture_document is null
    or jsonb_typeof(p_architecture_document) <> 'object'
  ) then
    raise exception 'Completed architecture views require an object document';
  end if;
  update architecture_views set
    status = p_status,
    message = 'client_review',
    changed_files = coalesce(p_changed_files, changed_files),
    architecture_document = case
      when p_status = 'completed' then p_architecture_document
      else architecture_document
    end,
    error = case
      when p_status = 'failed' then coalesce(nullif(p_error, ''), 'Architecture generation failed.')
      else ''
    end,
    provider = coalesce(p_provider, ''),
    model = coalesce(p_model, ''),
    reasoning = coalesce(p_reasoning, ''),
    completed_at = now()
  where id = p_view_id and user_id = p_user_id and generation = p_generation
    and status = 'running' and message = 'daemon_review'
    and updated_at = p_expected_updated_at;
  return found;
end;
$$;
revoke all on function daemon_complete_architecture_view(uuid, uuid, integer, timestamptz, text, jsonb, jsonb, text, text, text, text) from public;
grant execute on function daemon_complete_architecture_view(uuid, uuid, integer, timestamptz, text, jsonb, jsonb, text, text, text, text) to anon;

create or replace function request_architecture_view(p_prompt_id text)
returns setof architecture_views
language plpgsql security definer set search_path = public as $$
begin
  return query
  update architecture_views set
    generation = generation + 1,
    status = 'queued',
    message = 'daemon_review',
    error = '',
    requested_at = now(),
    started_at = null,
    completed_at = null
  where user_id = auth.uid() and prompt_id = p_prompt_id
    and status in ('available', 'completed', 'failed')
    and nullif(base_commit, '') is not null and nullif(final_commit, '') is not null
  returning architecture_views.*;
end;
$$;

create or replace function get_client_review_inbox()
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
    'architectureViews', coalesce((select jsonb_agg(to_jsonb(row_data) order by updated_at, id) from (
      select id, prompt_id, repository, base_commit, final_commit,
        targeted_feature_paths, generation, status, changed_files,
        architecture_document, error, provider, model, reasoning, requested_at,
        started_at, completed_at, created_at, updated_at
      from architecture_views, owner
      where architecture_views.user_id = owner.user_id and message = 'client_review'
      order by updated_at, id limit 10
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

create or replace function acknowledge_client_reviews(receipts jsonb)
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
      when 'architectureViews' then
        update architecture_views set message = 'client_complete'
        where user_id = owner_id and id = (receipt->>'key')::uuid
          and generation = (receipt->>'generation')::integer
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

create or replace function daemon_poll_work(p_user_id uuid)
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
        targeted_feature_paths, status, queue_sequence, base_commit, completed_commit,
        branch_name, worktree_path, batch_id, error, verification_attempts,
        cancel_requested, created_at, started_at, completed_at, updated_at
      from agent_tasks where user_id = p_user_id and message = 'daemon_review'
      order by queue_sequence limit 100) r), '[]'::jsonb),
    'orchestrationBatches', coalesce((select jsonb_agg(to_jsonb(r) order by created_at) from (
      select id, repository, base_commit, task_ids, integration_branch,
        integration_worktree_path, status, message, resolver_attempts, quiet_since,
        created_at, completed_at, updated_at
      from orchestration_batches where user_id = p_user_id and message = 'daemon_review'
      order by created_at limit 100) r), '[]'::jsonb),
    'architectureViews', coalesce((select jsonb_agg(to_jsonb(r) order by requested_at, id) from (
      select id, prompt_id, repository, base_commit, final_commit,
        targeted_feature_paths, generation, status, requested_at, updated_at
      from architecture_views where user_id = p_user_id and message = 'daemon_review'
        and status in ('queued', 'running')
      order by requested_at, id limit 10) r), '[]'::jsonb),
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
