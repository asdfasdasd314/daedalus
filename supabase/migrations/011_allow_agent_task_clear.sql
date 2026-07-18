create policy "authenticated users can delete own agent tasks"
on agent_tasks for delete to authenticated
using (user_id = auth.uid());
