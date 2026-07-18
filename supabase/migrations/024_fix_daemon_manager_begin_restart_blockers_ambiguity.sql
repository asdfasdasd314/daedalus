-- Rename the local blockers variable so SET blockers = ... is not ambiguous
-- against daemon_manager_requests.blockers.

create or replace function daemon_manager_begin_restart(
  p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_blockers jsonb;
begin
  v_blockers := daemon_manager_get_drain_summary(p_user_id, p_manager_instance_id);
  if (v_blockers->>'total')::integer <> 0 then return false; end if;

  update daemon_manager_requests manager_request set
    status = 'restarting', blockers = v_blockers, restart_started_at = now(), updated_at = now()
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
