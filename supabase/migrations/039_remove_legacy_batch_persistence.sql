-- Complete the task-scoped integration cutover. This migration is deliberately
-- forward-only and refuses to discard an orchestration batch that was not drained.

do $$
begin
  if exists (select 1 from orchestration_batches limit 1) then
    raise exception 'Legacy orchestration batches must be drained before migration 039 can run';
  end if;
end;
$$;

-- Remove batch-only entry points and compatibility wrappers before their tables.
revoke all on function daemon_upsert_orchestration_batch(uuid, jsonb) from public, anon, authenticated;
revoke all on function daemon_list_orchestration_batches(uuid) from public, anon, authenticated;
revoke all on function request_orchestration_batch_retry(uuid, timestamptz) from public, anon, authenticated;
revoke all on function daemon_delete_orchestration_batch(uuid, uuid) from public, anon, authenticated;
revoke all on function request_orchestration_batch_deletion(uuid, timestamptz) from public, anon, authenticated;
revoke all on function daemon_list_batch_deletion_requests(uuid) from public, anon, authenticated;
revoke all on function daemon_complete_batch_deletion(uuid, uuid, text) from public, anon, authenticated;

drop function daemon_upsert_orchestration_batch(uuid, jsonb);
drop function daemon_list_orchestration_batches(uuid);
drop function request_orchestration_batch_retry(uuid, timestamptz);
drop function daemon_delete_orchestration_batch(uuid, uuid);
drop function request_orchestration_batch_deletion(uuid, timestamptz);
drop function daemon_list_batch_deletion_requests(uuid);
drop function daemon_complete_batch_deletion(uuid, uuid, text);
drop function if exists daemon_record_event(uuid, text, uuid, uuid, text, text);
drop function if exists daemon_record_event(uuid, text, uuid, uuid, text, text, text);
drop function if exists get_client_review_inbox_previous();
drop function if exists acknowledge_client_reviews_previous(jsonb);

