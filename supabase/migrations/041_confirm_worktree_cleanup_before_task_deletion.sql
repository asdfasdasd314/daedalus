-- Deletion is intentionally ordered: daemon worktree cleanup confirmation,
-- guarded task/history deletion, then a completed request visible to the client.
create or replace function daemon_complete_task_deletion(p_user_id uuid, p_request_id uuid, p_error text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare request_row agent_task_deletion_requests%rowtype;
begin
  select * into request_row from agent_task_deletion_requests
  where id = p_request_id and user_id = p_user_id and message = 'daemon_review' for update;
  if not found then return false; end if;
  if p_error <> '' then
    update agent_task_deletion_requests set status='rejected', error=p_error, message='client_review', updated_at=now() where id=p_request_id;
    return true;
  end if;
  -- This success branch is called only after the daemon verifies the worktree is absent.
  delete from agent_tasks where id=request_row.task_id and user_id=p_user_id
    and updated_at=request_row.expected_updated_at and status in ('completed','failed','blocked','cancelled');
  if not found then
    update agent_task_deletion_requests set status='rejected', error='Task changed before deletion could be completed.', message='client_review', updated_at=now() where id=p_request_id;
    return true;
  end if;
  delete from agent_output_history where user_id=p_user_id and prompt_id=request_row.prompt_id;
  update agent_task_deletion_requests set status='completed', error='', message='client_review', updated_at=now() where id=p_request_id;
  return true;
end; $$;
