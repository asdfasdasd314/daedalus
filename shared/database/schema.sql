create table daemon_manager_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null default 'restart_execution' check (action = 'restart_execution'),
  status text not null default 'requested' check (status in ('requested', 'draining', 'restarting', 'completed', 'failed', 'cancelled')),
  blockers jsonb not null default '{"total":0,"agentTasks":0,"orchestrationBatches":0,"featureExecutions":0,"communications":{}}'::jsonb,
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  restart_started_at timestamptz,
  completed_at timestamptz,
  failure_detail text,
  updated_at timestamptz not null default now()
);

create table daemon_manager_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'running' check (state in ('running', 'draining', 'restarting', 'degraded')),
  accepts_work boolean not null default true,
  active_request_id uuid references daemon_manager_requests(id) on delete set null,
  manager_instance_id uuid,
  manager_heartbeat_at timestamptz,
  execution_process_id integer,
  execution_generation bigint not null default 0 check (execution_generation >= 0),
  execution_started_at timestamptz,
  last_successful_restart_at timestamptz,
  status_detail text,
  updated_at timestamptz not null default now()
);

create unique index daemon_manager_one_active_request_idx on daemon_manager_requests (user_id)
where status in ('requested', 'draining', 'restarting');
create index daemon_manager_requests_history_idx on daemon_manager_requests (user_id, requested_at desc);

alter table daemon_manager_state enable row level security;
alter table daemon_manager_requests enable row level security;
revoke all on daemon_manager_state from anon, authenticated;
revoke all on daemon_manager_requests from anon, authenticated;
grant select on daemon_manager_state to authenticated;
grant select on daemon_manager_requests to authenticated;
create policy "authenticated users can read own manager state" on daemon_manager_state
for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can read own manager requests" on daemon_manager_requests
for select to authenticated using (user_id = auth.uid());

create function daemon_accepts_work(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select accepts_work from daemon_manager_state where user_id = p_user_id), true);
$$;
revoke all on function daemon_accepts_work(uuid) from public;
grant execute on function daemon_accepts_work(uuid) to authenticated, anon;

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
with check (
  user_id = auth.uid() and (
    message <> 'daemon_review'
    or purpose not in ('agent_prompt', 'git_sync_request', 'feature_file_load', 'parameter_file_load', 'parameter_file_update', 'entry_point_update')
    or daemon_accepts_work(auth.uid())
  )
);

create policy "authenticated users can update own communications"
on communications
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid() and (
    message <> 'daemon_review'
    or purpose not in ('agent_prompt', 'git_sync_request', 'feature_file_load', 'parameter_file_load', 'parameter_file_update', 'entry_point_update')
    or daemon_accepts_work(auth.uid())
  )
);

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
grant select, delete on agent_output_history to authenticated;

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
with check (user_id = auth.uid() and status = 'queued' and message = 'daemon_review'
  and daemon_accepts_work(auth.uid()));
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
create policy "authenticated users can delete own completed agent output history"
on agent_output_history for delete to authenticated
using (user_id = auth.uid() and status in ('completed', 'failed'));

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

create table feature_execution_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_directory text not null,
  feature_file_path text not null,
  parameter_file_path text not null default '',
  entry_point_path text not null default '',
  command jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  message text not null default 'daemon_review' check (message in ('daemon_review', 'client_review', 'client_complete')),
  cancel_requested boolean not null default false,
  process_id integer,
  exit_code integer,
  stdout_tail text not null default '',
  stderr_tail text not null default '',
  error text not null default '',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index feature_execution_runs_user_history_idx on feature_execution_runs (user_id, created_at desc);
create index feature_execution_runs_active_idx on feature_execution_runs (user_id, status) where status in ('queued', 'running');
create unique index feature_execution_runs_one_active_feature_idx
on feature_execution_runs (user_id, project_directory, feature_file_path)
where status in ('queued', 'running');
alter table feature_execution_runs enable row level security;
create policy "authenticated users can insert own feature runs" on feature_execution_runs
for insert to authenticated with check (
  user_id = auth.uid() and status = 'queued' and message = 'daemon_review'
  and cancel_requested = false and command = '[]'::jsonb and parameter_file_path = ''
  and daemon_accepts_work(auth.uid())
);
create policy "authenticated users can read own feature runs" on feature_execution_runs
for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can cancel own active feature runs" on feature_execution_runs
for update to authenticated
using (user_id = auth.uid() and status in ('queued', 'running') and cancel_requested = false)
with check (user_id = auth.uid() and status in ('queued', 'running') and cancel_requested = true);
create policy "authenticated users can acknowledge own feature runs" on feature_execution_runs
for update to authenticated using (user_id = auth.uid() and message = 'client_review')
with check (user_id = auth.uid() and message = 'client_complete');
create policy "authenticated users can delete own terminal feature runs" on feature_execution_runs
for delete to authenticated using (user_id = auth.uid() and status in ('completed', 'failed', 'cancelled'));

