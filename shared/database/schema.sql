create table communications (
  message text not null check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  content text,
  purpose text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (user_id, purpose)
);

alter table communications enable row level security;

create policy "authenticated users can read own communications"
on communications
for select
to authenticated
using (user_id = auth.uid());

create policy "authenticated users can insert own communications"
on communications
for insert
to authenticated
with check (user_id = auth.uid());

create policy "authenticated users can update own communications"
on communications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "authenticated users can delete own communications"
on communications
for delete
to authenticated
using (user_id = auth.uid());

create type venture_progress_state as enum ('idle', 'in progress', 'completed');

create table ventures (
  created_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  progress_state venture_progress_state not null default 'idle',
  venture_name text not null,
  project_directory text,
  details text,
  feature_file_paths text[] not null default '{}',
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table ventures enable row level security;

create policy "authenticated users can read own ventures"
on ventures
for select
to authenticated
using (user_id = auth.uid());

create policy "authenticated users can insert own ventures"
on ventures
for insert
to authenticated
with check (user_id = auth.uid());

create policy "authenticated users can update own ventures"
on ventures
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "authenticated users can delete own ventures"
on ventures
for delete
to authenticated
using (user_id = auth.uid());

create table daemon_payloads (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (
    kind in ('feature_files', 'parameter_files', 'git_sync_result')
  ),
  payload jsonb not null,
  message text not null default 'client_complete' check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

create table agent_tasks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  repository text not null,
  prompt text not null,
  message text not null default 'client_complete' check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  provider text not null,
  model text not null default '',
  reasoning text not null default '',
  planning_mode boolean not null default false,
  targeted_feature_paths jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'verifying', 'ready', 'failed', 'integrating', 'resolving', 'completed', 'blocked', 'cancelled')),
  queue_sequence bigint generated always as identity,
  base_commit text,
  branch_name text,
  worktree_path text,
  batch_id uuid,
  result text not null default '',
  error text not null default '',
  verification_attempts integer not null default 0,
  cancel_requested boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table orchestration_batches (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  repository text not null,
  base_commit text not null,
  task_ids jsonb not null default '[]'::jsonb,
  integration_branch text not null,
  integration_worktree_path text not null default '',
  status text not null default 'collecting' check (status in ('collecting', 'integrating', 'resolving', 'completed', 'blocked')),
  message text not null default 'daemon_complete' check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  resolver_attempts integer not null default 0,
  verification_output text not null default '',
  quiet_since timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table agent_tasks add constraint agent_tasks_batch_id_fkey
foreign key (batch_id) references orchestration_batches(id) on delete set null;

create table daemon_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  repository text not null,
  task_id uuid references agent_tasks(id) on delete set null,
  batch_id uuid references orchestration_batches(id) on delete set null,
  severity text not null check (severity in ('info', 'warning', 'error')),
  message text not null check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  content text not null,
  created_at timestamptz not null default now()
);

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
  targeted_feature_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(targeted_feature_paths) = 'array'),
  status text not null check (status in ('queued', 'running', 'verifying', 'ready', 'integrating', 'resolving', 'completed', 'failed', 'blocked', 'cancelled')),
  status_detail text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, prompt_id)
);

alter table daemon_payloads enable row level security;
alter table agent_tasks enable row level security;
alter table orchestration_batches enable row level security;
alter table daemon_events enable row level security;
alter table agent_output_history enable row level security;
revoke all on agent_output_history from anon, authenticated;
grant select on agent_output_history to authenticated;

create policy "authenticated users can read own daemon payloads"
on daemon_payloads
for select
to authenticated
using (user_id = auth.uid());
create policy "authenticated users can acknowledge own daemon payloads"
on daemon_payloads for update to authenticated
using (user_id = auth.uid() and message = 'client_review')
with check (user_id = auth.uid() and message = 'client_complete');

create policy "authenticated users can insert own agent tasks"
on agent_tasks for insert to authenticated
with check (user_id = auth.uid() and status = 'queued' and message = 'daemon_review');
create policy "authenticated users can read own agent tasks"
on agent_tasks for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can acknowledge own agent tasks"
on agent_tasks for update to authenticated
using (user_id = auth.uid() and message = 'client_review')
with check (user_id = auth.uid() and message = 'client_complete');
create policy "authenticated users can request cancel on own agent tasks"
on agent_tasks for update to authenticated
using (
  user_id = auth.uid()
  and cancel_requested = false
  and status in ('queued', 'running', 'verifying', 'ready', 'integrating', 'resolving')
)
with check (
  user_id = auth.uid()
  and cancel_requested = true
);
create policy "authenticated users can delete own agent tasks"
on agent_tasks for delete to authenticated using (user_id = auth.uid());
create policy "authenticated users can read own orchestration batches"
on orchestration_batches for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can read own daemon events"
on daemon_events for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can acknowledge own daemon events"
on daemon_events for update to authenticated
using (user_id = auth.uid() and message = 'client_review')
with check (user_id = auth.uid() and message = 'client_complete');
create policy "authenticated users can read own agent output history"
on agent_output_history for select to authenticated using (user_id = auth.uid());

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_communications_updated_at
before update on communications
for each row
execute function set_updated_at();

