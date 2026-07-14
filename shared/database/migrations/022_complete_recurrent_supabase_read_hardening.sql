-- Apply the four-state review protocol to the remaining recurrent control rows
-- and add generation-aware indexes for bounded client review queries.

alter table daemon_manager_requests add column message text not null default 'daemon_complete'
check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete'));
alter table daemon_manager_state add column message text not null default 'client_complete'
check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete'));

update daemon_manager_requests
set message = case
  when status in ('requested', 'draining', 'restarting') then 'daemon_review'
  else 'daemon_complete'
end;

update daemon_manager_state set message = 'client_review';

update agent_tasks set message = 'daemon_review'
where status in ('queued', 'running', 'verifying', 'ready', 'integrating', 'resolving')
  and message <> 'daemon_review';
update agent_tasks set message = 'client_complete'
where status in ('completed', 'failed', 'blocked', 'cancelled') and message = 'daemon_review';
update feature_execution_runs set message = 'daemon_review'
where status in ('queued', 'running') and message <> 'daemon_review';
update feature_execution_runs set message = 'client_complete'
where status in ('completed', 'failed', 'cancelled') and message = 'daemon_review';
update orchestration_batches set message = 'daemon_complete'
where status in ('completed', 'blocked') and message = 'daemon_review';

create index agent_tasks_client_review_idx
on agent_tasks (user_id, updated_at, id) where message = 'client_review';
create index feature_execution_runs_client_review_idx
on feature_execution_runs (user_id, updated_at, id) where message = 'client_review';
create index feature_execution_runs_daemon_review_idx
on feature_execution_runs (user_id, status, created_at) where message = 'daemon_review';
create index daemon_manager_requests_review_idx
on daemon_manager_requests (user_id, updated_at, id) where message = 'daemon_review';
create index daemon_manager_state_review_idx
on daemon_manager_state (user_id, updated_at) where message = 'client_review';

create function mark_daemon_manager_state_for_client_review()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.message = 'client_review' and new.message = 'client_complete' then
    return new;
  end if;
  new.message = 'client_review';
  return new;
end;
$$;
create trigger mark_daemon_manager_state_review
before insert or update on daemon_manager_state
for each row execute function mark_daemon_manager_state_for_client_review();

