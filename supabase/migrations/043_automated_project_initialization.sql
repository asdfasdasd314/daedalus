alter table daemon_manager_state add column execution_root text;

drop policy if exists "authenticated users can insert own communications" on communications;
create policy "authenticated users can insert own communications"
on communications for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    message <> 'daemon_review'
    or purpose not in (
      'agent_prompt','git_sync_request','project_initialization_request',
      'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
    )
    or daemon_accepts_work(auth.uid())
  )
);

drop policy if exists "authenticated users can update own communications" on communications;
create policy "authenticated users can update own communications"
on communications for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (
    message <> 'daemon_review'
    or purpose not in (
      'agent_prompt','git_sync_request','project_initialization_request',
      'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
    )
    or daemon_accepts_work(auth.uid())
  )
);

alter table daemon_payloads drop constraint if exists daemon_payloads_kind_check;
alter table daemon_payloads add constraint daemon_payloads_kind_check check (
  kind in ('feature_files','parameter_files','git_sync_result','project_initialization_result')
);

create or replace function daemon_list_communication_reviews(p_user_id uuid)
returns table(purpose text, content text, updated_at timestamptz)
language sql security definer set search_path=public as $$
  select communications.purpose,communications.content,communications.updated_at
  from communications
  where communications.user_id=p_user_id and communications.message='daemon_review'
    and communications.purpose in (
      'agent_prompt','git_sync_request','project_initialization_request',
      'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
    )
  order by communications.purpose limit 7;
$$;

create or replace function daemon_upsert_payload(
  p_user_id uuid,p_kind text,p_payload jsonb
) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_kind not in (
    'feature_files','parameter_files','git_sync_result','project_initialization_result'
  ) then raise exception 'Unsupported daemon payload kind: %',p_kind; end if;
  insert into daemon_payloads(user_id,kind,payload,message)
  values(p_user_id,p_kind,p_payload,'client_review')
  on conflict(user_id,kind) do update set
    payload=excluded.payload,message=excluded.message,updated_at=now();
end;
$$;