create trigger set_ventures_updated_at
before update on ventures
for each row
execute function set_updated_at();

create trigger set_daemon_payloads_updated_at
before update on daemon_payloads
for each row
execute function set_updated_at();
create trigger set_agent_output_history_updated_at
before update on agent_output_history for each row execute function set_updated_at();

create index communications_review_idx on communications (user_id, purpose, message);
create index daemon_payloads_review_idx on daemon_payloads (user_id, kind, message);
create index agent_tasks_review_idx on agent_tasks (user_id, message, queue_sequence);
create index orchestration_batches_review_idx on orchestration_batches (user_id, message, created_at);
create index daemon_events_review_idx on daemon_events (user_id, created_at desc)
where message = 'client_review';
create index agent_output_history_archive_idx on agent_output_history (user_id, completed_at desc, id desc);
create index agent_output_history_recent_idx on agent_output_history (user_id, updated_at desc);
create index agent_output_history_repository_idx on agent_output_history (user_id, repository);
create index agent_output_history_features_idx on agent_output_history using gin (targeted_feature_paths);

create or replace function daemon_get_communication(
  p_user_id uuid,
  p_purpose text
)
returns table(content text, purpose text)
language sql
security definer
set search_path = public
as $$
  select communications.content, communications.purpose
  from communications
  where communications.user_id = p_user_id
    and communications.purpose = p_purpose
    and communications.message = 'daemon_review'
  limit 1;
$$;