create or replace function daemon_update_agent_task(
  p_user_id uuid, p_task_id uuid, p_expected_status text, p_updates jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update agent_tasks set
    status = coalesce(p_updates->>'status', status),
    message = coalesce(
      p_updates->>'message',
      case when p_updates->>'status' in ('completed','failed','blocked','cancelled')
        then 'client_review' else message end
    ),
    base_commit = coalesce(p_updates->>'base_commit', base_commit),
    completed_commit = coalesce(p_updates->>'completed_commit', completed_commit),
    branch_name = coalesce(p_updates->>'branch_name', branch_name),
    worktree_path = coalesce(p_updates->>'worktree_path', worktree_path),
    result = coalesce(p_updates->>'result', result),
    error = coalesce(p_updates->>'error', error),
    verification_attempts = coalesce((p_updates->>'verification_attempts')::integer, verification_attempts),
    resolver_attempts = coalesce((p_updates->>'resolver_attempts')::integer, resolver_attempts),
    cancel_requested = coalesce((p_updates->>'cancel_requested')::boolean, cancel_requested),
    started_at = case when p_updates ? 'started_at' then (p_updates->>'started_at')::timestamptz else started_at end,
    completed_at = case when p_updates ? 'completed_at' then (p_updates->>'completed_at')::timestamptz else completed_at end,
    updated_at = now()
  where id = p_task_id and user_id = p_user_id and status = p_expected_status;
  return found;
end;
$$;

create or replace function daemon_list_agent_tasks(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path = public as $$
  select task.* from agent_tasks task
  where task.user_id = p_user_id and task.message = 'daemon_review'
  order by task.queue_sequence limit 100;
$$;

create or replace function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path = public as $$
  with owner as (select auth.uid() user_id)
  select jsonb_build_object(
    'communications', coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (
      select purpose,content,updated_at from communications,owner
      where communications.user_id=owner.user_id and communications.message='client_review'
      order by purpose limit 10) r),'[]'),
    'daemonPayloads', coalesce((select jsonb_agg(to_jsonb(r) order by kind) from (
      select kind,payload,updated_at from daemon_payloads,owner
      where daemon_payloads.user_id=owner.user_id and daemon_payloads.message='client_review'
      order by kind limit 3) r),'[]'),
    'agentTasks', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,
        status,queue_sequence,created_at,started_at,completed_at,error,verification_attempts,
        resolver_attempts,cancel_requested,retry_generation,updated_at
      from agent_tasks,owner where agent_tasks.user_id=owner.user_id
        and agent_tasks.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'taskDeletionRequests', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,task_id,prompt_id,status,error,updated_at from agent_task_deletion_requests,owner
      where agent_task_deletion_requests.user_id=owner.user_id
        and agent_task_deletion_requests.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'architectureViews', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,
        status,changed_files,architecture_document,error,failure_details,provider,model,reasoning,
        requested_at,started_at,completed_at,created_at,updated_at
      from architecture_views,owner where architecture_views.user_id=owner.user_id
        and architecture_views.message='client_review' order by updated_at,id limit 20) r),'[]'),
    'architectureProgressEvents', coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (
      select id,architecture_view_id,generation,stage,stage_order,attempt,total_attempts,detail,
        created_at,updated_at from architecture_view_progress_events,owner
      where architecture_view_progress_events.user_id=owner.user_id
        and architecture_view_progress_events.message='client_review' order by created_at,id limit 50) r),'[]'),
    'featureExecutionRuns', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,project_directory,feature_file_path,status,cancel_requested,command,
        parameter_file_path,entry_point_path,started_at,completed_at,exit_code,stdout_tail,
        stderr_tail,error,updated_at from feature_execution_runs,owner
      where feature_execution_runs.user_id=owner.user_id
        and feature_execution_runs.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'daemonEvents', coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (
      select id,event_type,task_id,conversation_id,severity,content,created_at,updated_at
      from daemon_events,owner where daemon_events.user_id=owner.user_id
        and daemon_events.message='client_review' order by created_at,id limit 50) r),'[]'),
    'managerStatus', (select case when s.user_id is null then null else jsonb_build_object(
      'state',s.state,'accepts_work',s.accepts_work,'manager_heartbeat_at',s.manager_heartbeat_at,
      'execution_process_id',s.execution_process_id,'execution_generation',s.execution_generation,
      'execution_started_at',s.execution_started_at,
      'last_successful_restart_at',s.last_successful_restart_at,
      'status_detail',s.status_detail,'updated_at',s.updated_at,
      'activeRequest',case when q.id is null then null else jsonb_build_object(
        'id',q.id,'status',q.status,'blockers',q.blockers) end) end
      from owner left join daemon_manager_state s
        on s.user_id=owner.user_id and s.message='client_review'
      left join daemon_manager_requests q on q.id=s.active_request_id)
  );
$$;

create or replace function acknowledge_client_reviews(receipts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare owner_id uuid:=auth.uid(); r jsonb; rid text; ok jsonb:='[]'; stale jsonb:='[]';
begin
  if owner_id is null or jsonb_typeof(receipts)<>'array' then
    raise exception 'Authentication required with receipt array';
  end if;
  for r in select value from jsonb_array_elements(receipts) loop
    rid:=coalesce(r->>'receiptId','');
    case r->>'transport'
      when 'communications' then update communications set message='client_complete' where user_id=owner_id and purpose=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'daemonPayloads' then update daemon_payloads set message='client_complete' where user_id=owner_id and kind=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'agentTasks' then update agent_tasks set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'taskDeletionRequests' then update agent_task_deletion_requests set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'architectureViews' then update architecture_views set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and generation=(r->>'generation')::integer and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'architectureProgressEvents' then update architecture_view_progress_events set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and generation=(r->>'generation')::integer and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'featureExecutionRuns' then update feature_execution_runs set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'daemonEvents' then update daemon_events set message='client_complete' where user_id=owner_id and id=(r->>'key')::bigint and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'managerStatus' then update daemon_manager_state set message='client_complete' where user_id=owner_id and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      else stale:=stale||jsonb_build_array(rid); continue;
    end case;
    if found then ok:=ok||jsonb_build_array(rid); else stale:=stale||jsonb_build_array(rid); end if;
  end loop;
  return jsonb_build_object('acknowledged',ok,'rejected',stale);
end;
$$;

create or replace function daemon_poll_work(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare claimed_id uuid; result jsonb;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'Invalid daemon user scope';
  end if;
  select id into claimed_id from feature_execution_runs
  where user_id=p_user_id and message='daemon_review' and status='queued' and not cancel_requested
  order by created_at,id for update skip locked limit 1;
  if claimed_id is not null then
    update feature_execution_runs set status='running',started_at=now(),updated_at=now()
    where id=claimed_id;
  end if;
  select jsonb_build_object(
    'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (
      select purpose,content,updated_at from communications where user_id=p_user_id
        and message='daemon_review' and purpose in ('agent_prompt','git_sync_request',
        'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')
      order by purpose limit 6) r),'[]'),
    'agentTasks',coalesce((select jsonb_agg(to_jsonb(task) order by task.queue_sequence)
      from daemon_list_agent_tasks(p_user_id) task),'[]'),
    'architectureViews',coalesce((select jsonb_agg(to_jsonb(r) order by requested_at,id) from (
      select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,
        status,requested_at,updated_at from architecture_views where user_id=p_user_id
        and message='daemon_review' and status in ('queued','running')
      order by requested_at,id limit 10) r),'[]'),
    'featureRunControls',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (
      select id,status,cancel_requested,created_at from feature_execution_runs
      where user_id=p_user_id and message='daemon_review' and status in ('queued','running')
        and id is distinct from claimed_id order by created_at,id limit 100) r),'[]'),
    'claimedFeatureRun',(select case when r.id is null then null else to_jsonb(r) end from (
      select id,project_directory,feature_file_path,status,cancel_requested
      from feature_execution_runs where id=claimed_id) r)
  ) into result;
  return result;
