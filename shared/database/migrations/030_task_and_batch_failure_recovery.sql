-- Task implementation and batch integration are independently recoverable.
alter table agent_tasks add column if not exists retry_generation integer not null default 0;
alter table orchestration_batches add column if not exists retry_generation integer not null default 0;

create table if not exists agent_task_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Deliberately not a foreign key: the acknowledgement must survive task deletion.
  task_id uuid not null,
  prompt_id text not null,
  expected_updated_at timestamptz not null,
  message text not null default 'daemon_review' check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  status text not null default 'requested' check (status in ('requested', 'completed', 'rejected')),
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, task_id, expected_updated_at)
);
alter table agent_task_deletion_requests enable row level security;
create policy "authenticated users can read own task deletion requests" on agent_task_deletion_requests for select to authenticated using (user_id = auth.uid());
create index if not exists agent_task_deletion_requests_daemon_review_idx on agent_task_deletion_requests (user_id, created_at, id) where message = 'daemon_review';
create index if not exists orchestration_batches_client_review_idx on orchestration_batches (user_id, updated_at, id) where message = 'client_review';

create or replace function request_agent_task_retry(p_task_id uuid, p_expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update agent_tasks set status = 'queued', message = 'daemon_review', cancel_requested = false,
    completed_at = null, retry_generation = retry_generation + 1, updated_at = now()
  where id = p_task_id and user_id = auth.uid() and updated_at = p_expected_updated_at
    and status in ('failed', 'blocked') and worktree_path is not null and branch_name is not null;
  return found;
end; $$;

create or replace function request_orchestration_batch_retry(p_batch_id uuid, p_expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update orchestration_batches set status = 'integrating', message = 'daemon_review',
    retry_generation = retry_generation + 1, completed_at = null, updated_at = now()
  where id = p_batch_id and user_id = auth.uid() and updated_at = p_expected_updated_at
    and status = 'blocked'
    and not exists (
      select 1 from jsonb_array_elements_text(orchestration_batches.task_ids) member(id)
      left join agent_tasks task on task.id = member.id::uuid
      where task.id is null or task.user_id <> auth.uid() or task.branch_name is null
        or task.status not in ('ready', 'integrating', 'completed')
    );
  return found;
end; $$;

create or replace function request_finalized_task_deletion(p_task_id uuid, p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare request_id uuid;
begin
  insert into agent_task_deletion_requests (user_id, task_id, prompt_id, expected_updated_at)
  select auth.uid(), task.id, task.id::text, p_expected_updated_at from agent_tasks task
  where task.id = p_task_id and task.user_id = auth.uid() and task.updated_at = p_expected_updated_at
    and task.status in ('completed', 'failed', 'blocked', 'cancelled')
  on conflict (user_id, task_id, expected_updated_at) do update set message = 'daemon_review', status = 'requested', error = '', updated_at = now()
  returning id into request_id;
  if request_id is null then raise exception 'Task is no longer eligible for deletion'; end if;
  return request_id;
end; $$;

create or replace function daemon_list_task_deletion_requests(p_user_id uuid)
returns setof agent_task_deletion_requests language sql security definer set search_path = public as $$
  select * from agent_task_deletion_requests where user_id = p_user_id and message = 'daemon_review' order by created_at, id limit 50;
$$;

create or replace function daemon_complete_task_deletion(p_user_id uuid, p_request_id uuid, p_error text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare request_row agent_task_deletion_requests%rowtype;
begin
  select * into request_row from agent_task_deletion_requests where id = p_request_id and user_id = p_user_id and message = 'daemon_review' for update;
  if not found then return false; end if;
  if p_error <> '' then
    update agent_task_deletion_requests set status='rejected', error=p_error, message='client_review', updated_at=now() where id=p_request_id;
    return true;
  end if;
  delete from agent_tasks where id=request_row.task_id and user_id=p_user_id and updated_at=request_row.expected_updated_at and status in ('completed','failed','blocked','cancelled');
  if not found then
    update agent_task_deletion_requests set status='rejected', error='Task changed before deletion could be completed.', message='client_review', updated_at=now() where id=p_request_id;
    return true;
  end if;
  delete from agent_output_history where user_id=p_user_id and prompt_id=request_row.prompt_id;
  update agent_task_deletion_requests set status='completed', message='client_review', updated_at=now() where id=p_request_id;
  return true;
end; $$;

create or replace function daemon_delete_orchestration_batch(p_user_id uuid, p_batch_id uuid)
returns boolean language sql security definer set search_path=public as $$
  with deleted as (delete from orchestration_batches where id=p_batch_id and user_id=p_user_id and status='completed' returning id)
  select exists(select 1 from deleted);
$$;

create or replace function daemon_list_agent_tasks(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path = public as $$
  select task.* from agent_tasks task where task.user_id = p_user_id and (
    task.message = 'daemon_review' or exists (
      select 1 from orchestration_batches batch
      where batch.user_id=p_user_id and batch.message='daemon_review'
        and batch.task_ids ? task.id::text
    )
  ) order by task.queue_sequence limit 100;
$$;

create or replace function daemon_upsert_orchestration_batch(p_user_id uuid, p_batch jsonb)
returns void language sql security definer set search_path = public as $$
  insert into orchestration_batches (id,user_id,repository,base_commit,task_ids,integration_branch,integration_worktree_path,status,message,resolver_attempts,verification_output,quiet_since,completed_at,retry_generation)
  values ((p_batch->>'id')::uuid,p_user_id,p_batch->>'repository',p_batch->>'base_commit',coalesce(p_batch->'task_ids','[]'::jsonb),p_batch->>'integration_branch',coalesce(p_batch->>'integration_worktree_path',''),coalesce(p_batch->>'status','collecting'),case when p_batch->>'status'='blocked' then 'client_review' when p_batch->>'status'='completed' then 'daemon_complete' else 'daemon_review' end,coalesce((p_batch->>'resolver_attempts')::integer,0),coalesce(p_batch->>'verification_output',''),(p_batch->>'quiet_since')::timestamptz,(p_batch->>'completed_at')::timestamptz,coalesce((p_batch->>'retry_generation')::integer,0))
  on conflict (id) do update set integration_worktree_path=excluded.integration_worktree_path,status=excluded.status,message=excluded.message,resolver_attempts=excluded.resolver_attempts,verification_output=excluded.verification_output,quiet_since=excluded.quiet_since,completed_at=excluded.completed_at,retry_generation=excluded.retry_generation,updated_at=now();
$$;

create or replace function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path=public as $$
  with owner as (select auth.uid() user_id)
  select jsonb_build_object(
    'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (select purpose,content,updated_at from communications,owner where communications.user_id=owner.user_id and communications.message='client_review' order by purpose limit 10) r),'[]'),
    'daemonPayloads',coalesce((select jsonb_agg(to_jsonb(r) order by kind) from (select kind,payload,updated_at from daemon_payloads,owner where daemon_payloads.user_id=owner.user_id and daemon_payloads.message='client_review' order by kind limit 3) r),'[]'),
    'agentTasks',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,status,queue_sequence,created_at,started_at,completed_at,error,verification_attempts,cancel_requested,retry_generation,updated_at from agent_tasks,owner where agent_tasks.user_id=owner.user_id and agent_tasks.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'orchestrationBatches',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,repository,base_commit,task_ids,integration_branch,integration_worktree_path,status,resolver_attempts,verification_output,retry_generation,created_at,completed_at,updated_at from orchestration_batches,owner where orchestration_batches.user_id=owner.user_id and orchestration_batches.message='client_review' order by updated_at,id limit 30) r),'[]'),
    'taskDeletionRequests',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,task_id,prompt_id,status,error,updated_at from agent_task_deletion_requests,owner where agent_task_deletion_requests.user_id=owner.user_id and agent_task_deletion_requests.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'architectureViews',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,status,changed_files,architecture_document,error,provider,model,reasoning,requested_at,started_at,completed_at,updated_at from architecture_views,owner where architecture_views.user_id=owner.user_id and architecture_views.message='client_review' order by updated_at,id limit 20) r),'[]'),
    'featureExecutionRuns',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,project_directory,feature_file_path,status,cancel_requested,command,parameter_file_path,entry_point_path,started_at,completed_at,exit_code,stdout_tail,stderr_tail,error,updated_at from feature_execution_runs,owner where feature_execution_runs.user_id=owner.user_id and feature_execution_runs.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'daemonEvents',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (select id,severity,content,created_at from daemon_events,owner where daemon_events.user_id=owner.user_id and daemon_events.message='client_review' order by created_at,id limit 50) r),'[]'),
    'managerStatus',(select case when s.user_id is null then null else jsonb_build_object('state',s.state,'accepts_work',s.accepts_work,'manager_heartbeat_at',s.manager_heartbeat_at,'execution_process_id',s.execution_process_id,'execution_generation',s.execution_generation,'execution_started_at',s.execution_started_at,'last_successful_restart_at',s.last_successful_restart_at,'status_detail',s.status_detail,'updated_at',s.updated_at,'activeRequest',case when q.id is null then null else jsonb_build_object('id',q.id,'status',q.status,'blockers',q.blockers) end) end from owner left join daemon_manager_state s on s.user_id=owner.user_id and s.message='client_review' left join daemon_manager_requests q on q.id=s.active_request_id)
  );