create or replace function daemon_upsert_communication(
  p_user_id uuid,
  p_purpose text,
  p_message text,
  p_content text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into communications (user_id, purpose, message, content)
  values (p_user_id, p_purpose, p_message, p_content)
  on conflict (user_id, purpose)
  do update set
    message = excluded.message,
    content = excluded.content,
    updated_at = now();
$$;

create or replace function daemon_upsert_payload(
  p_user_id uuid,
  p_kind text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in (
    'feature_files',
    'parameter_files',
    'git_sync_result'
  ) then
    raise exception 'Unsupported daemon payload kind: %', p_kind;
  end if;

  insert into daemon_payloads (user_id, kind, payload, message)
  values (p_user_id, p_kind, p_payload, 'client_review')
  on conflict (user_id, kind)
  do update set
    payload = excluded.payload,
    message = excluded.message,
    updated_at = now();
end;
$$;

grant execute on function daemon_get_communication(uuid, text) to anon;
grant execute on function daemon_upsert_communication(uuid, text, text, text) to anon;
grant execute on function daemon_upsert_payload(uuid, text, jsonb) to anon;

create or replace function daemon_upsert_agent_output_history(
  p_user_id uuid, p_prompt_id text, p_repository text, p_prompt text,
  p_output text, p_error text, p_provider text, p_model text, p_reasoning text,
  p_mode text, p_targeted_feature_paths jsonb, p_status text,
  p_status_detail text default null, p_started_at timestamptz default null,
  p_completed_at timestamptz default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_mode not in ('planning', 'ask') then raise exception 'Direct prompt history only supports planning and ask modes'; end if;
  if p_status not in ('running', 'completed', 'failed', 'cancelled') then raise exception 'Unsupported direct prompt history status: %', p_status; end if;
  if nullif(trim(p_prompt_id), '') is null then raise exception 'Prompt ID is required'; end if;
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
  ) on conflict (user_id, prompt_id) do update set
    repository = excluded.repository, prompt = excluded.prompt,
    output = excluded.output, error = excluded.error, provider = excluded.provider,
    model = excluded.model, reasoning = excluded.reasoning, mode = excluded.mode,
    targeted_feature_paths = excluded.targeted_feature_paths,
    status = excluded.status, status_detail = excluded.status_detail,
    started_at = coalesce(agent_output_history.started_at, excluded.started_at),
    completed_at = excluded.completed_at, updated_at = now();
end;
$$;

revoke all on function daemon_upsert_agent_output_history(uuid, text, text, text, text, text, text, text, text, text, jsonb, text, text, timestamptz, timestamptz) from public;
grant execute on function daemon_upsert_agent_output_history(uuid, text, text, text, text, text, text, text, text, text, jsonb, text, text, timestamptz, timestamptz) to anon;

create or replace function search_agent_output_history(p_query text, p_limit integer default 50)
returns setof agent_output_history language sql stable security definer set search_path = public as $$
  select history.* from agent_output_history history
  where history.user_id = auth.uid() and (
    nullif(trim(p_query), '') is null or concat_ws(' ', history.prompt,
      history.output, history.repository, history.targeted_feature_paths::text,
      history.provider, history.model, history.mode, history.status)
      ilike '%' || trim(p_query) || '%'
  ) order by coalesce(history.completed_at, history.updated_at) desc, history.id desc
  limit least(greatest(p_limit, 1), 200);
$$;
revoke all on function search_agent_output_history(text, integer) from public;
grant execute on function search_agent_output_history(text, integer) to authenticated;

create or replace function summarize_agent_output_history_features()
returns table (repository text, feature_path text, result_count bigint, latest_activity timestamptz)
language sql stable security definer set search_path = public as $$
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
  ) on conflict (user_id, prompt_id) do update set
    task_id = excluded.task_id, repository = excluded.repository,
    prompt = excluded.prompt, output = excluded.output, error = excluded.error,
    provider = excluded.provider, model = excluded.model,
    reasoning = excluded.reasoning,
    targeted_feature_paths = excluded.targeted_feature_paths,
    status = excluded.status, status_detail = excluded.status_detail,
    started_at = excluded.started_at, completed_at = excluded.completed_at,
    updated_at = excluded.updated_at;
  return new;
end;
$$;
create trigger project_agent_task_history after insert or update on agent_tasks
for each row execute function project_agent_task_to_output_history();

create or replace function daemon_list_agent_tasks(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path = public as $$
  select * from agent_tasks where user_id = p_user_id and message = 'daemon_review' order by queue_sequence;
$$;

create or replace function daemon_update_agent_task(p_user_id uuid, p_task_id uuid, p_expected_status text, p_updates jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update agent_tasks set
    status = coalesce(p_updates->>'status', status),
    message = coalesce(p_updates->>'message', case when p_updates->>'status' in ('completed', 'failed', 'blocked', 'cancelled') then 'client_review' else message end),
    base_commit = coalesce(p_updates->>'base_commit', base_commit),
    branch_name = coalesce(p_updates->>'branch_name', branch_name),
    worktree_path = coalesce(p_updates->>'worktree_path', worktree_path),
    batch_id = coalesce((p_updates->>'batch_id')::uuid, batch_id),
    result = coalesce(p_updates->>'result', result),
    error = coalesce(p_updates->>'error', error),
    verification_attempts = coalesce((p_updates->>'verification_attempts')::integer, verification_attempts),
    cancel_requested = coalesce((p_updates->>'cancel_requested')::boolean, cancel_requested),
    started_at = case when p_updates ? 'started_at' then (p_updates->>'started_at')::timestamptz else started_at end,
    completed_at = case when p_updates ? 'completed_at' then (p_updates->>'completed_at')::timestamptz else completed_at end,
    updated_at = now()
  where id = p_task_id and user_id = p_user_id and status = p_expected_status;
  return found;
end;
$$;

create or replace function daemon_upsert_orchestration_batch(p_user_id uuid, p_batch jsonb)
returns void language sql security definer set search_path = public as $$
  insert into orchestration_batches (id, user_id, repository, base_commit, task_ids, integration_branch, integration_worktree_path, status, message, resolver_attempts, verification_output, quiet_since, completed_at)
  values ((p_batch->>'id')::uuid, p_user_id, p_batch->>'repository', p_batch->>'base_commit', coalesce(p_batch->'task_ids', '[]'::jsonb), p_batch->>'integration_branch', coalesce(p_batch->>'integration_worktree_path', ''), coalesce(p_batch->>'status', 'collecting'), case when p_batch->>'status' in ('completed', 'blocked') then 'daemon_complete' else 'daemon_review' end, coalesce((p_batch->>'resolver_attempts')::integer, 0), coalesce(p_batch->>'verification_output', ''), (p_batch->>'quiet_since')::timestamptz, (p_batch->>'completed_at')::timestamptz)
  on conflict (id) do update set task_ids = excluded.task_ids, integration_worktree_path = excluded.integration_worktree_path, status = excluded.status, message = excluded.message, resolver_attempts = excluded.resolver_attempts, verification_output = excluded.verification_output, quiet_since = excluded.quiet_since, completed_at = excluded.completed_at, updated_at = now();
$$;

create or replace function daemon_list_orchestration_batches(p_user_id uuid)
returns setof orchestration_batches language sql security definer set search_path = public as $$
  select * from orchestration_batches where user_id = p_user_id and message = 'daemon_review' order by created_at;
$$;

create or replace function daemon_record_event(p_user_id uuid, p_repository text, p_task_id uuid, p_batch_id uuid, p_severity text, p_message text)
returns void language sql security definer set search_path = public as $$
  insert into daemon_events (user_id, repository, task_id, batch_id, severity, message, content)
  values (p_user_id, p_repository, p_task_id, p_batch_id, p_severity, 'client_review', p_message);
$$;

grant execute on function daemon_list_agent_tasks(uuid) to anon;
grant execute on function daemon_update_agent_task(uuid, uuid, text, jsonb) to anon;
grant execute on function daemon_upsert_orchestration_batch(uuid, jsonb) to anon;
grant execute on function daemon_list_orchestration_batches(uuid) to anon;
grant execute on function daemon_record_event(uuid, text, uuid, uuid, text, text) to anon;
