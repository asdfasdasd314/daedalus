create table daemon_manager_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'running' check (state in ('running', 'draining', 'restarting', 'degraded')),
  accepts_work boolean not null default true,
  active_request_id uuid,
  manager_instance_id uuid,
  manager_heartbeat_at timestamptz,
  execution_process_id integer,
  execution_generation bigint not null default 0 check (execution_generation >= 0),
  execution_started_at timestamptz,
  last_successful_restart_at timestamptz,
  status_detail text,
  updated_at timestamptz not null default now()
);

create table daemon_manager_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null default 'restart_execution' check (action = 'restart_execution'),
  status text not null default 'requested' check (status in ('requested', 'draining', 'restarting', 'completed', 'failed', 'cancelled')),
  blockers jsonb not null default '{"total":0,"agentTasks":0,"orchestrationBatches":0,"featureExecutions":0,"communications":{}}'::jsonb,
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  restart_started_at timestamptz,
  completed_at timestamptz,
  failure_detail text,
  updated_at timestamptz not null default now()
);

alter table daemon_manager_state
  add constraint daemon_manager_state_active_request_fkey
  foreign key (active_request_id) references daemon_manager_requests(id) on delete set null;

create unique index daemon_manager_one_active_request_idx
on daemon_manager_requests (user_id)
where status in ('requested', 'draining', 'restarting');

create index daemon_manager_requests_history_idx
on daemon_manager_requests (user_id, requested_at desc);

alter table daemon_manager_state enable row level security;
alter table daemon_manager_requests enable row level security;

revoke all on daemon_manager_state from anon, authenticated;
revoke all on daemon_manager_requests from anon, authenticated;
grant select on daemon_manager_state to authenticated;
grant select on daemon_manager_requests to authenticated;

create policy "authenticated users can read own manager state"
on daemon_manager_state for select to authenticated
using (user_id = auth.uid());

create policy "authenticated users can read own manager requests"
on daemon_manager_requests for select to authenticated
using (user_id = auth.uid());

create or replace function daemon_accepts_work(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select accepts_work from daemon_manager_state where user_id = p_user_id),
    true
  );
$$;

revoke all on function daemon_accepts_work(uuid) from public;
grant execute on function daemon_accepts_work(uuid) to authenticated, anon;

drop policy if exists "authenticated users can insert own agent tasks" on agent_tasks;
create policy "authenticated users can insert own agent tasks"
on agent_tasks for insert to authenticated
with check (
  user_id = auth.uid() and status = 'queued' and message = 'daemon_review'
  and daemon_accepts_work(auth.uid())
);

drop policy if exists "authenticated users can insert own feature runs" on feature_execution_runs;
create policy "authenticated users can insert own feature runs"
on feature_execution_runs for insert to authenticated
with check (
  user_id = auth.uid() and status = 'queued' and message = 'daemon_review'
  and cancel_requested = false and command = '[]'::jsonb and parameter_file_path = ''
  and daemon_accepts_work(auth.uid())
);

drop policy if exists "authenticated users can insert own communications" on communications;
create policy "authenticated users can insert own communications"
on communications for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    message <> 'daemon_review'
    or purpose not in (
      'agent_prompt', 'git_sync_request', 'feature_file_load',
      'parameter_file_load', 'parameter_file_update', 'entry_point_update'
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
      'agent_prompt', 'git_sync_request', 'feature_file_load',
      'parameter_file_load', 'parameter_file_update', 'entry_point_update'
    )
    or daemon_accepts_work(auth.uid())
  )
);

create or replace function request_execution_restart()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid := auth.uid();
  restart_request daemon_manager_requests;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));

  select * into restart_request from daemon_manager_requests
  where user_id = owner_id and status in ('requested', 'draining', 'restarting')
  order by requested_at limit 1 for update;

  if not found then
    insert into daemon_manager_requests (user_id)
    values (owner_id) returning * into restart_request;
  end if;

  insert into daemon_manager_state (
    user_id, state, accepts_work, active_request_id, status_detail
  ) values (
    owner_id, 'draining', false, restart_request.id, 'Restart requested; waiting for accepted work.'
  ) on conflict (user_id) do update set
    state = case when daemon_manager_state.state = 'restarting' then 'restarting' else 'draining' end,
    accepts_work = false,
    active_request_id = restart_request.id,
    status_detail = case when daemon_manager_state.state = 'restarting'
      then daemon_manager_state.status_detail else 'Restart requested; waiting for accepted work.' end,
    updated_at = now();

  return to_jsonb(restart_request);
end;
$$;

