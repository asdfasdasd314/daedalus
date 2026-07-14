grant delete on agent_output_history to authenticated;

create policy "authenticated users can delete own completed agent output history"
on agent_output_history for delete to authenticated
using (user_id = auth.uid() and status in ('completed', 'failed'));
