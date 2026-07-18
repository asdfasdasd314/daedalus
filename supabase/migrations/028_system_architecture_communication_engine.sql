alter table agent_tasks add column completed_commit text;

create table architecture_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  prompt_id text not null,
  repository text not null,
  base_commit text not null,
  final_commit text not null,
  targeted_feature_paths jsonb not null default '[]'::jsonb
    check (jsonb_typeof(targeted_feature_paths) = 'array'),
  generation integer not null default 0 check (generation >= 0),
  status text not null default 'available'
    check (status in ('available', 'queued', 'running', 'completed', 'failed')),
  message text not null default 'client_complete'
    check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  changed_files jsonb not null default '[]'::jsonb
    check (jsonb_typeof(changed_files) = 'array'),
  report_markdown text not null default '',
  error text not null default '',
  provider text not null default '',
  model text not null default '',
  reasoning text not null default '',
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, prompt_id),
  foreign key (user_id, prompt_id)
    references agent_output_history (user_id, prompt_id) on delete cascade
);

alter table architecture_views enable row level security;
revoke all on architecture_views from anon, authenticated;
grant select on architecture_views to authenticated;

create policy "authenticated users can read own architecture views"
on architecture_views for select to authenticated using (user_id = auth.uid());

create index architecture_views_daemon_review_idx
on architecture_views (user_id, requested_at, id)
where message = 'daemon_review' and status in ('queued', 'running');

create index architecture_views_client_review_idx
on architecture_views (user_id, updated_at, id)
where message = 'client_review';

create trigger set_architecture_views_updated_at
before update on architecture_views
for each row execute function set_updated_at();

alter table daemon_manager_requests alter column blockers set default
  '{"total":0,"agentTasks":0,"orchestrationBatches":0,"featureExecutions":0,"architectureViews":0,"communications":{}}'::jsonb;

create function get_architecture_view(p_prompt_id text)
returns setof architecture_views
language sql stable security definer set search_path = public as $$
  select architecture_views.* from architecture_views
  where user_id = auth.uid() and prompt_id = p_prompt_id
  limit 1;
$$;
revoke all on function get_architecture_view(text) from public;
grant execute on function get_architecture_view(text) to authenticated;

create function request_architecture_view(p_prompt_id text)
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
  returning architecture_views.*;
end;
$$;
revoke all on function request_architecture_view(text) from public;
grant execute on function request_architecture_view(text) to authenticated;

