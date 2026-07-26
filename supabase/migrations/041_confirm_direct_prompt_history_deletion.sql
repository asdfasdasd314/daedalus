-- A REST DELETE can return success when RLS or eligibility filters matched no rows.
-- Return the deleted prompt id so the browser only hides confirmed direct-prompt deletes.
create or replace function delete_terminal_direct_prompt_agent_output_history(p_prompt_id text)
returns text language plpgsql security definer set search_path = public as $$
declare deleted_prompt_id text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from agent_output_history
  where user_id = auth.uid()
    and prompt_id = p_prompt_id
    and source = 'direct_prompt'
    and status in ('completed', 'failed', 'blocked', 'cancelled')
  returning prompt_id into deleted_prompt_id;

  return deleted_prompt_id;
end;
$$;

revoke all on function delete_terminal_direct_prompt_agent_output_history(text) from public;
grant execute on function delete_terminal_direct_prompt_agent_output_history(text) to authenticated;
