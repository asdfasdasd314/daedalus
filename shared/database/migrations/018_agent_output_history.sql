create table agent_output_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_id text not null,
  task_id uuid references agent_tasks(id) on delete set null,
  repository text not null,
  prompt text not null,
  output text not null default '',
  error text not null default '',
  provider text not null default '',
  model text not null default '',
  reasoning text not null default '',
  mode text not null check (mode in ('standard', 'planning', 'ask')),
  source text not null check (source in ('durable_task', 'direct_prompt')),
  targeted_feature_paths jsonb not null default '[]'::jsonb
    check (jsonb_typeof(targeted_feature_paths) = 'array'),
  status text not null check (status in (
    'queued', 'running', 'verifying', 'ready', 'integrating', 'resolving',
    'completed', 'failed', 'blocked', 'cancelled'
  )),
  status_detail text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, prompt_id)
);

create index agent_output_history_archive_idx
on agent_output_history (user_id, completed_at desc, id desc);
create index agent_output_history_recent_idx
on agent_output_history (user_id, updated_at desc);
create index agent_output_history_repository_idx
on agent_output_history (user_id, repository);
create index agent_output_history_features_idx
on agent_output_history using gin (targeted_feature_paths);

alter table agent_output_history enable row level security;

revoke all on agent_output_history from anon, authenticated;
grant select on agent_output_history to authenticated;

create policy "authenticated users can read own agent output history"
on agent_output_history for select to authenticated
using (user_id = auth.uid());

create trigger set_agent_output_history_updated_at
before update on agent_output_history
for each row execute function set_updated_at();

create or replace function daemon_upsert_agent_output_history(
  p_user_id uuid,
  p_prompt_id text,
  p_repository text,
  p_prompt text,
  p_output text,
  p_error text,
  p_provider text,
  p_model text,
  p_reasoning text,
  p_mode text,
  p_targeted_feature_paths jsonb,
  p_status text,
  p_status_detail text default null,
  p_started_at timestamptz default null,
  p_completed_at timestamptz default null
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
    user_id, prompt_id, repository, prompt, output, error, provider, model,
    reasoning, mode, source, targeted_feature_paths, status, status_detail,
    started_at, completed_at
  ) values (
    p_user_id, p_prompt_id, p_repository, p_prompt, coalesce(p_output, ''),
    coalesce(p_error, ''), coalesce(p_provider, ''), coalesce(p_model, ''),
    coalesce(p_reasoning, ''), p_mode, 'direct_prompt',
    coalesce(p_targeted_feature_paths, '[]'::jsonb), p_status,
    left(p_status_detail, 500), coalesce(p_started_at, now()),
    case when p_status in ('completed', 'failed', 'cancelled') then coalesce(p_completed_at, now()) else p_completed_at end
  )
  on conflict (user_id, prompt_id) do update set
    repository = excluded.repository,
    prompt = excluded.prompt,
    output = excluded.output,
    error = excluded.error,
    provider = excluded.provider,
    model = excluded.model,
    reasoning = excluded.reasoning,
    mode = excluded.mode,
    targeted_feature_paths = excluded.targeted_feature_paths,
    status = excluded.status,
    status_detail = excluded.status_detail,
    started_at = coalesce(agent_output_history.started_at, excluded.started_at),
    completed_at = excluded.completed_at,
    updated_at = now();
end;
$$;

revoke all on function daemon_upsert_agent_output_history(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, text,
  text, timestamptz, timestamptz
) from public;
grant execute on function daemon_upsert_agent_output_history(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, text,
  text, timestamptz, timestamptz
) to anon;

create or replace function search_agent_output_history(
  p_query text,
  p_limit integer default 50
)
returns setof agent_output_history language sql stable security definer
set search_path = public as $$
  select history.*
  from agent_output_history history
  where history.user_id = auth.uid()
    and (
      nullif(trim(p_query), '') is null
      or concat_ws(' ', history.prompt, history.output, history.repository,
        history.targeted_feature_paths::text, history.provider, history.model,
        history.mode, history.status) ilike '%' || trim(p_query) || '%'
    )
  order by coalesce(history.completed_at, history.updated_at) desc, history.id desc
  limit least(greatest(p_limit, 1), 200);
$$;

revoke all on function search_agent_output_history(text, integer) from public;
grant execute on function search_agent_output_history(text, integer) to authenticated;