create or replace function daemon_list_communication_reviews(p_user_id uuid)
returns table(purpose text, content text, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select communications.purpose, communications.content, communications.updated_at
  from communications
  where communications.user_id = p_user_id and communications.message = 'daemon_review'
    and communications.purpose in ('agent_prompt', 'git_sync_request', 'feature_file_load', 'parameter_file_load', 'parameter_file_update', 'entry_point_update')
  order by communications.purpose;
$$;
grant execute on function daemon_list_communication_reviews(uuid) to anon;

create policy "authenticated users can acknowledge own manager state"
on daemon_manager_state for update to authenticated
using (user_id = auth.uid() and message = 'client_review')
with check (user_id = auth.uid() and message = 'client_complete');
grant update (message) on daemon_manager_state to authenticated;

create or replace function daemon_list_active_feature_execution_runs(p_user_id uuid)
returns setof feature_execution_runs language sql security definer set search_path = public as $$
  select * from feature_execution_runs
  where user_id = p_user_id and message = 'daemon_review'
    and status in ('queued', 'running')
  order by created_at limit 100;
$$;

create or replace function daemon_list_agent_tasks(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path = public as $$
  select * from agent_tasks where user_id = p_user_id and message = 'daemon_review'
  order by queue_sequence limit 100;
$$;

create or replace function daemon_list_orchestration_batches(p_user_id uuid)
returns setof orchestration_batches language sql security definer set search_path = public as $$
  select * from orchestration_batches where user_id = p_user_id and message = 'daemon_review'
  order by created_at limit 100;
$$;

create or replace function request_execution_restart()
returns jsonb language plpgsql security definer set search_path = public as $$
declare owner_id uuid := auth.uid(); restart_request daemon_manager_requests;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into restart_request from daemon_manager_requests
  where user_id = owner_id and status in ('requested', 'draining', 'restarting')
  order by requested_at limit 1 for update;
  if not found then
    insert into daemon_manager_requests (user_id, message)
    values (owner_id, 'daemon_review') returning * into restart_request;
  else
    update daemon_manager_requests set message = 'daemon_review', updated_at = now()
    where id = restart_request.id returning * into restart_request;
  end if;
  insert into daemon_manager_state (user_id, state, accepts_work, active_request_id, status_detail, message)
  values (owner_id, 'draining', false, restart_request.id, 'Restart requested; waiting for accepted work.', 'client_review')
  on conflict (user_id) do update set
    state = case when daemon_manager_state.state = 'restarting' then 'restarting' else 'draining' end,
    accepts_work = false, active_request_id = restart_request.id, message = 'client_review',
    status_detail = case when daemon_manager_state.state = 'restarting' then daemon_manager_state.status_detail else 'Restart requested; waiting for accepted work.' end,
    updated_at = now();
  return to_jsonb(restart_request);
end;
$$;

create or replace function cancel_execution_restart(request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cancelled_request daemon_manager_requests;
begin
  update daemon_manager_requests set status = 'cancelled', message = 'daemon_review', completed_at = now(), updated_at = now()
  where id = request_id and user_id = auth.uid() and status in ('requested', 'draining') returning * into cancelled_request;
  if not found then raise exception 'Restart can no longer be cancelled'; end if;
  update daemon_manager_state set state = 'running', accepts_work = true,
    status_detail = 'Restart cancelled.', message = 'client_review', updated_at = now()
  where user_id = auth.uid() and active_request_id = request_id and state = 'draining';
  if not found then raise exception 'Restart replacement has already begun'; end if;
  return to_jsonb(cancelled_request);
end;
$$;

create or replace function daemon_manager_complete_control_request(p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid, p_expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_requests manager_request
  set message = 'daemon_complete', updated_at = now()
  from daemon_manager_state manager_state
  where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status = 'cancelled' and manager_request.message = 'daemon_review'
    and manager_request.updated_at = p_expected_updated_at
    and manager_state.user_id = p_user_id and manager_state.manager_instance_id = p_manager_instance_id
    and manager_state.active_request_id = p_request_id;
  if not found then return false; end if;
  update daemon_manager_state set active_request_id = null, message = 'client_review', updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id and active_request_id = p_request_id;
  return found;
end;
$$;
revoke all on function daemon_manager_complete_control_request(uuid, uuid, uuid, timestamptz) from public;
grant execute on function daemon_manager_complete_control_request(uuid, uuid, uuid, timestamptz) to anon;

create or replace function get_daemon_manager_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when manager_state.user_id is null then null else jsonb_build_object(
    'state', manager_state.state, 'accepts_work', manager_state.accepts_work,
    'manager_heartbeat_at', manager_state.manager_heartbeat_at,
    'execution_process_id', manager_state.execution_process_id,
    'execution_generation', manager_state.execution_generation,
    'execution_started_at', manager_state.execution_started_at,
    'last_successful_restart_at', manager_state.last_successful_restart_at,
    'status_detail', manager_state.status_detail, 'updated_at', manager_state.updated_at,
    'activeRequest', case when manager_request.id is null then null else jsonb_build_object(
      'id', manager_request.id, 'status', manager_request.status, 'blockers', manager_request.blockers) end) end
  from (select auth.uid() user_id) owner
  left join daemon_manager_state manager_state
    on manager_state.user_id = owner.user_id and manager_state.message = 'client_review'
  left join daemon_manager_requests manager_request on manager_request.id = manager_state.active_request_id;
$$;

create or replace function daemon_manager_publish_heartbeat(p_user_id uuid, p_manager_instance_id uuid, p_execution_process_id integer, p_execution_started_at timestamptz, p_status_detail text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_state set manager_heartbeat_at = now(), execution_process_id = p_execution_process_id,
    execution_started_at = p_execution_started_at, status_detail = coalesce(p_status_detail, status_detail),
    message = 'client_review', updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id;
  return found;
end;
$$;

create or replace function daemon_manager_get_active_request(p_user_id uuid, p_manager_instance_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select case when manager_request.id is null then null else jsonb_build_object(
    'id', manager_request.id, 'status', manager_request.status,
    'updated_at', manager_request.updated_at) end
  from daemon_manager_state manager_state
  left join daemon_manager_requests manager_request
    on manager_request.id = manager_state.active_request_id and manager_request.message = 'daemon_review'
  where manager_state.user_id = p_user_id and manager_state.manager_instance_id = p_manager_instance_id;
$$;

create or replace function daemon_manager_get_drain_summary(p_user_id uuid, p_manager_instance_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists (select 1 from daemon_manager_state where user_id = p_user_id and manager_instance_id = p_manager_instance_id)
    then raise exception 'Manager lease is not owned'; end if;
  select jsonb_build_object('total', agent_count + batch_count + feature_count + communication_count,
    'agentTasks', agent_count, 'orchestrationBatches', batch_count, 'featureExecutions', feature_count,
    'communications', communication_counts,
    'identifiers', jsonb_build_object(
      'agentTasks', coalesce((select jsonb_agg(id order by queue_sequence) from (select id, queue_sequence from agent_tasks where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running','verifying','ready','integrating','resolving') order by queue_sequence limit 100) task_rows), '[]'::jsonb),
      'orchestrationBatches', coalesce((select jsonb_agg(id order by created_at) from (select id, created_at from orchestration_batches where user_id = p_user_id and message = 'daemon_review' and status in ('collecting','integrating','resolving') order by created_at limit 100) batch_rows), '[]'::jsonb),
      'featureExecutions', coalesce((select jsonb_agg(id order by created_at) from (select id, created_at from feature_execution_runs where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running') order by created_at limit 100) run_rows), '[]'::jsonb),
      'communications', coalesce((select jsonb_agg(jsonb_build_object('purpose', purpose, 'updatedAt', updated_at) order by purpose) from communications where user_id = p_user_id and message = 'daemon_review' and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')), '[]'::jsonb)
    )) into result
  from (select
    (select count(*) from agent_tasks where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running','verifying','ready','integrating','resolving')) agent_count,
    (select count(*) from orchestration_batches where user_id = p_user_id and message = 'daemon_review' and status in ('collecting','integrating','resolving')) batch_count,
    (select count(*) from feature_execution_runs where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running')) feature_count,
    (select count(*) from communications where user_id = p_user_id and message = 'daemon_review' and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')) communication_count,
    coalesce((select jsonb_object_agg(purpose, purpose_count) from (
      select purpose, count(*) purpose_count from communications where user_id = p_user_id and message = 'daemon_review'
      and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update') group by purpose
    ) groups), '{}'::jsonb) communication_counts) counts;
  return result;
end;
$$;

create or replace function daemon_manager_complete_restart(p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_requests manager_request set status = 'completed', message = 'daemon_complete', completed_at = now(), failure_detail = null, updated_at = now()
  from daemon_manager_state manager_state where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status = 'restarting' and manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id and manager_state.active_request_id = p_request_id;
  if not found then return false; end if;
  update daemon_manager_state set state = 'running', accepts_work = true, active_request_id = null,
    execution_generation = execution_generation + 1, last_successful_restart_at = now(),
    status_detail = 'Execution restart completed.', message = 'client_review', manager_heartbeat_at = now(), updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id and active_request_id = p_request_id;
  return found;
end;
$$;
