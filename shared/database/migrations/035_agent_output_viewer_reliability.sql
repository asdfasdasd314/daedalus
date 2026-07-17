-- Deterministic Agent Output Viewer delivery and terminal repair.
alter table daemon_events add column if not exists event_type text not null default 'status';
alter table daemon_events drop constraint if exists daemon_events_event_type_check;
alter table daemon_events add constraint daemon_events_event_type_check
  check (event_type in ('status', 'batch_completed'));
alter table daemon_events add column if not exists batch_generation integer;
alter table daemon_events add column if not exists updated_at timestamptz not null default now();

-- Completion events must retain their batch identity after the transient batch row is deleted.
alter table daemon_events drop constraint if exists daemon_events_batch_id_fkey;
drop index if exists daemon_events_review_idx;
create index daemon_events_review_idx on daemon_events (user_id, updated_at, id)
where message = 'client_review';

create or replace function daemon_upsert_orchestration_batch(p_user_id uuid, p_batch jsonb)
returns void language sql security definer set search_path = public as $$
  insert into orchestration_batches (
    id,user_id,repository,base_commit,task_ids,integration_branch,integration_worktree_path,
    status,message,resolver_attempts,verification_output,quiet_since,completed_at,retry_generation
  ) values (
    (p_batch->>'id')::uuid,p_user_id,p_batch->>'repository',p_batch->>'base_commit',coalesce(p_batch->'task_ids','[]'::jsonb),
    p_batch->>'integration_branch',coalesce(p_batch->>'integration_worktree_path',''),coalesce(p_batch->>'status','collecting'),
    case when p_batch->>'status'='blocked' then 'client_review' when p_batch->>'status'='completed' then 'daemon_complete' else 'daemon_review' end,
    coalesce((p_batch->>'resolver_attempts')::integer,0),coalesce(p_batch->>'verification_output',''),
    (p_batch->>'quiet_since')::timestamptz,(p_batch->>'completed_at')::timestamptz,coalesce((p_batch->>'retry_generation')::integer,0)
  ) on conflict (id) do update set
    integration_worktree_path=excluded.integration_worktree_path,status=excluded.status,message=excluded.message,
    resolver_attempts=excluded.resolver_attempts,verification_output=excluded.verification_output,
    quiet_since=excluded.quiet_since,completed_at=excluded.completed_at,
    retry_generation=case when p_batch ? 'retry_generation' then excluded.retry_generation else orchestration_batches.retry_generation end,
    updated_at=now();
$$;

drop function if exists daemon_record_event(uuid, text, uuid, uuid, text, text);
create function daemon_record_event(
  p_user_id uuid, p_repository text, p_task_id uuid, p_batch_id uuid,
  p_severity text, p_message text, p_event_type text default 'status'
)
returns void language plpgsql security definer set search_path = public as $$
declare event_generation integer;
begin
  if p_event_type not in ('status', 'batch_completed') then
    raise exception 'Unsupported daemon event type: %', p_event_type;
  end if;
  if p_batch_id is not null then
    select retry_generation into event_generation
    from orchestration_batches where id = p_batch_id and user_id = p_user_id;
  end if;
  insert into daemon_events (
    user_id, repository, task_id, batch_id, batch_generation,
    severity, event_type, message, content
  ) values (
    p_user_id, p_repository, p_task_id, p_batch_id, event_generation,
    p_severity, p_event_type, 'client_review', p_message
  );
end;
$$;
revoke all on function daemon_record_event(uuid, text, uuid, uuid, text, text, text) from public;
grant execute on function daemon_record_event(uuid, text, uuid, uuid, text, text, text) to anon;

create or replace function ensure_agent_task_terminal_timestamp()
returns trigger language plpgsql as $$
begin
  if new.status in ('completed', 'failed', 'blocked', 'cancelled') then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists ensure_agent_task_terminal_timestamp on agent_tasks;
create trigger ensure_agent_task_terminal_timestamp
before insert or update of status, completed_at on agent_tasks
for each row execute function ensure_agent_task_terminal_timestamp();

update agent_tasks
set completed_at = coalesce(completed_at, updated_at), updated_at = updated_at
where status in ('completed', 'failed', 'blocked', 'cancelled') and completed_at is null;
update agent_output_history
set completed_at = coalesce(completed_at, updated_at), updated_at = updated_at
where status in ('completed', 'failed', 'blocked', 'cancelled') and completed_at is null;