create function daemon_claim_feature_execution_run(p_user_id uuid)
returns setof feature_execution_runs language plpgsql security definer set search_path = public as $$
declare claimed feature_execution_runs;
begin
  select * into claimed from feature_execution_runs
  where user_id = p_user_id and status = 'queued' and message = 'daemon_review' and cancel_requested = false
  order by created_at for update skip locked limit 1;
  if not found then return; end if;
  update feature_execution_runs set status = 'running', started_at = now(), updated_at = now()
  where id = claimed.id returning * into claimed;
  return next claimed;
end;
$$;
create function daemon_update_feature_execution_run(p_user_id uuid, p_run_id uuid, p_expected_status text, p_updates jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update feature_execution_runs set
    status = coalesce(p_updates->>'status', status),
    message = coalesce(p_updates->>'message', case when p_updates->>'status' in ('completed', 'failed', 'cancelled') then 'client_review' else message end),
    parameter_file_path = coalesce(p_updates->>'parameter_file_path', parameter_file_path),
    entry_point_path = coalesce(p_updates->>'entry_point_path', entry_point_path),
    command = coalesce(p_updates->'command', command),
    process_id = coalesce((p_updates->>'process_id')::integer, process_id),
    exit_code = case when p_updates ? 'exit_code' then (p_updates->>'exit_code')::integer else exit_code end,
    stdout_tail = coalesce(p_updates->>'stdout_tail', stdout_tail), stderr_tail = coalesce(p_updates->>'stderr_tail', stderr_tail),
    error = coalesce(p_updates->>'error', error),
    started_at = case when p_updates ? 'started_at' then now() else started_at end,
    completed_at = case when p_updates ? 'completed_at' then now() else completed_at end,
    updated_at = now()
  where id = p_run_id and user_id = p_user_id and status = p_expected_status;
  return found;
end;
$$;
create function daemon_list_active_feature_execution_runs(p_user_id uuid)
returns setof feature_execution_runs language sql security definer set search_path = public as $$
  select * from feature_execution_runs where user_id = p_user_id and status in ('queued', 'running') order by created_at;
$$;
grant execute on function daemon_claim_feature_execution_run(uuid) to anon;
grant execute on function daemon_update_feature_execution_run(uuid, uuid, text, jsonb) to anon;
grant execute on function daemon_list_active_feature_execution_runs(uuid) to anon;

create function request_execution_restart()
returns jsonb language plpgsql security definer set search_path = public as $$
declare owner_id uuid := auth.uid(); restart_request daemon_manager_requests;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into restart_request from daemon_manager_requests
  where user_id = owner_id and status in ('requested', 'draining', 'restarting')
  order by requested_at limit 1 for update;
  if not found then insert into daemon_manager_requests (user_id) values (owner_id) returning * into restart_request; end if;
  insert into daemon_manager_state (user_id, state, accepts_work, active_request_id, status_detail)
  values (owner_id, 'draining', false, restart_request.id, 'Restart requested; waiting for accepted work.')
  on conflict (user_id) do update set
    state = case when daemon_manager_state.state = 'restarting' then 'restarting' else 'draining' end,
    accepts_work = false, active_request_id = restart_request.id,
    status_detail = case when daemon_manager_state.state = 'restarting' then daemon_manager_state.status_detail else 'Restart requested; waiting for accepted work.' end,
    updated_at = now();
  return to_jsonb(restart_request);
end;
$$;
create function cancel_execution_restart(request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cancelled_request daemon_manager_requests;
begin
  update daemon_manager_requests set status = 'cancelled', completed_at = now(), updated_at = now()
  where id = request_id and user_id = auth.uid() and status in ('requested', 'draining') returning * into cancelled_request;
  if not found then raise exception 'Restart can no longer be cancelled'; end if;
  update daemon_manager_state set state = 'running', accepts_work = true, active_request_id = null,
    status_detail = 'Restart cancelled.', updated_at = now()
  where user_id = auth.uid() and active_request_id = request_id and state = 'draining';
  if not found then raise exception 'Restart replacement has already begun'; end if;
  return to_jsonb(cancelled_request);
end;
$$;
create function get_daemon_manager_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when manager_state.user_id is null then null else to_jsonb(manager_state) || jsonb_build_object(
    'activeRequest', case when manager_request.id is null then null else to_jsonb(manager_request) end) end
  from (select auth.uid() user_id) owner
  left join daemon_manager_state manager_state on manager_state.user_id = owner.user_id
  left join daemon_manager_requests manager_request on manager_request.id = manager_state.active_request_id;
$$;
revoke all on function request_execution_restart() from public;
revoke all on function cancel_execution_restart(uuid) from public;
revoke all on function get_daemon_manager_status() from public;
grant execute on function request_execution_restart() to authenticated;
grant execute on function cancel_execution_restart(uuid) to authenticated;
grant execute on function get_daemon_manager_status() to authenticated;

create function daemon_manager_acquire_lease(p_user_id uuid, p_manager_instance_id uuid, p_stale_after_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into daemon_manager_state (user_id, manager_instance_id, manager_heartbeat_at, status_detail)
  values (p_user_id, p_manager_instance_id, now(), 'Manager connected.')
  on conflict (user_id) do update set manager_instance_id = excluded.manager_instance_id,
    manager_heartbeat_at = now(), updated_at = now()
  where daemon_manager_state.manager_instance_id = p_manager_instance_id
    or daemon_manager_state.manager_instance_id is null or daemon_manager_state.manager_heartbeat_at is null
    or daemon_manager_state.manager_heartbeat_at < now() - make_interval(secs => greatest(p_stale_after_seconds, 1));
  return found;
end;
$$;
create function daemon_manager_publish_heartbeat(p_user_id uuid, p_manager_instance_id uuid, p_execution_process_id integer, p_execution_started_at timestamptz, p_status_detail text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_state set manager_heartbeat_at = now(), execution_process_id = p_execution_process_id,
    execution_started_at = p_execution_started_at, status_detail = coalesce(p_status_detail, status_detail), updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id;
  return found;
end;
$$;
create function daemon_manager_get_active_request(p_user_id uuid, p_manager_instance_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select case when manager_request.id is null then null else to_jsonb(manager_request) end
  from daemon_manager_state manager_state left join daemon_manager_requests manager_request on manager_request.id = manager_state.active_request_id
  where manager_state.user_id = p_user_id and manager_state.manager_instance_id = p_manager_instance_id;
$$;
create function daemon_manager_claim_restart(p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_requests manager_request set status = 'draining', claimed_at = coalesce(claimed_at, now()), updated_at = now()
  from daemon_manager_state manager_state where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status in ('requested', 'draining') and manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id and manager_state.active_request_id = p_request_id;
  return found;
end;
$$;
create function daemon_manager_get_drain_summary(p_user_id uuid, p_manager_instance_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists (select 1 from daemon_manager_state where user_id = p_user_id and manager_instance_id = p_manager_instance_id)
    then raise exception 'Manager lease is not owned'; end if;
  select jsonb_build_object('total', agent_count + batch_count + feature_count + communication_count,
    'agentTasks', agent_count, 'orchestrationBatches', batch_count, 'featureExecutions', feature_count,
    'communications', communication_counts,
    'identifiers', jsonb_build_object(
      'agentTasks', coalesce((select jsonb_agg(id order by queue_sequence) from agent_tasks where user_id = p_user_id and status in ('queued','running','verifying','ready','integrating','resolving')), '[]'::jsonb),
      'orchestrationBatches', coalesce((select jsonb_agg(id order by created_at) from orchestration_batches where user_id = p_user_id and status in ('collecting','integrating','resolving')), '[]'::jsonb),
      'featureExecutions', coalesce((select jsonb_agg(id order by created_at) from feature_execution_runs where user_id = p_user_id and status in ('queued','running')), '[]'::jsonb),
      'communications', coalesce((select jsonb_agg(jsonb_build_object('purpose', purpose, 'updatedAt', updated_at) order by purpose) from communications where user_id = p_user_id and message = 'daemon_review' and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')), '[]'::jsonb)
    )) into result
  from (select
    (select count(*) from agent_tasks where user_id = p_user_id and status in ('queued','running','verifying','ready','integrating','resolving')) agent_count,
    (select count(*) from orchestration_batches where user_id = p_user_id and status in ('collecting','integrating','resolving')) batch_count,
    (select count(*) from feature_execution_runs where user_id = p_user_id and status in ('queued','running')) feature_count,
    (select count(*) from communications where user_id = p_user_id and message = 'daemon_review' and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')) communication_count,
    coalesce((select jsonb_object_agg(purpose, purpose_count) from (
      select purpose, count(*) purpose_count from communications where user_id = p_user_id and message = 'daemon_review'
      and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update') group by purpose
    ) groups), '{}'::jsonb) communication_counts) counts;
  return result;
end;
$$;
create function daemon_manager_update_blockers(p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid, p_blockers jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_requests manager_request set blockers = p_blockers, updated_at = now()
  from daemon_manager_state manager_state where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status = 'draining' and manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id and manager_state.active_request_id = p_request_id;
  return found;
end;
$$;
create function daemon_manager_begin_restart(p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare blockers jsonb;
begin
  blockers := daemon_manager_get_drain_summary(p_user_id, p_manager_instance_id);
  if (blockers->>'total')::integer <> 0 then return false; end if;
  update daemon_manager_requests manager_request set status = 'restarting', blockers = blockers, restart_started_at = now(), updated_at = now()
  from daemon_manager_state manager_state where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status = 'draining' and manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id and manager_state.active_request_id = p_request_id
    and manager_state.state = 'draining';
  if not found then return false; end if;
  update daemon_manager_state set state = 'restarting', accepts_work = false,
    status_detail = 'Replacing execution process.', updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id and active_request_id = p_request_id;
  return found;
end;
$$;
create function daemon_manager_publish_degraded(p_user_id uuid, p_manager_instance_id uuid, p_status_detail text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_state set state = 'degraded', accepts_work = false, execution_process_id = null,
    execution_started_at = null, status_detail = left(p_status_detail, 1000), manager_heartbeat_at = now(), updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id;
  return found;
end;
$$;
create function daemon_manager_publish_candidate(p_user_id uuid, p_manager_instance_id uuid, p_execution_process_id integer, p_execution_started_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_state set execution_process_id = p_execution_process_id, execution_started_at = p_execution_started_at,
    status_detail = 'Checking replacement stability.', manager_heartbeat_at = now(), updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id;
  return found;
end;
$$;
create function daemon_manager_complete_recovery(p_user_id uuid, p_manager_instance_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_state set
    state = case when active_request_id is null then 'running' else 'draining' end,
    accepts_work = active_request_id is null, execution_generation = execution_generation + 1,
    last_successful_restart_at = now(), status_detail = 'Execution process is stable.', manager_heartbeat_at = now(), updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id;
  return found;
end;
$$;
create function daemon_manager_complete_restart(p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_requests manager_request set status = 'completed', completed_at = now(), failure_detail = null, updated_at = now()
  from daemon_manager_state manager_state where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status = 'restarting' and manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id and manager_state.active_request_id = p_request_id;
  if not found then return false; end if;
  update daemon_manager_state set state = 'running', accepts_work = true, active_request_id = null,
    execution_generation = execution_generation + 1, last_successful_restart_at = now(),
    status_detail = 'Execution restart completed.', manager_heartbeat_at = now(), updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id and active_request_id = p_request_id;
  return found;
end;
$$;

revoke all on function daemon_manager_acquire_lease(uuid, uuid, integer) from public;
revoke all on function daemon_manager_publish_heartbeat(uuid, uuid, integer, timestamptz, text) from public;
revoke all on function daemon_manager_get_active_request(uuid, uuid) from public;
revoke all on function daemon_manager_claim_restart(uuid, uuid, uuid) from public;
revoke all on function daemon_manager_get_drain_summary(uuid, uuid) from public;
revoke all on function daemon_manager_update_blockers(uuid, uuid, uuid, jsonb) from public;
revoke all on function daemon_manager_begin_restart(uuid, uuid, uuid) from public;
revoke all on function daemon_manager_publish_degraded(uuid, uuid, text) from public;
revoke all on function daemon_manager_publish_candidate(uuid, uuid, integer, timestamptz) from public;
revoke all on function daemon_manager_complete_recovery(uuid, uuid) from public;
revoke all on function daemon_manager_complete_restart(uuid, uuid, uuid) from public;
grant execute on function daemon_manager_acquire_lease(uuid, uuid, integer) to anon;
grant execute on function daemon_manager_publish_heartbeat(uuid, uuid, integer, timestamptz, text) to anon;
grant execute on function daemon_manager_get_active_request(uuid, uuid) to anon;
grant execute on function daemon_manager_claim_restart(uuid, uuid, uuid) to anon;
grant execute on function daemon_manager_get_drain_summary(uuid, uuid) to anon;
grant execute on function daemon_manager_update_blockers(uuid, uuid, uuid, jsonb) to anon;
grant execute on function daemon_manager_begin_restart(uuid, uuid, uuid) to anon;
grant execute on function daemon_manager_publish_degraded(uuid, uuid, text) to anon;
grant execute on function daemon_manager_publish_candidate(uuid, uuid, integer, timestamptz) to anon;
grant execute on function daemon_manager_complete_recovery(uuid, uuid) to anon;
grant execute on function daemon_manager_complete_restart(uuid, uuid, uuid) to anon;