create or replace function cancel_execution_restart(request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cancelled_request daemon_manager_requests;
begin
  update daemon_manager_requests set
    status = 'cancelled', completed_at = now(), updated_at = now()
  where id = request_id and user_id = auth.uid() and status in ('requested', 'draining')
  returning * into cancelled_request;

  if not found then raise exception 'Restart can no longer be cancelled'; end if;

  update daemon_manager_state set
    state = 'running', accepts_work = true, active_request_id = null,
    status_detail = 'Restart cancelled.', updated_at = now()
  where user_id = auth.uid() and active_request_id = request_id
    and state = 'draining';

  if not found then raise exception 'Restart replacement has already begun'; end if;
  return to_jsonb(cancelled_request);
end;
$$;

create or replace function get_daemon_manager_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when manager_state.user_id is null then null else
    to_jsonb(manager_state) || jsonb_build_object(
      'activeRequest', case when manager_request.id is null then null else to_jsonb(manager_request) end
    ) end
  from (select auth.uid() as user_id) owner
  left join daemon_manager_state manager_state on manager_state.user_id = owner.user_id
  left join daemon_manager_requests manager_request on manager_request.id = manager_state.active_request_id;
$$;

create or replace function daemon_manager_acquire_lease(
  p_user_id uuid, p_manager_instance_id uuid, p_stale_after_seconds integer
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into daemon_manager_state (
    user_id, manager_instance_id, manager_heartbeat_at, status_detail
  ) values (
    p_user_id, p_manager_instance_id, now(), 'Manager connected.'
  ) on conflict (user_id) do update set
    manager_instance_id = excluded.manager_instance_id,
    manager_heartbeat_at = now(), updated_at = now()
  where daemon_manager_state.manager_instance_id = p_manager_instance_id
    or daemon_manager_state.manager_instance_id is null
    or daemon_manager_state.manager_heartbeat_at is null
    or daemon_manager_state.manager_heartbeat_at < now() - make_interval(secs => greatest(p_stale_after_seconds, 1));
  return found;
end;
$$;

create or replace function daemon_manager_publish_heartbeat(
  p_user_id uuid, p_manager_instance_id uuid, p_execution_process_id integer,
  p_execution_started_at timestamptz, p_status_detail text default null
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_state set
    manager_heartbeat_at = now(), execution_process_id = p_execution_process_id,
    execution_started_at = p_execution_started_at,
    status_detail = coalesce(p_status_detail, status_detail), updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id;
  return found;
end;
$$;

create or replace function daemon_manager_get_active_request(
  p_user_id uuid, p_manager_instance_id uuid
) returns jsonb language sql security definer set search_path = public as $$
  select case when manager_request.id is null then null else to_jsonb(manager_request) end
  from daemon_manager_state manager_state
  left join daemon_manager_requests manager_request on manager_request.id = manager_state.active_request_id
  where manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id;
$$;

create or replace function daemon_manager_claim_restart(
  p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_requests manager_request set
    status = 'draining', claimed_at = coalesce(claimed_at, now()), updated_at = now()
  from daemon_manager_state manager_state
  where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status in ('requested', 'draining')
    and manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id
    and manager_state.active_request_id = p_request_id;
  return found;
end;
$$;

create or replace function daemon_manager_get_drain_summary(
  p_user_id uuid, p_manager_instance_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists (
    select 1 from daemon_manager_state where user_id = p_user_id
      and manager_instance_id = p_manager_instance_id
  ) then raise exception 'Manager lease is not owned'; end if;

  select jsonb_build_object(
    'total', agent_count + batch_count + feature_count + communication_count,
    'agentTasks', agent_count,
    'orchestrationBatches', batch_count,
    'featureExecutions', feature_count,
    'communications', communication_counts,
    'identifiers', jsonb_build_object(
      'agentTasks', coalesce((select jsonb_agg(id order by queue_sequence) from agent_tasks where user_id = p_user_id and status in ('queued','running','verifying','ready','integrating','resolving')), '[]'::jsonb),
      'orchestrationBatches', coalesce((select jsonb_agg(id order by created_at) from orchestration_batches where user_id = p_user_id and status in ('collecting','integrating','resolving')), '[]'::jsonb),
      'featureExecutions', coalesce((select jsonb_agg(id order by created_at) from feature_execution_runs where user_id = p_user_id and status in ('queued','running')), '[]'::jsonb),
      'communications', coalesce((select jsonb_agg(jsonb_build_object('purpose', purpose, 'updatedAt', updated_at) order by purpose) from communications where user_id = p_user_id and message = 'daemon_review' and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')), '[]'::jsonb)
    )
  ) into result
  from (
    select
      (select count(*) from agent_tasks where user_id = p_user_id and status in ('queued','running','verifying','ready','integrating','resolving')) agent_count,
      (select count(*) from orchestration_batches where user_id = p_user_id and status in ('collecting','integrating','resolving')) batch_count,
      (select count(*) from feature_execution_runs where user_id = p_user_id and status in ('queued','running')) feature_count,
      (select count(*) from communications where user_id = p_user_id and message = 'daemon_review' and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')) communication_count,
      coalesce((select jsonb_object_agg(purpose, purpose_count) from (
        select purpose, count(*) purpose_count from communications
        where user_id = p_user_id and message = 'daemon_review'
          and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')
        group by purpose
      ) communication_groups), '{}'::jsonb) communication_counts
  ) counts;
  return result;
end;
$$;

create or replace function daemon_manager_update_blockers(
  p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid, p_blockers jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_requests manager_request set blockers = p_blockers, updated_at = now()
  from daemon_manager_state manager_state
  where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status = 'draining'
    and manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id
    and manager_state.active_request_id = p_request_id;
  return found;
end;
$$;

create or replace function daemon_manager_begin_restart(
  p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid
) returns boolean language plpgsql security definer set search_path = public as $$
declare blockers jsonb;
begin
  blockers := daemon_manager_get_drain_summary(p_user_id, p_manager_instance_id);
  if (blockers->>'total')::integer <> 0 then return false; end if;

  update daemon_manager_requests manager_request set
    status = 'restarting', blockers = blockers, restart_started_at = now(), updated_at = now()
  from daemon_manager_state manager_state
  where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status = 'draining'
    and manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id
    and manager_state.active_request_id = p_request_id
    and manager_state.state = 'draining';
  if not found then return false; end if;

  update daemon_manager_state set state = 'restarting', accepts_work = false,
    status_detail = 'Replacing execution process.', updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id
    and active_request_id = p_request_id;
  return found;
end;
$$;

create or replace function daemon_manager_publish_degraded(
  p_user_id uuid, p_manager_instance_id uuid, p_status_detail text
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_state set state = 'degraded', accepts_work = false,
    execution_process_id = null, execution_started_at = null,
    status_detail = left(p_status_detail, 1000), manager_heartbeat_at = now(), updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id;
  return found;
end;
$$;

create or replace function daemon_manager_publish_candidate(
  p_user_id uuid, p_manager_instance_id uuid, p_execution_process_id integer,
  p_execution_started_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_state set execution_process_id = p_execution_process_id,
    execution_started_at = p_execution_started_at,
    status_detail = 'Checking replacement stability.', manager_heartbeat_at = now(), updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id;
  return found;
end;
$$;

create or replace function daemon_manager_complete_recovery(
  p_user_id uuid, p_manager_instance_id uuid
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_state set
    state = case when active_request_id is null then 'running' else 'draining' end,
    accepts_work = active_request_id is null,
    execution_generation = execution_generation + 1,
    last_successful_restart_at = now(), status_detail = 'Execution process is stable.',
    manager_heartbeat_at = now(), updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id;
  return found;
end;
$$;

create or replace function daemon_manager_complete_restart(
  p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_requests manager_request set
    status = 'completed', completed_at = now(), failure_detail = null, updated_at = now()
  from daemon_manager_state manager_state
  where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status = 'restarting'
    and manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id
    and manager_state.active_request_id = p_request_id;
  if not found then return false; end if;

  update daemon_manager_state set state = 'running', accepts_work = true,
    active_request_id = null, execution_generation = execution_generation + 1,
    last_successful_restart_at = now(), status_detail = 'Execution restart completed.',
    manager_heartbeat_at = now(), updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id
    and active_request_id = p_request_id;
  return found;
end;
$$;

revoke all on function request_execution_restart() from public;
revoke all on function cancel_execution_restart(uuid) from public;
revoke all on function get_daemon_manager_status() from public;
grant execute on function request_execution_restart() to authenticated;
grant execute on function cancel_execution_restart(uuid) to authenticated;
grant execute on function get_daemon_manager_status() to authenticated;

revoke all on function daemon_manager_acquire_lease(uuid, uuid, integer) from public;
revoke all on function daemon_manager_publish_heartbeat(uuid, uuid, integer, timestamptz, text) from public;
revoke all on function daemon_manager_get_active_request(uuid, uuid) from public;
revoke all on function daemon_manager_claim_restart(uuid, uuid, uuid) from public;
revoke all on function daemon_manager_get_drain_summary(uuid, uuid) from public;
revoke all on function daemon_manager_update_blockers(uuid, uuid, uuid, jsonb) from public;
revoke all on function daemon_manager_begin_restart(uuid, uuid, uuid) from public;
revoke all on function daemon_manager_publish_degraded(uuid, uuid, text) from public;
revoke all on function daemon_manager_publish_candidate(uuid, uuid, integer, timestamptz) from public;
revoke all on function daemon_manager_complete_recovery(uuid, uuid) from public;
revoke all on function daemon_manager_complete_restart(uuid, uuid, uuid) from public;
grant execute on function daemon_manager_acquire_lease(uuid, uuid, integer) to anon;
grant execute on function daemon_manager_publish_heartbeat(uuid, uuid, integer, timestamptz, text) to anon;
grant execute on function daemon_manager_get_active_request(uuid, uuid) to anon;
grant execute on function daemon_manager_claim_restart(uuid, uuid, uuid) to anon;
grant execute on function daemon_manager_get_drain_summary(uuid, uuid) to anon;
grant execute on function daemon_manager_update_blockers(uuid, uuid, uuid, jsonb) to anon;
grant execute on function daemon_manager_begin_restart(uuid, uuid, uuid) to anon;
grant execute on function daemon_manager_publish_degraded(uuid, uuid, text) to anon;
grant execute on function daemon_manager_publish_candidate(uuid, uuid, integer, timestamptz) to anon;
grant execute on function daemon_manager_complete_recovery(uuid, uuid) to anon;
grant execute on function daemon_manager_complete_restart(uuid, uuid, uuid) to anon;