create function daemon_claim_architecture_view(
  p_user_id uuid, p_view_id uuid, p_generation integer,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  update architecture_views set status = 'running', started_at = now()
  where id = p_view_id and user_id = p_user_id and generation = p_generation
    and status in ('queued', 'running') and message = 'daemon_review'
    and updated_at = p_expected_updated_at
  returning jsonb_build_object(
    'id', id, 'prompt_id', prompt_id, 'repository', repository,
    'base_commit', base_commit, 'final_commit', final_commit,
    'targeted_feature_paths', targeted_feature_paths,
    'generation', generation, 'updated_at', updated_at
  ) into result;
  return result;
end;
$$;
revoke all on function daemon_claim_architecture_view(uuid, uuid, integer, timestamptz) from public;
grant execute on function daemon_claim_architecture_view(uuid, uuid, integer, timestamptz) to anon;

create function daemon_complete_architecture_view(
  p_user_id uuid, p_view_id uuid, p_generation integer,
  p_expected_updated_at timestamptz, p_status text,
  p_changed_files jsonb, p_report_markdown text, p_error text,
  p_provider text, p_model text, p_reasoning text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('completed', 'failed') then
    raise exception 'Unsupported architecture completion status: %', p_status;
  end if;
  update architecture_views set
    status = p_status,
    message = 'client_review',
    changed_files = coalesce(p_changed_files, changed_files),
    report_markdown = case when p_status = 'completed' then coalesce(p_report_markdown, '') else report_markdown end,
    error = case when p_status = 'failed' then coalesce(p_error, 'Architecture generation failed.') else '' end,
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
revoke all on function daemon_complete_architecture_view(uuid, uuid, integer, timestamptz, text, jsonb, text, text, text, text, text) from public;
grant execute on function daemon_complete_architecture_view(uuid, uuid, integer, timestamptz, text, jsonb, text, text, text, text, text) to anon;

create or replace function project_agent_task_to_output_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into agent_output_history (
    user_id, prompt_id, task_id, conversation_id, repository, prompt, output, error, provider,
    model, reasoning, mode, source, targeted_feature_paths, status,
    status_detail, created_at, started_at, completed_at, updated_at
  ) values (
    new.user_id, new.id::text, new.id, coalesce(nullif(new.conversation_id, ''), new.id::text), new.repository, new.prompt,
    coalesce(new.result, ''), coalesce(new.error, ''), new.provider, new.model,
    new.reasoning, 'standard', 'durable_task', new.targeted_feature_paths,
    new.status, left(nullif(coalesce(new.error, ''), ''), 500), new.created_at,
    new.started_at, new.completed_at, new.updated_at
  ) on conflict (user_id, prompt_id) do update set
    task_id = excluded.task_id, conversation_id = excluded.conversation_id,
    repository = excluded.repository, prompt = excluded.prompt,
    output = excluded.output, error = excluded.error, provider = excluded.provider,
    model = excluded.model, reasoning = excluded.reasoning,
    targeted_feature_paths = excluded.targeted_feature_paths,
    status = excluded.status, status_detail = excluded.status_detail,
    started_at = excluded.started_at, completed_at = excluded.completed_at,
    updated_at = excluded.updated_at;

  if new.status = 'completed' and new.base_commit is not null and new.completed_commit is not null then
    insert into architecture_views (
      user_id, prompt_id, repository, base_commit, final_commit,
      targeted_feature_paths
    ) values (
      new.user_id, new.id::text, new.repository, new.base_commit,
      new.completed_commit, new.targeted_feature_paths
    ) on conflict (user_id, prompt_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function daemon_update_agent_task(
  p_user_id uuid, p_task_id uuid, p_expected_status text, p_updates jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update agent_tasks set
    status = coalesce(p_updates->>'status', status),
    message = coalesce(p_updates->>'message', case when p_updates->>'status' in ('completed', 'failed', 'blocked', 'cancelled') then 'client_review' else message end),
    base_commit = coalesce(p_updates->>'base_commit', base_commit),
    completed_commit = coalesce(p_updates->>'completed_commit', completed_commit),
    branch_name = coalesce(p_updates->>'branch_name', branch_name),
    worktree_path = coalesce(p_updates->>'worktree_path', worktree_path),
    batch_id = coalesce((p_updates->>'batch_id')::uuid, batch_id),
    result = coalesce(p_updates->>'result', result),
    error = coalesce(p_updates->>'error', error),
    verification_attempts = coalesce((p_updates->>'verification_attempts')::integer, verification_attempts),
    cancel_requested = coalesce((p_updates->>'cancel_requested')::boolean, cancel_requested),
    started_at = case when p_updates ? 'started_at' then (p_updates->>'started_at')::timestamptz else started_at end,
    completed_at = case when p_updates ? 'completed_at' then (p_updates->>'completed_at')::timestamptz else completed_at end,
    updated_at = now()
  where id = p_task_id and user_id = p_user_id and status = p_expected_status;
  return found;
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
        report_markdown, error, provider, model, reasoning, requested_at,
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

create or replace function daemon_manager_get_drain_summary(p_user_id uuid, p_manager_instance_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists (select 1 from daemon_manager_state where user_id = p_user_id and manager_instance_id = p_manager_instance_id)
    then raise exception 'Manager lease is not owned'; end if;
  select jsonb_build_object('total', agent_count + batch_count + feature_count + architecture_count + communication_count,
    'agentTasks', agent_count, 'orchestrationBatches', batch_count,
    'featureExecutions', feature_count, 'architectureViews', architecture_count,
    'communications', communication_counts,
    'identifiers', jsonb_build_object(
      'agentTasks', coalesce((select jsonb_agg(id order by queue_sequence) from (select id, queue_sequence from agent_tasks where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running','verifying','ready','integrating','resolving') order by queue_sequence limit 100) task_rows), '[]'::jsonb),
      'orchestrationBatches', coalesce((select jsonb_agg(id order by created_at) from (select id, created_at from orchestration_batches where user_id = p_user_id and message = 'daemon_review' and status in ('collecting','integrating','resolving') order by created_at limit 100) batch_rows), '[]'::jsonb),
      'featureExecutions', coalesce((select jsonb_agg(id order by created_at) from (select id, created_at from feature_execution_runs where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running') order by created_at limit 100) run_rows), '[]'::jsonb),
      'architectureViews', coalesce((select jsonb_agg(id order by requested_at, id) from (select id, requested_at from architecture_views where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running') order by requested_at, id limit 10) architecture_rows), '[]'::jsonb),
      'communications', coalesce((select jsonb_agg(jsonb_build_object('purpose', purpose, 'updatedAt', updated_at) order by purpose) from communications where user_id = p_user_id and message = 'daemon_review' and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')), '[]'::jsonb)
    )) into result
  from (select
    (select count(*) from agent_tasks where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running','verifying','ready','integrating','resolving')) agent_count,
    (select count(*) from orchestration_batches where user_id = p_user_id and message = 'daemon_review' and status in ('collecting','integrating','resolving')) batch_count,
    (select count(*) from feature_execution_runs where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running')) feature_count,
    (select count(*) from architecture_views where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running')) architecture_count,
    (select count(*) from communications where user_id = p_user_id and message = 'daemon_review' and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')) communication_count,
    coalesce((select jsonb_object_agg(purpose, purpose_count) from (
      select purpose, count(*) purpose_count from communications where user_id = p_user_id and message = 'daemon_review'
      and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update') group by purpose
    ) groups), '{}'::jsonb) communication_counts) counts;
  return result;
end;
$$;

create or replace function daemon_manager_tick(
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
        (select count(*) from architecture_views where user_id=p_user_id and message='daemon_review' and status in ('queued','running')) +
        (select count(*) from communications where user_id=p_user_id and message='daemon_review'),
      'agentTasks', (select count(*) from agent_tasks where user_id=p_user_id and message='daemon_review'),
      'orchestrationBatches', (select count(*) from orchestration_batches where user_id=p_user_id and message='daemon_review'),
      'featureExecutions', (select count(*) from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status in ('queued','running')),
      'architectureViews', (select count(*) from architecture_views where user_id=p_user_id and message='daemon_review' and status in ('queued','running')),
      'communications', coalesce((select jsonb_object_agg(purpose,count) from (
        select purpose,count(*) count from communications where user_id=p_user_id
        and message='daemon_review' group by purpose order by purpose limit 10) counts),'{}'::jsonb)
    ) end
  ) into result
  from daemon_manager_state state_row
  left join daemon_manager_requests request_row
    on request_row.id=state_row.active_request_id and request_row.message='daemon_review'
  where state_row.user_id=p_user_id and state_row.manager_instance_id=p_manager_instance_id;
  return result;
end;
$$;
