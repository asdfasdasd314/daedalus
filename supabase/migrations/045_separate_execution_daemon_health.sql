-- Manager control-plane health and execution-daemon delivery health are distinct.
alter table daemon_manager_state add column if not exists execution_heartbeat_at timestamptz;

create or replace function daemon_poll_task_work(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare claimed_id uuid; result jsonb;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'Invalid daemon user scope';
  end if;

  insert into daemon_manager_state(user_id,execution_heartbeat_at,message)
  values(p_user_id,now(),'client_review')
  on conflict(user_id) do update set
    execution_heartbeat_at=excluded.execution_heartbeat_at,
    message='client_review',updated_at=now();

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
      and message='daemon_review' and purpose in (
        'agent_prompt','git_sync_request','project_initialization_request',
        'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
      ) order by purpose limit 7) r),'[]'),
    'agentTasks',coalesce((select jsonb_agg(to_jsonb(task) order by task.queue_sequence)
      from daemon_list_task_integration_work(p_user_id) task),'[]'),
    'architectureViews',coalesce((select jsonb_agg(to_jsonb(r) order by requested_at,id) from (
      select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,
        status,requested_at,updated_at from architecture_views where user_id=p_user_id
        and message='daemon_review' and status in('queued','running')
      order by requested_at,id limit 10) r),'[]'),
    'featureRunControls',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (
      select id,status,cancel_requested,created_at from feature_execution_runs
      where user_id=p_user_id and message='daemon_review' and status in('queued','running')
        and id is distinct from claimed_id order by created_at,id limit 100) r),'[]'),
    'claimedFeatureRun',(select case when r.id is null then null else to_jsonb(r) end from (
      select id,project_directory,feature_file_path,status,cancel_requested
      from feature_execution_runs where id=claimed_id) r)
  ) into result;
  return result;
end;
$$;

create or replace function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path=public as $$
  with owner as(select auth.uid() user_id)
  select jsonb_build_object(
    'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (
      select purpose,content,updated_at from communications,owner
      where communications.user_id=owner.user_id and communications.message='client_review'
      order by purpose limit 10) r),'[]'),
    'daemonPayloads',coalesce((select jsonb_agg(to_jsonb(r) order by kind) from (
      select kind,payload,updated_at from daemon_payloads,owner
      where daemon_payloads.user_id=owner.user_id and daemon_payloads.message='client_review'
      order by kind limit 4) r),'[]'),
    'agentTasks',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,
        status,queue_sequence,created_at,started_at,completed_at,error,verification_attempts,
        resolver_attempts,cancel_requested,retry_generation,updated_at from agent_tasks,owner
      where agent_tasks.user_id=owner.user_id and agent_tasks.message='client_review'
      order by updated_at,id limit 50) r),'[]'),
    'conversationDeletionRequests',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select request.id,request.conversation_id,
        coalesce((select jsonb_agg(item.task_id order by item.task_id)
          from agent_conversation_deletion_request_items item where item.request_id=request.id),'[]'::jsonb) task_ids,
        request.status,request.error,request.updated_at
      from agent_conversation_deletion_requests request,owner
      where request.user_id=owner.user_id and request.message='client_review'
      order by request.updated_at,request.id limit 50) r),'[]'),
    'architectureViews',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,
        status,changed_files,architecture_document,error,failure_details,provider,model,reasoning,
        requested_at,started_at,completed_at,created_at,updated_at from architecture_views,owner
      where architecture_views.user_id=owner.user_id and architecture_views.message='client_review'
      order by updated_at,id limit 20) r),'[]'),
    'architectureProgressEvents',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (
      select id,architecture_view_id,generation,stage,stage_order,attempt,total_attempts,detail,
        created_at,updated_at from architecture_view_progress_events,owner
      where architecture_view_progress_events.user_id=owner.user_id
        and architecture_view_progress_events.message='client_review'
      order by created_at,id limit 50) r),'[]'),
    'featureExecutionRuns',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,project_directory,feature_file_path,status,cancel_requested,command,
        parameter_file_path,entry_point_path,started_at,completed_at,exit_code,stdout_tail,
        stderr_tail,error,updated_at from feature_execution_runs,owner
      where feature_execution_runs.user_id=owner.user_id
        and feature_execution_runs.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'daemonEvents',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (
      select id,event_type,task_id,severity,content,created_at,updated_at
      from daemon_events,owner where daemon_events.user_id=owner.user_id
        and daemon_events.message='client_review' order by created_at,id limit 50) r),'[]'),
    'managerStatus',(select case when s.user_id is null then null else jsonb_build_object(
      'state',s.state,'accepts_work',s.accepts_work,'manager_heartbeat_at',s.manager_heartbeat_at,
      'execution_heartbeat_at',s.execution_heartbeat_at,
      'execution_process_id',s.execution_process_id,'execution_generation',s.execution_generation,
      'execution_started_at',s.execution_started_at,'execution_root',s.execution_root,
      'last_successful_restart_at',s.last_successful_restart_at,'status_detail',s.status_detail,
      'updated_at',s.updated_at,'activeRequest',case when q.id is null then null else
        jsonb_build_object('id',q.id,'status',q.status,'blockers',q.blockers) end) end
      from owner left join daemon_manager_state s
        on s.user_id=owner.user_id and s.message='client_review'
      left join daemon_manager_requests q on q.id=s.active_request_id)
  );
$$;

create or replace function acknowledge_client_reviews(receipts jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); r jsonb; ok jsonb:='[]'; stale jsonb:='[]'; begin
  if owner_id is null or jsonb_typeof(receipts)<>'array' then
    raise exception 'Authentication required with receipt array';
  end if;
  for r in select value from jsonb_array_elements(receipts) loop
    case r->>'transport'
      when 'communications' then update communications set message='client_complete' where user_id=owner_id and purpose=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'daemonPayloads' then update daemon_payloads set message='client_complete' where user_id=owner_id and kind=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'agentTasks' then update agent_tasks set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'conversationDeletionRequests' then update agent_conversation_deletion_requests set message='client_complete' where id=(r->>'key')::uuid and user_id=owner_id and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'architectureViews' then update architecture_views set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'architectureProgressEvents' then update architecture_view_progress_events set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and generation=(r->>'generation')::integer and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'featureExecutionRuns' then update feature_execution_runs set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'daemonEvents' then update daemon_events set message='client_complete' where user_id=owner_id and id=(r->>'key')::bigint and message='client_review';
      when 'managerStatus' then update daemon_manager_state set message='client_complete' where user_id=owner_id and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      else continue;
    end case;
    if found then ok:=ok||jsonb_build_array(r->>'receiptId'); else stale:=stale||jsonb_build_array(r->>'receiptId'); end if;
  end loop;
  return jsonb_build_object('acknowledged',ok,'rejected',stale);
end;
$$;

revoke all on function daemon_poll_task_work(uuid) from public;
revoke all on function get_client_review_inbox() from public;
revoke all on function acknowledge_client_reviews(jsonb) from public;
grant execute on function daemon_poll_task_work(uuid) to anon;
grant execute on function get_client_review_inbox() to authenticated;
grant execute on function acknowledge_client_reviews(jsonb) to authenticated;
