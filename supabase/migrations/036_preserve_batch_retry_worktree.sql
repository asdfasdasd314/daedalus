-- A manual retry resumes one retained integration workspace; it must never be
-- mistaken for a new batch with an empty retry generation.
create or replace function request_orchestration_batch_retry(p_batch_id uuid, p_expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update orchestration_batches set status = 'integrating', message = 'daemon_review',
    retry_generation = retry_generation + 1, resolver_attempts = 0, verification_output = '',
    completed_at = null, updated_at = now()
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

-- The existing daemon review snapshot carries the retry generation so the
-- daemon can distinguish a retained manual retry from a first integration.
create or replace function daemon_poll_work(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare claimed_id uuid;result jsonb;begin
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id)then raise exception 'Invalid daemon user scope';end if;
 select id into claimed_id from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status='queued' and not cancel_requested order by created_at,id for update skip locked limit 1;
 if claimed_id is not null then update feature_execution_runs set status='running',started_at=now(),updated_at=now() where id=claimed_id;end if;
 select jsonb_build_object(
 'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose)from(select purpose,content,updated_at from communications where user_id=p_user_id and message='daemon_review' and purpose in('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')order by purpose limit 6)r),'[]'),
 'agentTasks',coalesce((select jsonb_agg(to_jsonb(task) order by task.queue_sequence) from daemon_list_agent_tasks(p_user_id) task),'[]'),
 'orchestrationBatches',coalesce((select jsonb_agg(to_jsonb(r)order by created_at)from(select id,repository,base_commit,task_ids,integration_branch,integration_worktree_path,status,message,resolver_attempts,verification_output,retry_generation,quiet_since,created_at,completed_at,updated_at from orchestration_batches where user_id=p_user_id and message='daemon_review' order by created_at limit 100)r),'[]'),
 'architectureViews',coalesce((select jsonb_agg(to_jsonb(r)order by requested_at,id)from(select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,status,requested_at,updated_at from architecture_views where user_id=p_user_id and message='daemon_review' and status in('queued','running')order by requested_at,id limit 10)r),'[]'),
 'featureRunControls',coalesce((select jsonb_agg(to_jsonb(r)order by created_at,id)from(select id,status,cancel_requested,created_at from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status in('queued','running')and id is distinct from claimed_id order by created_at,id limit 100)r),'[]'),
 'claimedFeatureRun',(select case when r.id is null then null else to_jsonb(r)end from(select id,project_directory,feature_file_path,status,cancel_requested from feature_execution_runs where id=claimed_id)r))into result;return result;
end; $$;

grant execute on function request_orchestration_batch_retry(uuid, timestamptz) to authenticated;
grant execute on function daemon_poll_work(uuid) to anon;