$$;

create or replace function acknowledge_client_reviews(receipts jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); r jsonb; rid text; ok jsonb:='[]'; stale jsonb:='[]';
begin
 if owner_id is null or jsonb_typeof(receipts)<>'array' then raise exception 'Authentication required with receipt array'; end if;
 for r in select value from jsonb_array_elements(receipts) loop rid:=coalesce(r->>'receiptId','');
  case r->>'transport'
  when 'communications' then update communications set message='client_complete' where user_id=owner_id and purpose=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
  when 'daemonPayloads' then update daemon_payloads set message='client_complete' where user_id=owner_id and kind=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
  when 'agentTasks' then update agent_tasks set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
  when 'orchestrationBatches' then update orchestration_batches set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
  when 'taskDeletionRequests' then update agent_task_deletion_requests set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
  when 'architectureViews' then update architecture_views set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz and generation=(r->>'generation')::integer;
  when 'featureExecutionRuns' then update feature_execution_runs set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
  when 'daemonEvents' then update daemon_events set message='client_complete' where user_id=owner_id and id=(r->>'key')::bigint and message='client_review';
  when 'managerStatus' then update daemon_manager_state set message='client_complete' where user_id=owner_id and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
  else continue;
  end case;
  if found then ok:=ok||jsonb_build_array(rid); else stale:=stale||jsonb_build_array(rid); end if;
 end loop; return jsonb_build_object('acknowledged',ok,'rejected',stale);
end; $$;

grant execute on function request_agent_task_retry(uuid,timestamptz), request_orchestration_batch_retry(uuid,timestamptz), request_finalized_task_deletion(uuid,timestamptz) to authenticated;
grant execute on function daemon_list_task_deletion_requests(uuid), daemon_complete_task_deletion(uuid,uuid,text) to anon;
grant execute on function daemon_delete_orchestration_batch(uuid,uuid) to anon;