end;
$$;

create or replace function daemon_manager_get_drain_summary(
  p_user_id uuid, p_manager_instance_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists (select 1 from daemon_manager_state where user_id=p_user_id
    and manager_instance_id=p_manager_instance_id) then raise exception 'Manager lease is not owned'; end if;
  select jsonb_build_object(
    'total',agent_count+feature_count+architecture_count+communication_count,
    'agentTasks',agent_count,'featureExecutions',feature_count,
    'architectureViews',architecture_count,'communications',communication_counts,
    'identifiers',jsonb_build_object(
      'agentTasks',coalesce((select jsonb_agg(id order by queue_sequence) from (
        select id,queue_sequence from agent_tasks where user_id=p_user_id
          and message='daemon_review' and status in ('queued','running','verifying','ready','integrating','resolving')
        order by queue_sequence limit 100) task_rows),'[]'),
      'featureExecutions',coalesce((select jsonb_agg(id order by created_at) from (
        select id,created_at from feature_execution_runs where user_id=p_user_id
          and message='daemon_review' and status in ('queued','running')
        order by created_at limit 100) run_rows),'[]'),
      'architectureViews',coalesce((select jsonb_agg(id order by requested_at,id) from (
        select id,requested_at from architecture_views where user_id=p_user_id
          and message='daemon_review' and status in ('queued','running')
        order by requested_at,id limit 10) architecture_rows),'[]'),
      'communications',coalesce((select jsonb_agg(jsonb_build_object(
        'purpose',purpose,'updatedAt',updated_at) order by purpose) from communications
        where user_id=p_user_id and message='daemon_review' and purpose in ('agent_prompt',
        'git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')),'[]')
    )) into result
  from (select
    (select count(*) from agent_tasks where user_id=p_user_id and message='daemon_review'
      and status in ('queued','running','verifying','ready','integrating','resolving')) agent_count,
    (select count(*) from feature_execution_runs where user_id=p_user_id and message='daemon_review'
      and status in ('queued','running')) feature_count,
    (select count(*) from architecture_views where user_id=p_user_id and message='daemon_review'
      and status in ('queued','running')) architecture_count,
    (select count(*) from communications where user_id=p_user_id and message='daemon_review'
      and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load',
        'parameter_file_update','entry_point_update')) communication_count,
    coalesce((select jsonb_object_agg(purpose,purpose_count) from (
      select purpose,count(*) purpose_count from communications where user_id=p_user_id
        and message='daemon_review' and purpose in ('agent_prompt','git_sync_request',
        'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')
      group by purpose) groups),'{}') communication_counts) counts;
  return result;
end;
$$;

