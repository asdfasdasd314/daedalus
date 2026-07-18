alter table architecture_views
  add column failure_details jsonb;

alter table architecture_views
  add constraint architecture_views_failure_details_object_check
  check (failure_details is null or jsonb_typeof(failure_details) = 'object');

drop function if exists daemon_complete_architecture_view(
  uuid, uuid, integer, timestamptz, text, jsonb, jsonb, text, text, text, text
);

create function daemon_complete_architecture_view(
  p_user_id uuid, p_view_id uuid, p_generation integer,
  p_expected_updated_at timestamptz, p_status text,
  p_changed_files jsonb, p_architecture_document jsonb, p_error text,
  p_failure_details jsonb, p_provider text, p_model text, p_reasoning text
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
  if p_failure_details is not null and jsonb_typeof(p_failure_details) <> 'object' then
    raise exception 'Architecture failure details must be an object';
  end if;
  update architecture_views set
    status = p_status,
    message = 'client_review',
    changed_files = coalesce(p_changed_files, changed_files),
    architecture_document = case when p_status = 'completed' then p_architecture_document else architecture_document end,
    error = case when p_status = 'failed' then coalesce(nullif(p_error, ''), 'Architecture generation failed.') else '' end,
    failure_details = case when p_status = 'failed' then p_failure_details else null end,
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

revoke all on function daemon_complete_architecture_view(uuid, uuid, integer, timestamptz, text, jsonb, jsonb, text, jsonb, text, text, text) from public;
grant execute on function daemon_complete_architecture_view(uuid, uuid, integer, timestamptz, text, jsonb, jsonb, text, jsonb, text, text, text) to anon;

create or replace function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path = public as $$
  with owner as (select auth.uid() as user_id)
  select jsonb_build_object(
    'communications', coalesce((select jsonb_agg(to_jsonb(row_data) order by purpose) from (select purpose, content, updated_at from communications, owner where communications.user_id = owner.user_id and message = 'client_review' order by purpose limit 10) row_data), '[]'::jsonb),
    'daemonPayloads', coalesce((select jsonb_agg(to_jsonb(row_data) order by kind) from (select kind, payload, updated_at from daemon_payloads, owner where daemon_payloads.user_id = owner.user_id and message = 'client_review' order by kind limit 3) row_data), '[]'::jsonb),
    'agentTasks', coalesce((select jsonb_agg(to_jsonb(row_data) order by updated_at, id) from (select id, repository, prompt, provider, model, reasoning, planning_mode, targeted_feature_paths, status, queue_sequence, created_at, started_at, completed_at, error, verification_attempts, cancel_requested, updated_at from agent_tasks, owner where agent_tasks.user_id = owner.user_id and message = 'client_review' order by updated_at, id limit 50) row_data), '[]'::jsonb),
    'architectureViews', coalesce((select jsonb_agg(to_jsonb(row_data) order by updated_at, id) from (select id, prompt_id, repository, base_commit, final_commit, targeted_feature_paths, generation, status, changed_files, architecture_document, error, failure_details, provider, model, reasoning, requested_at, started_at, completed_at, created_at, updated_at from architecture_views, owner where architecture_views.user_id = owner.user_id and message = 'client_review' order by updated_at, id limit 10) row_data), '[]'::jsonb),
    'featureExecutionRuns', coalesce((select jsonb_agg(to_jsonb(row_data) order by updated_at, id) from (select id, project_directory, feature_file_path, status, cancel_requested, command, parameter_file_path, entry_point_path, started_at, completed_at, exit_code, stdout_tail, stderr_tail, error, updated_at from feature_execution_runs, owner where feature_execution_runs.user_id = owner.user_id and message = 'client_review' order by updated_at, id limit 50) row_data), '[]'::jsonb),
    'daemonEvents', coalesce((select jsonb_agg(to_jsonb(row_data) order by created_at, id) from (select id, severity, content, created_at from daemon_events, owner where daemon_events.user_id = owner.user_id and message = 'client_review' order by created_at, id limit 50) row_data), '[]'::jsonb),
    'managerStatus', (select case when state_row.user_id is null then null else jsonb_build_object('state', state_row.state, 'accepts_work', state_row.accepts_work, 'manager_heartbeat_at', state_row.manager_heartbeat_at, 'execution_process_id', state_row.execution_process_id, 'execution_generation', state_row.execution_generation, 'execution_started_at', state_row.execution_started_at, 'last_successful_restart_at', state_row.last_successful_restart_at, 'status_detail', state_row.status_detail, 'updated_at', state_row.updated_at, 'activeRequest', case when request_row.id is null then null else jsonb_build_object('id', request_row.id, 'status', request_row.status, 'blockers', request_row.blockers) end) end from owner left join daemon_manager_state state_row on state_row.user_id = owner.user_id and state_row.message = 'client_review' left join daemon_manager_requests request_row on request_row.id = state_row.active_request_id)
  );
$$;

-- Keep the complete recovery inbox introduced by migration 030 while adding
-- failure_details to its bounded Architecture View projection.
create or replace function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path=public as $$
  with owner as (select auth.uid() user_id)
  select jsonb_build_object(
    'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (select purpose,content,updated_at from communications,owner where communications.user_id=owner.user_id and communications.message='client_review' order by purpose limit 10) r),'[]'),
    'daemonPayloads',coalesce((select jsonb_agg(to_jsonb(r) order by kind) from (select kind,payload,updated_at from daemon_payloads,owner where daemon_payloads.user_id=owner.user_id and daemon_payloads.message='client_review' order by kind limit 3) r),'[]'),
    'agentTasks',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,status,queue_sequence,created_at,started_at,completed_at,error,verification_attempts,cancel_requested,retry_generation,updated_at from agent_tasks,owner where agent_tasks.user_id=owner.user_id and agent_tasks.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'orchestrationBatches',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,repository,base_commit,task_ids,integration_branch,integration_worktree_path,status,resolver_attempts,verification_output,retry_generation,created_at,completed_at,updated_at from orchestration_batches,owner where orchestration_batches.user_id=owner.user_id and orchestration_batches.message='client_review' order by updated_at,id limit 30) r),'[]'),
    'taskDeletionRequests',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,task_id,prompt_id,status,error,updated_at from agent_task_deletion_requests,owner where agent_task_deletion_requests.user_id=owner.user_id and agent_task_deletion_requests.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'architectureViews',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,status,changed_files,architecture_document,error,failure_details,provider,model,reasoning,requested_at,started_at,completed_at,updated_at from architecture_views,owner where architecture_views.user_id=owner.user_id and architecture_views.message='client_review' order by updated_at,id limit 20) r),'[]'),
    'featureExecutionRuns',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,project_directory,feature_file_path,status,cancel_requested,command,parameter_file_path,entry_point_path,started_at,completed_at,exit_code,stdout_tail,stderr_tail,error,updated_at from feature_execution_runs,owner where feature_execution_runs.user_id=owner.user_id and feature_execution_runs.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'daemonEvents',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (select id,severity,content,created_at from daemon_events,owner where daemon_events.user_id=owner.user_id and daemon_events.message='client_review' order by created_at,id limit 50) r),'[]'),
    'managerStatus',(select case when s.user_id is null then null else jsonb_build_object('state',s.state,'accepts_work',s.accepts_work,'manager_heartbeat_at',s.manager_heartbeat_at,'execution_process_id',s.execution_process_id,'execution_generation',s.execution_generation,'execution_started_at',s.execution_started_at,'last_successful_restart_at',s.last_successful_restart_at,'status_detail',s.status_detail,'updated_at',s.updated_at,'activeRequest',case when q.id is null then null else jsonb_build_object('id',q.id,'status',q.status,'blockers',q.blockers) end) end from owner left join daemon_manager_state s on s.user_id=owner.user_id and s.message='client_review' left join daemon_manager_requests q on q.id=s.active_request_id)
  );
$$;
