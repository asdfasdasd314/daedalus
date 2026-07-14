alter table agent_tasks add column conversation_id text;
alter table agent_output_history add column conversation_id text;

update agent_output_history
set conversation_id = prompt_id
where conversation_id is null;

create index agent_output_history_conversation_idx
on agent_output_history (user_id, conversation_id, created_at, id);

drop function if exists daemon_upsert_agent_output_history(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, text,
  text, timestamptz, timestamptz
);

create function daemon_upsert_agent_output_history(
  p_user_id uuid, p_prompt_id text, p_repository text, p_prompt text,
  p_output text, p_error text, p_provider text, p_model text, p_reasoning text,
  p_conversation_id text, p_mode text, p_targeted_feature_paths jsonb,
  p_status text, p_status_detail text default null,
  p_started_at timestamptz default null, p_completed_at timestamptz default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_mode not in ('planning', 'ask') then
    raise exception 'Direct prompt history only supports planning and ask modes';
  end if;
  if p_status not in ('running', 'completed', 'failed', 'cancelled') then
    raise exception 'Unsupported direct prompt history status: %', p_status;
  end if;
  if nullif(trim(p_prompt_id), '') is null then
    raise exception 'Prompt ID is required';
  end if;

  insert into agent_output_history (
    user_id, prompt_id, conversation_id, repository, prompt, output, error,
    provider, model, reasoning, mode, source, targeted_feature_paths, status,
    status_detail, started_at, completed_at
  ) values (
    p_user_id, p_prompt_id, coalesce(nullif(trim(p_conversation_id), ''), p_prompt_id),
    p_repository, p_prompt, coalesce(p_output, ''), coalesce(p_error, ''),
    coalesce(p_provider, ''), coalesce(p_model, ''), coalesce(p_reasoning, ''),
    p_mode, 'direct_prompt', coalesce(p_targeted_feature_paths, '[]'::jsonb),
    p_status, left(p_status_detail, 500), coalesce(p_started_at, now()),
    case when p_status in ('completed', 'failed', 'cancelled') then coalesce(p_completed_at, now()) else p_completed_at end
  ) on conflict (user_id, prompt_id) do update set
    conversation_id = excluded.conversation_id,
    repository = excluded.repository, prompt = excluded.prompt,
    output = excluded.output, error = excluded.error, provider = excluded.provider,
    model = excluded.model, reasoning = excluded.reasoning, mode = excluded.mode,
    targeted_feature_paths = excluded.targeted_feature_paths,
    status = excluded.status, status_detail = excluded.status_detail,
    started_at = coalesce(agent_output_history.started_at, excluded.started_at),
    completed_at = excluded.completed_at, updated_at = now();
end;
$$;

revoke all on function daemon_upsert_agent_output_history(
  uuid, text, text, text, text, text, text, text, text, text, text, jsonb,
  text, text, timestamptz, timestamptz
) from public;
grant execute on function daemon_upsert_agent_output_history(
  uuid, text, text, text, text, text, text, text, text, text, text, jsonb,
  text, text, timestamptz, timestamptz
) to anon;

create or replace function project_agent_task_to_output_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into agent_output_history (
    user_id, prompt_id, task_id, conversation_id, repository, prompt, output,
    error, provider, model, reasoning, mode, source, targeted_feature_paths,
    status, status_detail, created_at, started_at, completed_at, updated_at
  ) values (
    new.user_id, new.id::text, new.id,
    coalesce(nullif(new.conversation_id, ''), new.id::text), new.repository,
    new.prompt, coalesce(new.result, ''), coalesce(new.error, ''), new.provider,
    new.model, new.reasoning, 'standard', 'durable_task', new.targeted_feature_paths,
    new.status, left(nullif(coalesce(new.error, ''), ''), 500), new.created_at,
    new.started_at, new.completed_at, new.updated_at
  ) on conflict (user_id, prompt_id) do update set
    task_id = excluded.task_id, conversation_id = excluded.conversation_id,
    repository = excluded.repository, prompt = excluded.prompt,
    output = excluded.output, error = excluded.error, provider = excluded.provider,
    model = excluded.model, reasoning = excluded.reasoning,
    targeted_feature_paths = excluded.targeted_feature_paths,
    status = excluded.status, status_detail = excluded.status_detail,
    started_at = excluded.started_at, completed_at = excluded.completed_at,
    updated_at = excluded.updated_at;
  return new;
end;
$$;
