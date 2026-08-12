-- Repair loops left executing after their linked task became terminal, then
-- keep an operator-resumed task connected to the same loop and worktree.

update aop_execution_loops loop_row
set
  status = 'awaiting_start',
  current_agent_task_id = null,
  active_prompt_id = '',
  pause_requested = false,
  cancel_requested = false,
  status_detail = case task.status
    when 'blocked' then 'Coding task is blocked. Complete the required operator action, then Resume task from Agent Output History.'
    else 'Coding task failed. Review it, then Resume task from Agent Output History.'
  end,
  updated_at = now()
from agent_tasks task
where loop_row.current_agent_task_id = task.id
  and loop_row.status = 'executing'
  and task.status in ('blocked', 'failed');

create or replace function daemon_get_agent_task_control(p_user_id uuid,p_task_id uuid)
returns jsonb language sql security definer set search_path=public as $$
 select case when t.id is null then null else jsonb_build_object('id',t.id,'status',t.status,'cancel_requested',t.cancel_requested,'updated_at',t.updated_at) end
 from (select 1) seed
 left join agent_tasks t on t.id=p_task_id and t.user_id=p_user_id;
$$;
revoke all on function daemon_get_agent_task_control(uuid,uuid) from public;
grant execute on function daemon_get_agent_task_control(uuid,uuid) to anon;

create or replace function request_agent_task_retry(p_task_id uuid,p_expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
declare resumed_loop_id uuid;
begin
 update agent_tasks
 set
   status = case status when 'failed' then 'queued' when 'blocked' then case when operator_handoff is null then 'ready' else 'queued' end end,
   message = 'daemon_review',
   cancel_requested = false,
   completed_at = null,
   retry_generation = retry_generation + 1,
   resolver_attempts = case when status = 'blocked' then 0 else resolver_attempts end,
   updated_at = now()
 where id=p_task_id
   and user_id=auth.uid()
   and updated_at=p_expected_updated_at
   and status in('failed','blocked')
   and worktree_path is not null
   and branch_name is not null
 returning source_loop_id into resumed_loop_id;

 if not found then return false; end if;

 if resumed_loop_id is not null then
   update aop_execution_loops
   set
     status = 'executing',
     paused_from = '',
     current_agent_task_id = p_task_id,
     active_prompt_id = p_task_id::text,
     pause_requested = false,
     cancel_requested = false,
     status_detail = 'Resuming the retained coding task; revalidating the operator prerequisite.',
     updated_at = now()
   where id = resumed_loop_id
     and user_id = auth.uid()
     and status not in ('completed','cancelled','failed');
 end if;

 return true;
end;
$$;
