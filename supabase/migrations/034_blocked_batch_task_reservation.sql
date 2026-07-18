-- A blocked integration remains the sole owner of its member tasks until the
-- user retries or deletes that same batch. Without this guard, ready task rows
-- can be collected into a second batch while the original batch is visible to
-- the client for recovery.
create or replace function daemon_list_agent_tasks(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path = public as $$
  select task.* from agent_tasks task
  where task.user_id = p_user_id and (
    task.message = 'daemon_review' or exists (
      select 1 from orchestration_batches batch
      where batch.user_id = p_user_id and batch.message = 'daemon_review'
        and batch.task_ids ? task.id::text
    )
  )
  and not exists (
    select 1 from orchestration_batches blocked_batch
    where blocked_batch.user_id = p_user_id and blocked_batch.status = 'blocked'
      and blocked_batch.task_ids ? task.id::text
  )
  order by task.queue_sequence limit 100;
$$;

create or replace function daemon_poll_work(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare claimed_id uuid;result jsonb;begin
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id)then raise exception 'Invalid daemon user scope';end if;
 select id into claimed_id from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status='queued' and not cancel_requested order by created_at,id for update skip locked limit 1;
 if claimed_id is not null then update feature_execution_runs set status='running',started_at=now(),updated_at=now() where id=claimed_id;end if;
 select jsonb_build_object(
 'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose)from(select purpose,content,updated_at from communications where user_id=p_user_id and message='daemon_review' and purpose in('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')order by purpose limit 6)r),'[]'),
 'agentTasks',coalesce((select jsonb_agg(to_jsonb(task) order by task.queue_sequence) from daemon_list_agent_tasks(p_user_id) task),'[]'),
 'orchestrationBatches',coalesce((select jsonb_agg(to_jsonb(r)order by created_at)from(select id,repository,base_commit,task_ids,integration_branch,integration_worktree_path,status,message,resolver_attempts,quiet_since,created_at,completed_at,updated_at from orchestration_batches where user_id=p_user_id and message='daemon_review' order by created_at limit 100)r),'[]'),
 'architectureViews',coalesce((select jsonb_agg(to_jsonb(r)order by requested_at,id)from(select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,status,requested_at,updated_at from architecture_views where user_id=p_user_id and message='daemon_review' and status in('queued','running')order by requested_at,id limit 100)r),'[]'),
 'featureRunControls',coalesce((select jsonb_agg(to_jsonb(r)order by created_at,id)from(select id,status,cancel_requested,created_at from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status in('queued','running')and id is distinct from claimed_id order by created_at,id limit 100)r),'[]'),
 'claimedFeatureRun',(select case when r.id is null then null else to_jsonb(r)end from(select id,project_directory,feature_file_path,status,cancel_requested from feature_execution_runs where id=claimed_id)r))into result;return result;
end; $$;

grant execute on function daemon_list_agent_tasks(uuid), daemon_poll_work(uuid) to anon;