create or replace function daemon_poll_task_work(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
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

create or replace function daemon_poll_work(p_user_id uuid)
returns jsonb language sql security definer set search_path=public as $$
  select daemon_poll_task_work(p_user_id);
$$;

create or replace function daemon_manager_get_drain_summary(
  p_user_id uuid,p_manager_instance_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not exists(select 1 from daemon_manager_state where user_id=p_user_id
    and manager_instance_id=p_manager_instance_id) then raise exception 'Manager lease is not owned'; end if;
  select jsonb_build_object(
    'total',agent_count+feature_count+architecture_count+communication_count,
    'agentTasks',agent_count,'featureExecutions',feature_count,
    'architectureViews',architecture_count,'communications',communication_counts,
    'identifiers',jsonb_build_object(
      'agentTasks',coalesce((select jsonb_agg(id order by queue_sequence) from (
        select id,queue_sequence from agent_tasks where user_id=p_user_id and message='daemon_review'
          and status in('queued','running','verifying','ready','integrating','resolving')
        order by queue_sequence limit 100) rows),'[]'),
      'featureExecutions',coalesce((select jsonb_agg(id order by created_at) from (
        select id,created_at from feature_execution_runs where user_id=p_user_id
          and message='daemon_review' and status in('queued','running')
        order by created_at limit 100) rows),'[]'),
      'architectureViews',coalesce((select jsonb_agg(id order by requested_at,id) from (
        select id,requested_at from architecture_views where user_id=p_user_id
          and message='daemon_review' and status in('queued','running')
        order by requested_at,id limit 10) rows),'[]'),
      'communications',coalesce((select jsonb_agg(jsonb_build_object(
        'purpose',purpose,'updatedAt',updated_at) order by purpose) from communications
        where user_id=p_user_id and message='daemon_review' and purpose in (
          'agent_prompt','git_sync_request','project_initialization_request',
          'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
        )),'[]')
    )) into result
  from (select
    (select count(*) from agent_tasks where user_id=p_user_id and message='daemon_review'
      and status in('queued','running','verifying','ready','integrating','resolving')) agent_count,
    (select count(*) from feature_execution_runs where user_id=p_user_id and message='daemon_review'
      and status in('queued','running')) feature_count,
    (select count(*) from architecture_views where user_id=p_user_id and message='daemon_review'
      and status in('queued','running')) architecture_count,
    (select count(*) from communications where user_id=p_user_id and message='daemon_review'
      and purpose in (
        'agent_prompt','git_sync_request','project_initialization_request',
        'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
      )) communication_count,
    coalesce((select jsonb_object_agg(purpose,purpose_count) from (
      select purpose,count(*) purpose_count from communications
      where user_id=p_user_id and message='daemon_review' and purpose in (
        'agent_prompt','git_sync_request','project_initialization_request',
        'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
      ) group by purpose) groups),'{}') communication_counts) counts;
  return result;
end;
$$;

drop function daemon_manager_acquire_lease(uuid,uuid,integer);
create function daemon_manager_acquire_lease(
  p_user_id uuid,p_manager_instance_id uuid,p_stale_after_seconds integer,p_execution_root text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  insert into daemon_manager_state(
    user_id,manager_instance_id,manager_heartbeat_at,status_detail,message,execution_root
  ) values(p_user_id,p_manager_instance_id,now(),'Manager connected.','client_review',p_execution_root)
  on conflict(user_id) do update set manager_instance_id=excluded.manager_instance_id,
    manager_heartbeat_at=now(),execution_root=excluded.execution_root,
    message='client_review',updated_at=now()
  where daemon_manager_state.manager_instance_id=p_manager_instance_id
    or daemon_manager_state.manager_instance_id is null
    or daemon_manager_state.manager_heartbeat_at is null
    or daemon_manager_state.manager_heartbeat_at <
      now()-make_interval(secs=>greatest(p_stale_after_seconds,1));
  return found;
end;
$$;

drop function daemon_manager_publish_heartbeat(uuid,uuid,integer,timestamptz,text);
create function daemon_manager_publish_heartbeat(
  p_user_id uuid,p_manager_instance_id uuid,p_execution_process_id integer,
  p_execution_started_at timestamptz,p_status_detail text default null,p_execution_root text default null
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  update daemon_manager_state set manager_heartbeat_at=now(),
    execution_process_id=p_execution_process_id,execution_started_at=p_execution_started_at,
    execution_root=coalesce(p_execution_root,execution_root),
    status_detail=coalesce(p_status_detail,status_detail),message='client_review',updated_at=now()
  where user_id=p_user_id and manager_instance_id=p_manager_instance_id;
  return found;
end;
$$;

drop function daemon_manager_tick(uuid,uuid,integer,timestamptz,text);
create function daemon_manager_tick(
  p_user_id uuid,p_manager_instance_id uuid,p_execution_process_id integer,
  p_execution_started_at timestamptz,p_status_detail text default null,p_execution_root text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  update daemon_manager_state set manager_heartbeat_at=now(),
    execution_process_id=p_execution_process_id,execution_started_at=p_execution_started_at,
    execution_root=coalesce(p_execution_root,execution_root),
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
    'taskDeletionRequests',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,task_id,prompt_id,status,error,updated_at from agent_task_deletion_requests,owner
      where agent_task_deletion_requests.user_id=owner.user_id
        and agent_task_deletion_requests.message='client_review' order by updated_at,id limit 50) r),'[]'),
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

revoke all on function daemon_manager_acquire_lease(uuid,uuid,integer,text) from public;
revoke all on function daemon_manager_publish_heartbeat(uuid,uuid,integer,timestamptz,text,text) from public;
revoke all on function daemon_manager_tick(uuid,uuid,integer,timestamptz,text,text) from public;
revoke all on function get_client_review_inbox() from public;
grant execute on function daemon_manager_acquire_lease(uuid,uuid,integer,text) to anon;
grant execute on function daemon_manager_publish_heartbeat(uuid,uuid,integer,timestamptz,text,text) to anon;
grant execute on function daemon_manager_tick(uuid,uuid,integer,timestamptz,text,text) to anon;
grant execute on function get_client_review_inbox() to authenticated;