create or replace function daemon_manager_update_blockers(
  p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid, p_blockers jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare normalized jsonb;
begin
  normalized := jsonb_build_object(
    'total',coalesce((p_blockers->>'agentTasks')::integer,0)
      +coalesce((p_blockers->>'featureExecutions')::integer,0)
      +coalesce((p_blockers->>'architectureViews')::integer,0)
      +coalesce((select sum(value::integer) from jsonb_each_text(coalesce(p_blockers->'communications','{}'))),0),
    'agentTasks',coalesce((p_blockers->>'agentTasks')::integer,0),
    'featureExecutions',coalesce((p_blockers->>'featureExecutions')::integer,0),
    'architectureViews',coalesce((p_blockers->>'architectureViews')::integer,0),
    'communications',coalesce(p_blockers->'communications','{}'),
    'identifiers',coalesce(p_blockers->'identifiers','{}') - 'orchestrationBatches'
  );
  update daemon_manager_requests request set blockers=normalized,updated_at=now()
  from daemon_manager_state state where request.id=p_request_id and request.user_id=p_user_id
    and request.status='draining' and state.user_id=p_user_id
    and state.manager_instance_id=p_manager_instance_id and state.active_request_id=p_request_id;
  return found;
end;
$$;

create or replace function daemon_manager_tick(
  p_user_id uuid,p_manager_instance_id uuid,p_execution_process_id integer,
  p_execution_started_at timestamptz,p_status_detail text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  update daemon_manager_state set manager_heartbeat_at=now(),
    execution_process_id=p_execution_process_id,execution_started_at=p_execution_started_at,
    status_detail=coalesce(p_status_detail,status_detail),message='client_review',updated_at=now()
  where user_id=p_user_id and manager_instance_id=p_manager_instance_id;
  if not found then raise exception 'Manager lease ownership was lost'; end if;
  select jsonb_build_object(
    'activeRequest',case when q.id is null then null else jsonb_build_object(
      'id',q.id,'status',q.status,'updated_at',q.updated_at) end,
    'drainSummary',case when q.status<>'draining' then null
      else daemon_manager_get_drain_summary(p_user_id,p_manager_instance_id) end)
  into result from daemon_manager_state s left join daemon_manager_requests q
    on q.id=s.active_request_id and q.message='daemon_review'
  where s.user_id=p_user_id and s.manager_instance_id=p_manager_instance_id;
  return result;
end;
$$;

-- Strip stale batch blocker keys before any restart decision can observe them.
update daemon_manager_requests set blockers=jsonb_build_object(
  'total',coalesce((blockers->>'agentTasks')::integer,0)
    +coalesce((blockers->>'featureExecutions')::integer,0)
    +coalesce((blockers->>'architectureViews')::integer,0)
    +coalesce((select sum(value::integer) from jsonb_each_text(coalesce(blockers->'communications','{}'))),0),
  'agentTasks',coalesce((blockers->>'agentTasks')::integer,0),
  'featureExecutions',coalesce((blockers->>'featureExecutions')::integer,0),
  'architectureViews',coalesce((blockers->>'architectureViews')::integer,0),
  'communications',coalesce(blockers->'communications','{}'),
  'identifiers',coalesce(blockers->'identifiers','{}') - 'orchestrationBatches'
);
alter table daemon_manager_requests alter column blockers set default
  '{"total":0,"agentTasks":0,"featureExecutions":0,"architectureViews":0,"communications":{},"identifiers":{}}'::jsonb;

alter table daemon_events drop constraint if exists daemon_events_event_type_check;
alter table daemon_events add constraint daemon_events_event_type_check check (event_type in (
  'status','task_integrated','migration_deployment_started','migration_deployment_no_pending',
  'migration_deployment_succeeded','migration_deployment_blocked'
));

alter table daemon_events drop column batch_id;
alter table daemon_events drop column batch_generation;
alter table agent_tasks drop constraint agent_tasks_batch_id_fkey;
alter table agent_tasks drop column batch_id;
drop table orchestration_batch_deletion_requests;
drop table orchestration_batches;

revoke all on function get_client_review_inbox() from public;
revoke all on function acknowledge_client_reviews(jsonb) from public;
revoke all on function daemon_list_agent_tasks(uuid) from public;
revoke all on function daemon_poll_work(uuid) from public;
grant execute on function get_client_review_inbox() to authenticated;
grant execute on function acknowledge_client_reviews(jsonb) to authenticated;
grant execute on function daemon_list_agent_tasks(uuid) to anon;
grant execute on function daemon_poll_work(uuid) to anon;
