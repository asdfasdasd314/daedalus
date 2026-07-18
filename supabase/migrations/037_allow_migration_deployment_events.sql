-- Migration deployment telemetry must not be rejected by the daemon event RPC.
alter table daemon_events drop constraint if exists daemon_events_event_type_check;
alter table daemon_events add constraint daemon_events_event_type_check
  check (event_type in (
    'status',
    'batch_completed',
    'migration_deployment_started',
    'migration_deployment_no_pending',
    'migration_deployment_succeeded',
    'migration_deployment_blocked'
  ));

create or replace function daemon_record_event(
  p_user_id uuid, p_repository text, p_task_id uuid, p_batch_id uuid,
  p_severity text, p_message text, p_event_type text default 'status'
)
returns void language plpgsql security definer set search_path = public as $$
declare event_generation integer;
begin
  if p_event_type not in (
    'status',
    'batch_completed',
    'migration_deployment_started',
    'migration_deployment_no_pending',
    'migration_deployment_succeeded',
    'migration_deployment_blocked'
  ) then
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