create or replace function summarize_agent_output_history_features()
returns table (
  repository text,
  feature_path text,
  result_count bigint,
  latest_activity timestamptz
) language sql stable security definer set search_path = public as $$
  select history.repository, feature.value, count(*),
    max(coalesce(history.completed_at, history.updated_at))
  from agent_output_history history
  cross join lateral jsonb_array_elements_text(history.targeted_feature_paths) feature(value)
  where history.user_id = auth.uid()
  group by history.repository, feature.value
  order by max(coalesce(history.completed_at, history.updated_at)) desc;
$$;

revoke all on function summarize_agent_output_history_features() from public;
grant execute on function summarize_agent_output_history_features() to authenticated;

create or replace function project_agent_task_to_output_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into agent_output_history (
    user_id, prompt_id, task_id, repository, prompt, output, error, provider,
    model, reasoning, mode, source, targeted_feature_paths, status,
    status_detail, created_at, started_at, completed_at, updated_at
  ) values (
    new.user_id, new.id::text, new.id, new.repository, new.prompt,
    coalesce(new.result, ''), coalesce(new.error, ''), new.provider, new.model,
    new.reasoning, 'standard', 'durable_task', new.targeted_feature_paths,
    new.status, left(nullif(coalesce(new.error, ''), ''), 500), new.created_at,
    new.started_at, new.completed_at, new.updated_at
  )
  on conflict (user_id, prompt_id) do update set
    task_id = excluded.task_id,
    repository = excluded.repository,
    prompt = excluded.prompt,
    output = excluded.output,
    error = excluded.error,
    provider = excluded.provider,
    model = excluded.model,
    reasoning = excluded.reasoning,
    targeted_feature_paths = excluded.targeted_feature_paths,
    status = excluded.status,
    status_detail = excluded.status_detail,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create trigger project_agent_task_history
after insert or update on agent_tasks
for each row execute function project_agent_task_to_output_history();

insert into agent_output_history (
  user_id, prompt_id, task_id, repository, prompt, output, error, provider,
  model, reasoning, mode, source, targeted_feature_paths, status,
  status_detail, created_at, started_at, completed_at, updated_at
)
select user_id, id::text, id, repository, prompt, result, error, provider,
  model, reasoning, 'standard', 'durable_task', targeted_feature_paths, status,
  nullif(error, ''), created_at, started_at, completed_at, updated_at
from agent_tasks
on conflict (user_id, prompt_id) do update set
  task_id = excluded.task_id, output = excluded.output, error = excluded.error,
  status = excluded.status, status_detail = excluded.status_detail,
  started_at = excluded.started_at, completed_at = excluded.completed_at,
  updated_at = excluded.updated_at;

insert into agent_output_history (
  user_id, prompt_id, repository, prompt, output, provider, model, reasoning,
  mode, source, targeted_feature_paths, status, created_at, started_at,
  completed_at, updated_at
)
select user_id, payload->>'promptId', coalesce(payload->>'directory', ''),
  coalesce(payload->>'prompt', ''), coalesce(payload->>'reply', ''),
  coalesce(payload->>'provider', ''), coalesce(payload->>'model', ''),
  coalesce(payload->>'reasoning', ''),
  case
    when payload->>'askMode' = 'true' then 'ask'
    when payload->>'planningMode' = 'true' then 'planning'
    else 'standard'
  end,
  'direct_prompt', coalesce(payload->'targetedFeaturePaths', '[]'::jsonb),
  'completed', updated_at, updated_at, updated_at, updated_at
from daemon_payloads
where kind = 'agent_chat' and nullif(trim(payload->>'promptId'), '') is not null
on conflict (user_id, prompt_id) do nothing;

delete from daemon_payloads where kind = 'agent_chat';

alter table daemon_payloads drop constraint if exists daemon_payloads_kind_check;
alter table daemon_payloads add constraint daemon_payloads_kind_check
check (kind in ('feature_files', 'parameter_files', 'git_sync_result'));

create or replace function daemon_upsert_payload(p_user_id uuid, p_kind text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('feature_files', 'parameter_files', 'git_sync_result') then
    raise exception 'Unsupported daemon payload kind: %', p_kind;
  end if;
  insert into daemon_payloads (user_id, kind, payload, message)
  values (p_user_id, p_kind, p_payload, 'client_review')
  on conflict (user_id, kind) do update set
    payload = excluded.payload, message = excluded.message, updated_at = now();
end;
$$;