create or replace function project_agent_task_to_output_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into agent_output_history (
    user_id, prompt_id, task_id, conversation_id, repository, prompt, output, error, provider,
    model, reasoning, mode, source, targeted_feature_paths, status,
    status_detail, created_at, started_at, completed_at, updated_at
  ) values (
    new.user_id, new.id::text, new.id, coalesce(nullif(new.conversation_id, ''), new.id::text),
    new.repository, new.prompt, coalesce(new.result, ''), coalesce(new.error, ''), new.provider,
    new.model, new.reasoning, 'standard', 'durable_task', new.targeted_feature_paths, new.status,
    left(nullif(coalesce(new.error, ''), ''), 500), new.created_at, new.started_at,
    case when new.status in ('completed', 'failed', 'blocked', 'cancelled')
      then coalesce(new.completed_at, new.updated_at) else new.completed_at end,
    new.updated_at
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
      user_id, prompt_id, repository, base_commit, final_commit, targeted_feature_paths
    ) values (
      new.user_id, new.id::text, new.repository, new.base_commit,
      new.completed_commit, new.targeted_feature_paths
    ) on conflict (user_id, prompt_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path = public as $$
  with owner as (select auth.uid() user_id)
  select jsonb_build_object(
    'communications', coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (select purpose,content,updated_at from communications,owner where communications.user_id=owner.user_id and message='client_review' order by purpose limit 10) r),'[]'),
    'daemonPayloads', coalesce((select jsonb_agg(to_jsonb(r) order by kind) from (select kind,payload,updated_at from daemon_payloads,owner where daemon_payloads.user_id=owner.user_id and message='client_review' order by kind limit 3) r),'[]'),
    'agentTasks', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,status,queue_sequence,created_at,started_at,completed_at,error,verification_attempts,cancel_requested,retry_generation,updated_at from agent_tasks,owner where agent_tasks.user_id=owner.user_id and message='client_review' order by updated_at,id limit 50) r),'[]'),
    'orchestrationBatches', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,repository,base_commit,task_ids,integration_branch,integration_worktree_path,status,resolver_attempts,verification_output,retry_generation,created_at,completed_at,updated_at from orchestration_batches,owner where orchestration_batches.user_id=owner.user_id and message='client_review' order by updated_at,id limit 30) r),'[]'),
    'taskDeletionRequests', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,task_id,prompt_id,status,error,updated_at from agent_task_deletion_requests,owner where agent_task_deletion_requests.user_id=owner.user_id and message='client_review' order by updated_at,id limit 50) r),'[]'),
    'batchDeletionRequests', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,batch_id,status,error,updated_at from orchestration_batch_deletion_requests,owner where orchestration_batch_deletion_requests.user_id=owner.user_id and message='client_review' order by updated_at,id limit 50) r),'[]'),
    'architectureViews', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,status,changed_files,architecture_document,error,failure_details,provider,model,reasoning,requested_at,started_at,completed_at,created_at,updated_at from architecture_views,owner where architecture_views.user_id=owner.user_id and message='client_review' order by updated_at,id limit 20) r),'[]'),
    'architectureProgressEvents', coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (select id,architecture_view_id,generation,stage,stage_order,attempt,total_attempts,detail,created_at,updated_at from architecture_view_progress_events,owner where architecture_view_progress_events.user_id=owner.user_id and message='client_review' order by created_at,id limit 50) r),'[]'),
    'featureExecutionRuns', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,project_directory,feature_file_path,status,cancel_requested,command,parameter_file_path,entry_point_path,started_at,completed_at,exit_code,stdout_tail,stderr_tail,error,updated_at from feature_execution_runs,owner where feature_execution_runs.user_id=owner.user_id and message='client_review' order by updated_at,id limit 50) r),'[]'),
    'daemonEvents', coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (select id,event_type,batch_id,batch_generation,severity,content,created_at,updated_at from daemon_events,owner where daemon_events.user_id=owner.user_id and message='client_review' order by created_at,id limit 50) r),'[]'),
    'managerStatus', (select case when s.user_id is null then null else jsonb_build_object('state',s.state,'accepts_work',s.accepts_work,'manager_heartbeat_at',s.manager_heartbeat_at,'execution_process_id',s.execution_process_id,'execution_generation',s.execution_generation,'execution_started_at',s.execution_started_at,'last_successful_restart_at',s.last_successful_restart_at,'status_detail',s.status_detail,'updated_at',s.updated_at,'activeRequest',case when q.id is null then null else jsonb_build_object('id',q.id,'status',q.status,'blockers',q.blockers) end) end from owner left join daemon_manager_state s on s.user_id=owner.user_id and s.message='client_review' left join daemon_manager_requests q on q.id=s.active_request_id)
  );
$$;
revoke all on function get_client_review_inbox() from public;
grant execute on function get_client_review_inbox() to authenticated;

create or replace function acknowledge_client_reviews(receipts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare owner_id uuid:=auth.uid(); r jsonb; rid text; ok jsonb:='[]'; stale jsonb:='[]';
begin
  if owner_id is null or jsonb_typeof(receipts)<>'array' then raise exception 'Authentication required with receipt array'; end if;
  for r in select value from jsonb_array_elements(receipts) loop
    rid:=coalesce(r->>'receiptId','');
    case r->>'transport'
      when 'communications' then update communications set message='client_complete' where user_id=owner_id and purpose=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'daemonPayloads' then update daemon_payloads set message='client_complete' where user_id=owner_id and kind=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'agentTasks' then update agent_tasks set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'orchestrationBatches' then update orchestration_batches set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'taskDeletionRequests' then update agent_task_deletion_requests set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'batchDeletionRequests' then update orchestration_batch_deletion_requests set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'architectureViews' then update architecture_views set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and generation=(r->>'generation')::integer and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'architectureProgressEvents' then update architecture_view_progress_events set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and generation=(r->>'generation')::integer and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'featureExecutionRuns' then update feature_execution_runs set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'daemonEvents' then update daemon_events set message='client_complete' where user_id=owner_id and id=(r->>'key')::bigint and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      when 'managerStatus' then update daemon_manager_state set message='client_complete' where user_id=owner_id and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
      else continue;
    end case;
    if found then ok:=ok||jsonb_build_array(rid); else stale:=stale||jsonb_build_array(rid); end if;
  end loop;
  return jsonb_build_object('acknowledged',ok,'rejected',stale);
end;
$$;
revoke all on function acknowledge_client_reviews(jsonb) from public;
grant execute on function acknowledge_client_reviews(jsonb) to authenticated;
