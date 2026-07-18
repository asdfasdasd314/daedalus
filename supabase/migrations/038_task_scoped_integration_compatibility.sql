-- Additive cutover contract for task-scoped integration. Legacy batch objects
-- remain available until the old daemon has promoted this delivery and drained.

alter table agent_tasks
  add column if not exists resolver_attempts integer not null default 0;

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
    batch_id = coalesce((p_updates->>'batch_id')::uuid, batch_id),
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

create or replace function request_agent_task_retry(
  p_task_id uuid, p_expected_updated_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update agent_tasks set
    status = case status when 'failed' then 'queued' when 'blocked' then 'ready' end,
    message = 'daemon_review', cancel_requested = false, completed_at = null,
    retry_generation = retry_generation + 1,
    resolver_attempts = case when status = 'blocked' then 0 else resolver_attempts end,
    updated_at = now()
  where id = p_task_id and user_id = auth.uid() and updated_at = p_expected_updated_at
    and status in ('failed','blocked') and worktree_path is not null and branch_name is not null;
  return found;
end;
$$;

create or replace function daemon_list_task_integration_work(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path = public as $$
  select task.* from agent_tasks task
  where task.user_id = p_user_id and task.message = 'daemon_review'
  order by task.queue_sequence limit 100;
$$;

create or replace function daemon_poll_task_work(p_user_id uuid)
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
      select purpose,content,updated_at from communications
      where user_id=p_user_id and message='daemon_review'
        and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')
      order by purpose limit 6) r),'[]'),
    'agentTasks',coalesce((select jsonb_agg(to_jsonb(task) order by task.queue_sequence)
      from daemon_list_task_integration_work(p_user_id) task),'[]'),
    'architectureViews',coalesce((select jsonb_agg(to_jsonb(r) order by requested_at,id) from (
      select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,status,requested_at,updated_at
      from architecture_views where user_id=p_user_id and message='daemon_review' and status in ('queued','running')
      order by requested_at,id limit 10) r),'[]'),
    'featureRunControls',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (
      select id,status,cancel_requested,created_at from feature_execution_runs
      where user_id=p_user_id and message='daemon_review' and status in ('queued','running') and id is distinct from claimed_id
      order by created_at,id limit 100) r),'[]'),
    'claimedFeatureRun',(select case when r.id is null then null else to_jsonb(r) end from (
      select id,project_directory,feature_file_path,status,cancel_requested from feature_execution_runs where id=claimed_id
    ) r)
  ) into result;
  return result;
end;
$$;

alter table daemon_events drop constraint if exists daemon_events_event_type_check;
alter table daemon_events add constraint daemon_events_event_type_check check (event_type in (
  'status','batch_completed','task_integrated','migration_deployment_started',
  'migration_deployment_no_pending','migration_deployment_succeeded','migration_deployment_blocked'
));

create or replace function daemon_record_task_event(
  p_user_id uuid, p_repository text, p_task_id uuid,
  p_severity text, p_message text, p_event_type text default 'status'
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event_type not in (
    'status','task_integrated','migration_deployment_started','migration_deployment_no_pending',
    'migration_deployment_succeeded','migration_deployment_blocked'
  ) then raise exception 'Unsupported daemon task event type: %', p_event_type; end if;
  insert into daemon_events (
    user_id,repository,task_id,severity,event_type,message,content
  ) values (
    p_user_id,p_repository,p_task_id,p_severity,p_event_type,'client_review',p_message
  );
end;
$$;

revoke all on function daemon_list_task_integration_work(uuid) from public;
revoke all on function daemon_poll_task_work(uuid) from public;
revoke all on function daemon_record_task_event(uuid,text,uuid,text,text,text) from public;
grant execute on function daemon_list_task_integration_work(uuid) to anon;
grant execute on function daemon_poll_task_work(uuid) to anon;
grant execute on function daemon_record_task_event(uuid,text,uuid,text,text,text) to anon;
grant execute on function request_agent_task_retry(uuid,timestamptz) to authenticated;
