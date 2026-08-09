create table daemon_manager_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null default 'restart_execution' check (action = 'restart_execution'),
  status text not null default 'requested' check (status in ('requested', 'draining', 'restarting', 'completed', 'failed', 'cancelled')),
  message text not null default 'daemon_complete' check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  blockers jsonb not null default '{"total":0,"agentTasks":0,"featureExecutions":0,"architectureViews":0,"communications":{},"identifiers":{}}'::jsonb,
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
  message text not null default 'client_complete' check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  accepts_work boolean not null default true,
  active_request_id uuid references daemon_manager_requests(id) on delete set null,
  manager_instance_id uuid,
  manager_heartbeat_at timestamptz,
  execution_heartbeat_at timestamptz,
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
create index daemon_manager_requests_review_idx on daemon_manager_requests (user_id, updated_at, id)
where message = 'daemon_review';
create index daemon_manager_state_review_idx on daemon_manager_state (user_id, updated_at)
where message = 'client_review';

create function mark_daemon_manager_state_for_client_review()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.message = 'client_review' and new.message = 'client_complete' then
    return new;
  end if;
  new.message = 'client_review';
  return new;
end;
$$;
create trigger mark_daemon_manager_state_review
before insert or update on daemon_manager_state
for each row execute function mark_daemon_manager_state_for_client_review();

alter table daemon_manager_state enable row level security;
alter table daemon_manager_requests enable row level security;
revoke all on daemon_manager_state from anon, authenticated;
revoke all on daemon_manager_requests from anon, authenticated;
grant select on daemon_manager_state to authenticated;
grant update (message) on daemon_manager_state to authenticated;
grant select on daemon_manager_requests to authenticated;
create policy "authenticated users can read own manager state" on daemon_manager_state
for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can read own manager requests" on daemon_manager_requests
for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can acknowledge own manager state" on daemon_manager_state
for update to authenticated
using (user_id = auth.uid() and message = 'client_review')
with check (user_id = auth.uid() and message = 'client_complete');

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
  conversation_id text,
  planning_mode boolean not null default false,
  targeted_feature_paths jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'verifying', 'ready', 'failed', 'integrating', 'resolving', 'completed', 'blocked', 'cancelled')),
  queue_sequence bigint generated always as identity,
  base_commit text,
  completed_commit text,
  branch_name text,
  worktree_path text,
  result text not null default '',
  error text not null default '',
  verification_attempts integer not null default 0,
  resolver_attempts integer not null default 0,
  retry_generation integer not null default 0,
  cancel_requested boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table daemon_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  repository text not null,
  task_id uuid references agent_tasks(id) on delete set null,
  severity text not null check (severity in ('info', 'warning', 'error')),
  event_type text not null default 'status' check (event_type in (
    'status', 'task_integrated', 'migration_deployment_started',
    'migration_deployment_no_pending', 'migration_deployment_succeeded',
    'migration_deployment_blocked'
  )),
  message text not null check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  mode text not null check (mode in ('standard', 'planning', 'ask', 'bridge')),
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

create table architecture_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  prompt_id text not null,
  repository text not null,
  base_commit text not null,
  final_commit text not null,
  targeted_feature_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(targeted_feature_paths) = 'array'),
  generation integer not null default 0 check (generation >= 0),
  status text not null default 'available' check (status in ('available', 'queued', 'running', 'completed', 'failed')),
  message text not null default 'client_complete' check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  changed_files jsonb not null default '[]'::jsonb check (jsonb_typeof(changed_files) = 'array'),
  architecture_document jsonb,
  error text not null default '',
  failure_details jsonb,
  provider text not null default '',
  model text not null default '',
  reasoning text not null default '',
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, prompt_id),
  foreign key (user_id, prompt_id) references agent_output_history (user_id, prompt_id) on delete cascade,
  constraint architecture_views_document_object_check check (architecture_document is null or jsonb_typeof(architecture_document) = 'object'),
  constraint architecture_views_failure_details_object_check check (failure_details is null or jsonb_typeof(failure_details) = 'object'),
  constraint architecture_views_completed_document_check check (status <> 'completed' or architecture_document is not null)
);

alter table daemon_payloads enable row level security;
alter table agent_tasks enable row level security;
alter table daemon_events enable row level security;
alter table agent_output_history enable row level security;
alter table architecture_views enable row level security;
revoke all on agent_output_history from anon, authenticated;
grant select, delete on agent_output_history to authenticated;
revoke all on architecture_views from anon, authenticated;
grant select on architecture_views to authenticated;

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
create policy "authenticated users can read own daemon events"
on daemon_events for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can acknowledge own daemon events"
on daemon_events for update to authenticated
using (user_id = auth.uid() and message = 'client_review')
with check (user_id = auth.uid() and message = 'client_complete');
create policy "authenticated users can read own agent output history"
on agent_output_history for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can read own architecture views"
on architecture_views for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can delete own terminal agent output history"
on agent_output_history for delete to authenticated
using (user_id = auth.uid() and status in ('completed', 'failed', 'blocked', 'cancelled'));

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
create trigger set_architecture_views_updated_at
before update on architecture_views for each row execute function set_updated_at();

create index communications_review_idx on communications (user_id, purpose, message);
create index daemon_payloads_review_idx on daemon_payloads (user_id, kind, message);
create index agent_tasks_review_idx on agent_tasks (user_id, message, queue_sequence);
create index agent_tasks_client_review_idx on agent_tasks (user_id, updated_at, id)
where message = 'client_review';
create index daemon_events_review_idx on daemon_events (user_id, updated_at, id)
where message = 'client_review';
create index agent_output_history_archive_idx on agent_output_history (user_id, completed_at desc, id desc);
create index agent_output_history_recent_idx on agent_output_history (user_id, updated_at desc);
create index agent_output_history_repository_idx on agent_output_history (user_id, repository);
create index agent_output_history_features_idx on agent_output_history using gin (targeted_feature_paths);
create index agent_output_history_conversation_idx on agent_output_history (user_id, conversation_id, created_at, id);
create index architecture_views_daemon_review_idx on architecture_views (user_id, requested_at, id)
where message = 'daemon_review' and status in ('queued', 'running');
create index architecture_views_client_review_idx on architecture_views (user_id, updated_at, id)
where message = 'client_review';

create or replace function daemon_list_communication_reviews(p_user_id uuid)
returns table(purpose text, content text, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select communications.purpose, communications.content, communications.updated_at
  from communications
  where communications.user_id = p_user_id and communications.message = 'daemon_review'
    and communications.purpose in ('agent_prompt', 'git_sync_request', 'feature_file_load', 'parameter_file_load', 'parameter_file_update', 'entry_point_update')
  order by communications.purpose
  limit 6;
$$;

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
grant execute on function daemon_list_communication_reviews(uuid) to anon;

create or replace function daemon_upsert_agent_output_history(
  p_user_id uuid, p_prompt_id text, p_repository text, p_prompt text,
  p_output text, p_error text, p_provider text, p_model text, p_reasoning text,
  p_conversation_id text, p_mode text, p_targeted_feature_paths jsonb, p_status text,
  p_status_detail text default null, p_started_at timestamptz default null,
  p_completed_at timestamptz default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_mode not in ('planning', 'ask', 'bridge') then raise exception 'Direct prompt history only supports planning, ask, and bridge modes'; end if;
  if p_status not in ('running', 'completed', 'failed', 'cancelled') then raise exception 'Unsupported direct prompt history status: %', p_status; end if;
  if nullif(trim(p_prompt_id), '') is null then raise exception 'Prompt ID is required'; end if;
  insert into agent_output_history (
    user_id, prompt_id, conversation_id, repository, prompt, output, error, provider, model,
    reasoning, mode, source, targeted_feature_paths, status, status_detail,
    started_at, completed_at
  ) values (
    p_user_id, p_prompt_id, coalesce(nullif(trim(p_conversation_id), ''), p_prompt_id), p_repository, p_prompt, coalesce(p_output, ''),
    coalesce(p_error, ''), coalesce(p_provider, ''), coalesce(p_model, ''),
    coalesce(p_reasoning, ''), p_mode, 'direct_prompt',
    coalesce(p_targeted_feature_paths, '[]'::jsonb), p_status,
    left(p_status_detail, 500), coalesce(p_started_at, now()),
    case when p_status in ('completed', 'failed', 'cancelled') then coalesce(p_completed_at, now()) else p_completed_at end
  ) on conflict (user_id, prompt_id) do update set
    conversation_id = excluded.conversation_id, repository = excluded.repository, prompt = excluded.prompt,
    output = excluded.output, error = excluded.error, provider = excluded.provider,
    model = excluded.model, reasoning = excluded.reasoning, mode = excluded.mode,
    targeted_feature_paths = excluded.targeted_feature_paths,
    status = excluded.status, status_detail = excluded.status_detail,
    started_at = coalesce(agent_output_history.started_at, excluded.started_at),
    completed_at = excluded.completed_at, updated_at = now();
end;
$$;

revoke all on function daemon_upsert_agent_output_history(uuid, text, text, text, text, text, text, text, text, text, text, jsonb, text, text, timestamptz, timestamptz) from public;
grant execute on function daemon_upsert_agent_output_history(uuid, text, text, text, text, text, text, text, text, text, text, jsonb, text, text, timestamptz, timestamptz) to anon;

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
    user_id, prompt_id, task_id, conversation_id, repository, prompt, output, error, provider,
    model, reasoning, mode, source, targeted_feature_paths, status,
    status_detail, created_at, started_at, completed_at, updated_at
  ) values (
    new.user_id, new.id::text, new.id, coalesce(nullif(new.conversation_id, ''), new.id::text), new.repository, new.prompt,
    coalesce(new.result, ''), coalesce(new.error, ''), new.provider, new.model,
    new.reasoning, 'standard', 'durable_task', new.targeted_feature_paths,
    new.status, left(nullif(coalesce(new.error, ''), ''), 500), new.created_at,
    new.started_at, new.completed_at, new.updated_at
  ) on conflict (user_id, prompt_id) do update set
    task_id = excluded.task_id, conversation_id = excluded.conversation_id, repository = excluded.repository,
    prompt = excluded.prompt, output = excluded.output, error = excluded.error,
    provider = excluded.provider, model = excluded.model,
    reasoning = excluded.reasoning,
    targeted_feature_paths = excluded.targeted_feature_paths,
    status = excluded.status, status_detail = excluded.status_detail,
    started_at = excluded.started_at, completed_at = excluded.completed_at,
    updated_at = excluded.updated_at;
  if new.status = 'completed' and new.base_commit is not null and new.completed_commit is not null then
    insert into architecture_views (
      user_id, prompt_id, repository, base_commit, final_commit, targeted_feature_paths
    ) values (
      new.user_id, new.id::text, new.repository, new.base_commit,
      new.completed_commit, new.targeted_feature_paths
    ) on conflict (user_id, prompt_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger project_agent_task_history after insert or update on agent_tasks
for each row execute function project_agent_task_to_output_history();

create or replace function daemon_list_agent_tasks(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path = public as $$
  select * from agent_tasks where user_id = p_user_id and message = 'daemon_review'
  order by queue_sequence limit 100;
$$;

create or replace function daemon_update_agent_task(p_user_id uuid, p_task_id uuid, p_expected_status text, p_updates jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update agent_tasks set
    status = coalesce(p_updates->>'status', status),
    message = coalesce(p_updates->>'message', case when p_updates->>'status' in ('completed', 'failed', 'blocked', 'cancelled') then 'client_review' else message end),
    base_commit = coalesce(p_updates->>'base_commit', base_commit),
    completed_commit = coalesce(p_updates->>'completed_commit', completed_commit),
    branch_name = coalesce(p_updates->>'branch_name', branch_name),
    worktree_path = coalesce(p_updates->>'worktree_path', worktree_path),
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

grant execute on function daemon_list_agent_tasks(uuid) to anon;
grant execute on function daemon_update_agent_task(uuid, uuid, text, jsonb) to anon;

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
create index feature_execution_runs_client_review_idx on feature_execution_runs (user_id, updated_at, id)
where message = 'client_review';
create index feature_execution_runs_daemon_review_idx on feature_execution_runs (user_id, status, created_at)
where message = 'daemon_review';
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
  select * from feature_execution_runs
  where user_id = p_user_id and message = 'daemon_review' and status in ('queued', 'running')
  order by created_at limit 100;
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
  if not found then
    insert into daemon_manager_requests (user_id, message) values (owner_id, 'daemon_review') returning * into restart_request;
  else
    update daemon_manager_requests set message = 'daemon_review', updated_at = now()
    where id = restart_request.id returning * into restart_request;
  end if;
  insert into daemon_manager_state (user_id, state, accepts_work, active_request_id, status_detail, message)
  values (owner_id, 'draining', false, restart_request.id, 'Restart requested; waiting for accepted work.', 'client_review')
  on conflict (user_id) do update set
    state = case when daemon_manager_state.state = 'restarting' then 'restarting' else 'draining' end,
    accepts_work = false, active_request_id = restart_request.id, message = 'client_review',
    status_detail = case when daemon_manager_state.state = 'restarting' then daemon_manager_state.status_detail else 'Restart requested; waiting for accepted work.' end,
    updated_at = now();
  return to_jsonb(restart_request);
end;
$$;
create function cancel_execution_restart(request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cancelled_request daemon_manager_requests;
begin
  update daemon_manager_requests set status = 'cancelled', message = 'daemon_review', completed_at = now(), updated_at = now()
  where id = request_id and user_id = auth.uid() and status in ('requested', 'draining') returning * into cancelled_request;
  if not found then raise exception 'Restart can no longer be cancelled'; end if;
  update daemon_manager_state set state = 'running', accepts_work = true,
    status_detail = 'Restart cancelled.', message = 'client_review', updated_at = now()
  where user_id = auth.uid() and active_request_id = request_id and state = 'draining';
  if not found then raise exception 'Restart replacement has already begun'; end if;
  return to_jsonb(cancelled_request);
end;
$$;
create function daemon_manager_complete_control_request(p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid, p_expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update daemon_manager_requests manager_request set message = 'daemon_complete', updated_at = now()
  from daemon_manager_state manager_state
  where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status = 'cancelled' and manager_request.message = 'daemon_review'
    and manager_request.updated_at = p_expected_updated_at
    and manager_state.user_id = p_user_id and manager_state.manager_instance_id = p_manager_instance_id
    and manager_state.active_request_id = p_request_id;
  if not found then return false; end if;
  update daemon_manager_state set active_request_id = null, message = 'client_review', updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id and active_request_id = p_request_id;
  return found;
end;
$$;
create function get_daemon_manager_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when manager_state.user_id is null then null else jsonb_build_object(
    'state', manager_state.state, 'accepts_work', manager_state.accepts_work,
    'manager_heartbeat_at', manager_state.manager_heartbeat_at,
    'execution_process_id', manager_state.execution_process_id,
    'execution_generation', manager_state.execution_generation,
    'execution_started_at', manager_state.execution_started_at,
    'last_successful_restart_at', manager_state.last_successful_restart_at,
    'status_detail', manager_state.status_detail, 'updated_at', manager_state.updated_at,
    'activeRequest', case when manager_request.id is null then null else jsonb_build_object(
      'id', manager_request.id, 'status', manager_request.status, 'blockers', manager_request.blockers) end) end
  from (select auth.uid() user_id) owner
  left join daemon_manager_state manager_state on manager_state.user_id = owner.user_id and manager_state.message = 'client_review'
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
  insert into daemon_manager_state (user_id, manager_instance_id, manager_heartbeat_at, status_detail, message)
  values (p_user_id, p_manager_instance_id, now(), 'Manager connected.', 'client_review')
  on conflict (user_id) do update set manager_instance_id = excluded.manager_instance_id,
    manager_heartbeat_at = now(), message = 'client_review', updated_at = now()
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
    execution_started_at = p_execution_started_at, status_detail = coalesce(p_status_detail, status_detail),
    message = 'client_review', updated_at = now()
  where user_id = p_user_id and manager_instance_id = p_manager_instance_id;
  return found;
end;
$$;
create function daemon_manager_get_active_request(p_user_id uuid, p_manager_instance_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select case when manager_request.id is null then null else jsonb_build_object(
    'id', manager_request.id, 'status', manager_request.status,
    'updated_at', manager_request.updated_at) end
  from daemon_manager_state manager_state left join daemon_manager_requests manager_request
    on manager_request.id = manager_state.active_request_id and manager_request.message = 'daemon_review'
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
  select jsonb_build_object('total', agent_count + feature_count + communication_count,
    'agentTasks', agent_count, 'featureExecutions', feature_count,
    'communications', communication_counts,
    'identifiers', jsonb_build_object(
      'agentTasks', coalesce((select jsonb_agg(id order by queue_sequence) from (select id, queue_sequence from agent_tasks where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running','verifying','ready','integrating','resolving') order by queue_sequence limit 100) task_rows), '[]'::jsonb),
      'featureExecutions', coalesce((select jsonb_agg(id order by created_at) from (select id, created_at from feature_execution_runs where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running') order by created_at limit 100) run_rows), '[]'::jsonb),
      'communications', coalesce((select jsonb_agg(jsonb_build_object('purpose', purpose, 'updatedAt', updated_at) order by purpose) from communications where user_id = p_user_id and message = 'daemon_review' and purpose in ('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')), '[]'::jsonb)
    )) into result
  from (select
    (select count(*) from agent_tasks where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running','verifying','ready','integrating','resolving')) agent_count,
    (select count(*) from feature_execution_runs where user_id = p_user_id and message = 'daemon_review' and status in ('queued','running')) feature_count,
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
declare normalized jsonb;
begin
  normalized := jsonb_build_object(
    'total',coalesce((p_blockers->>'agentTasks')::integer,0)
      +coalesce((p_blockers->>'featureExecutions')::integer,0)
      +coalesce((p_blockers->>'architectureViews')::integer,0)
      +coalesce((select sum(value::integer) from jsonb_each_text(coalesce(p_blockers->'communications','{}'))),0),
    'agentTasks',coalesce((p_blockers->>'agentTasks')::integer,0),
    'featureExecutions',coalesce((p_blockers->>'featureExecutions')::integer,0),
    'architectureViews',coalesce((p_blockers->>'architectureViews')::integer,0),
    'communications',coalesce(p_blockers->'communications','{}'),
    'identifiers',coalesce(p_blockers->'identifiers','{}')
  );
  update daemon_manager_requests manager_request set blockers = normalized, updated_at = now()
  from daemon_manager_state manager_state where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status = 'draining' and manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id and manager_state.active_request_id = p_request_id;
  return found;
end;
$$;
create function daemon_manager_begin_restart(p_user_id uuid, p_manager_instance_id uuid, p_request_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_blockers jsonb;
begin
  v_blockers := daemon_manager_get_drain_summary(p_user_id, p_manager_instance_id);
  if (v_blockers->>'total')::integer <> 0 then return false; end if;
  update daemon_manager_requests manager_request set status = 'restarting', blockers = v_blockers, restart_started_at = now(), updated_at = now()
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
  update daemon_manager_requests manager_request set status = 'completed', message = 'daemon_complete', completed_at = now(), failure_detail = null, updated_at = now()
  from daemon_manager_state manager_state where manager_request.id = p_request_id and manager_request.user_id = p_user_id
    and manager_request.status = 'restarting' and manager_state.user_id = p_user_id
    and manager_state.manager_instance_id = p_manager_instance_id and manager_state.active_request_id = p_request_id;
  if not found then return false; end if;
  update daemon_manager_state set state = 'running', accepts_work = true, active_request_id = null,
    execution_generation = execution_generation + 1, last_successful_restart_at = now(),
    status_detail = 'Execution restart completed.', message = 'client_review', manager_heartbeat_at = now(), updated_at = now()
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
revoke all on function daemon_manager_complete_control_request(uuid, uuid, uuid, timestamptz) from public;
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
grant execute on function daemon_manager_complete_control_request(uuid, uuid, uuid, timestamptz) to anon;

-- Task failure recovery.
alter table agent_tasks add column if not exists retry_generation integer not null default 0;
create table if not exists agent_task_deletion_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null, prompt_id text not null,
  expected_updated_at timestamptz not null, message text not null default 'daemon_review' check (message in ('daemon_review','client_review','client_complete','daemon_complete')),
  status text not null default 'requested' check (status in ('requested','completed','rejected')),
  error text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, task_id, expected_updated_at)
);
alter table agent_task_deletion_requests enable row level security;
create policy "authenticated users can read own task deletion requests" on agent_task_deletion_requests for select to authenticated using (user_id = auth.uid());
create index if not exists agent_task_deletion_requests_daemon_review_idx on agent_task_deletion_requests (user_id, created_at, id) where message='daemon_review';
-- Browser deletion-refresh read model.  Reads remain protected by the owner-only
-- policy above; this only supports bounded unresolved/recent lifecycle queries.
create index if not exists agent_task_deletion_requests_viewer_state_idx
  on agent_task_deletion_requests (user_id, updated_at desc, id)
  where status in ('requested', 'completed', 'rejected');
grant select on agent_task_deletion_requests to authenticated;
-- Daemon completion is invoked only after the daemon confirms the task worktree
-- is absent; the guarded delete below keeps task/history deletion revision-safe.
create or replace function daemon_complete_task_deletion(p_user_id uuid, p_request_id uuid, p_error text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare request_row agent_task_deletion_requests%rowtype;
begin
  select * into request_row from agent_task_deletion_requests where id=p_request_id and user_id=p_user_id and message='daemon_review' for update;
  if not found then return false; end if;
  if p_error <> '' then
    update agent_task_deletion_requests set status='rejected',error=p_error,message='client_review',updated_at=now() where id=p_request_id;
    return true;
  end if;
  delete from agent_tasks where id=request_row.task_id and user_id=p_user_id and updated_at=request_row.expected_updated_at and status in ('completed','failed','blocked','cancelled');
  if not found then
    update agent_task_deletion_requests set status='rejected',error='Task changed before deletion could be completed.',message='client_review',updated_at=now() where id=p_request_id;
    return true;
  end if;
  delete from agent_output_history where user_id=p_user_id and prompt_id=request_row.prompt_id;
  update agent_task_deletion_requests set status='completed',error='',message='client_review',updated_at=now() where id=p_request_id;
  return true;
end; $$;
-- Final Architecture View progress inbox/acknowledgement overrides.
alter function get_client_review_inbox() rename to get_client_review_inbox_032_previous;
create function get_client_review_inbox() returns jsonb language sql stable security definer set search_path=public as $$
 with owner as(select auth.uid() user_id)select jsonb_set(previous.inbox,'{architectureProgressEvents}',coalesce((select jsonb_agg(to_jsonb(r)order by created_at,id)from(select id,architecture_view_id,generation,stage,stage_order,attempt,total_attempts,detail,created_at,updated_at from architecture_view_progress_events,owner where architecture_view_progress_events.user_id=owner.user_id and message='client_review' order by created_at,id limit 50)r),'[]'::jsonb))from(select get_client_review_inbox_032_previous() inbox)previous;
$$;
revoke all on function get_client_review_inbox()from public;grant execute on function get_client_review_inbox()to authenticated;
alter function acknowledge_client_reviews(jsonb) rename to acknowledge_client_reviews_032_previous;
create function acknowledge_client_reviews(receipts jsonb)returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid();r jsonb;rid text;ok jsonb:='[]'::jsonb;stale jsonb:='[]'::jsonb;begin
 if owner_id is null then raise exception 'Authentication required';end if;if jsonb_typeof(receipts)<>'array'then raise exception 'Receipts must be an array';end if;
 for r in select value from jsonb_array_elements(receipts)loop rid:=coalesce(r->>'receiptId','');if r->>'transport'='architectureProgressEvents'then update architecture_view_progress_events set message='client_complete'where user_id=owner_id and id=(r->>'key')::uuid and generation=(r->>'generation')::integer and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;else perform 1 from acknowledge_client_reviews_032_previous(jsonb_build_array(r));if found then ok:=ok||jsonb_build_array(rid);else stale:=stale||jsonb_build_array(rid);end if;continue;end if;if found then ok:=ok||jsonb_build_array(rid);else stale:=stale||jsonb_build_array(rid);end if;end loop;return jsonb_build_object('acknowledged',ok,'rejected',stale);end;$$;
revoke all on function acknowledge_client_reviews(jsonb)from public;grant execute on function acknowledge_client_reviews(jsonb)to authenticated;

-- The authoritative recovery RPC, inbox, acknowledgement, and daemon helpers are
-- intentionally defined in the ordered migration so deployed schemas receive one atomic replacement.

-- Consolidated recurrent egress interfaces (migration 027).
create function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path = public as $$
  with owner as (select auth.uid() user_id)
  select jsonb_build_object(
    'communications', coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (select communications.purpose,communications.content,communications.updated_at from communications,owner where communications.user_id=owner.user_id and communications.message='client_review' order by communications.purpose limit 10) r),'[]'),
    'daemonPayloads', coalesce((select jsonb_agg(to_jsonb(r) order by kind) from (select daemon_payloads.kind,daemon_payloads.payload,daemon_payloads.updated_at from daemon_payloads,owner where daemon_payloads.user_id=owner.user_id and daemon_payloads.message='client_review' order by daemon_payloads.kind limit 3) r),'[]'),
    'agentTasks', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select agent_tasks.id,agent_tasks.repository,agent_tasks.prompt,agent_tasks.provider,agent_tasks.model,agent_tasks.reasoning,agent_tasks.planning_mode,agent_tasks.targeted_feature_paths,agent_tasks.status,agent_tasks.queue_sequence,agent_tasks.created_at,agent_tasks.started_at,agent_tasks.completed_at,agent_tasks.error,agent_tasks.verification_attempts,agent_tasks.cancel_requested,agent_tasks.updated_at from agent_tasks,owner where agent_tasks.user_id=owner.user_id and agent_tasks.message='client_review' order by agent_tasks.updated_at,agent_tasks.id limit 50) r),'[]'),
    'featureExecutionRuns', coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select feature_execution_runs.id,feature_execution_runs.project_directory,feature_execution_runs.feature_file_path,feature_execution_runs.status,feature_execution_runs.cancel_requested,feature_execution_runs.command,feature_execution_runs.parameter_file_path,feature_execution_runs.entry_point_path,feature_execution_runs.started_at,feature_execution_runs.completed_at,feature_execution_runs.exit_code,feature_execution_runs.stdout_tail,feature_execution_runs.stderr_tail,feature_execution_runs.error,feature_execution_runs.updated_at from feature_execution_runs,owner where feature_execution_runs.user_id=owner.user_id and feature_execution_runs.message='client_review' order by feature_execution_runs.updated_at,feature_execution_runs.id limit 50) r),'[]'),
    'daemonEvents', coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (select daemon_events.id,daemon_events.severity,daemon_events.content,daemon_events.created_at from daemon_events,owner where daemon_events.user_id=owner.user_id and daemon_events.message='client_review' order by daemon_events.created_at,daemon_events.id limit 50) r),'[]'),
    'managerStatus',(select case when s.user_id is null then null else jsonb_build_object('state',s.state,'accepts_work',s.accepts_work,'manager_heartbeat_at',s.manager_heartbeat_at,'execution_process_id',s.execution_process_id,'execution_generation',s.execution_generation,'execution_started_at',s.execution_started_at,'last_successful_restart_at',s.last_successful_restart_at,'status_detail',s.status_detail,'updated_at',s.updated_at,'activeRequest',case when q.id is null then null else jsonb_build_object('id',q.id,'status',q.status,'blockers',q.blockers) end) end from owner left join daemon_manager_state s on s.user_id=owner.user_id and s.message='client_review' left join daemon_manager_requests q on q.id=s.active_request_id)
  );
$$;
revoke all on function get_client_review_inbox() from public;
grant execute on function get_client_review_inbox() to authenticated;

-- Conversation-scoped Agent History (migration 044 snapshot).
create table if not exists agent_conversations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  repository text not null default '', legacy_conversation_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, legacy_conversation_id)
);
alter table agent_tasks add column if not exists prompt_id text;
alter table agent_tasks add column if not exists task_type text not null default 'implementation';
alter table agent_tasks add column if not exists source text not null default 'durable_task';
alter table agent_tasks add column if not exists status_detail text not null default '';
alter table agent_tasks rename column conversation_id to legacy_conversation_id;
alter table agent_tasks add column conversation_id uuid references agent_conversations(id) on delete cascade;
create table if not exists agent_conversation_deletion_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null, message text not null default 'daemon_review', status text not null default 'requested',
  error text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, conversation_id, status)
);
create table if not exists agent_conversation_deletion_request_items (
  request_id uuid not null references agent_conversation_deletion_requests(id) on delete cascade,
  task_id uuid not null, expected_updated_at timestamptz not null, primary key(request_id, task_id)
);
alter table architecture_views add column if not exists task_id uuid references agent_tasks(id) on delete cascade;
-- See migration 044 for the backfill, RLS, conversation read APIs, and atomic
-- conversation-deletion RPC implementations.

create function acknowledge_client_reviews(receipts jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); r jsonb; rid text; ok jsonb:='[]'; stale jsonb:='[]';
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(receipts)<>'array' then raise exception 'Receipts must be an array'; end if;
  for r in select value from jsonb_array_elements(receipts) loop rid:=coalesce(r->>'receiptId','');
    case r->>'transport'
    when 'communications' then update communications set message='client_complete' where user_id=owner_id and purpose=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
    when 'daemonPayloads' then update daemon_payloads set message='client_complete' where user_id=owner_id and kind=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
    when 'agentTasks' then update agent_tasks set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
    when 'featureExecutionRuns' then update feature_execution_runs set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
    when 'managerStatus' then update daemon_manager_state set message='client_complete' where user_id=owner_id and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
    when 'daemonEvents' then update daemon_events set message='client_complete' where user_id=owner_id and id=(r->>'key')::bigint and message='client_review';
    else stale:=stale||jsonb_build_array(rid); continue; end case;
    if found then ok:=ok||jsonb_build_array(rid); else stale:=stale||jsonb_build_array(rid); end if;
  end loop; return jsonb_build_object('acknowledged',ok,'rejected',stale);
end; $$;

create or replace function daemon_poll_work(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare claimed_id uuid;result jsonb;begin
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id)then raise exception 'Invalid daemon user scope';end if;
 select id into claimed_id from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status='queued' and not cancel_requested order by created_at,id for update skip locked limit 1;
 if claimed_id is not null then update feature_execution_runs set status='running',started_at=now(),updated_at=now() where id=claimed_id;end if;
 select jsonb_build_object(
 'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose)from(select purpose,content,updated_at from communications where user_id=p_user_id and message='daemon_review' and purpose in('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')order by purpose limit 6)r),'[]'),
 'agentTasks',coalesce((select jsonb_agg(to_jsonb(task) order by task.queue_sequence) from daemon_list_agent_tasks(p_user_id) task),'[]'),
 'architectureViews',coalesce((select jsonb_agg(to_jsonb(r)order by requested_at,id)from(select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,status,requested_at,updated_at from architecture_views where user_id=p_user_id and message='daemon_review' and status in('queued','running')order by requested_at,id limit 10)r),'[]'),
 'featureRunControls',coalesce((select jsonb_agg(to_jsonb(r)order by created_at,id)from(select id,status,cancel_requested,created_at from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status in('queued','running')and id is distinct from claimed_id order by created_at,id limit 100)r),'[]'),
 'claimedFeatureRun',(select case when r.id is null then null else to_jsonb(r)end from(select id,project_directory,feature_file_path,status,cancel_requested from feature_execution_runs where id=claimed_id)r))into result;return result;
end; $$;

create or replace function daemon_manager_get_drain_summary(p_user_id uuid,p_manager_instance_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;begin
 if not exists(select 1 from daemon_manager_state where user_id=p_user_id and manager_instance_id=p_manager_instance_id)then raise exception 'Manager lease is not owned';end if;
 select jsonb_build_object('total',agent_count+feature_count+architecture_count+communication_count,'agentTasks',agent_count,'featureExecutions',feature_count,'architectureViews',architecture_count,'communications',communication_counts,'identifiers',jsonb_build_object(
 'agentTasks',coalesce((select jsonb_agg(id order by queue_sequence)from(select id,queue_sequence from agent_tasks where user_id=p_user_id and message='daemon_review' and status in('queued','running','verifying','ready','integrating','resolving')order by queue_sequence limit 100)r),'[]'),
 'featureExecutions',coalesce((select jsonb_agg(id order by created_at)from(select id,created_at from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status in('queued','running')order by created_at limit 100)r),'[]'),
 'architectureViews',coalesce((select jsonb_agg(id order by requested_at,id)from(select id,requested_at from architecture_views where user_id=p_user_id and message='daemon_review' and status in('queued','running')order by requested_at,id limit 10)r),'[]'),
 'communications',coalesce((select jsonb_agg(jsonb_build_object('purpose',purpose,'updatedAt',updated_at)order by purpose)from communications where user_id=p_user_id and message='daemon_review' and purpose in('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')),'[]')))into result
 from(select(select count(*)from agent_tasks where user_id=p_user_id and message='daemon_review' and status in('queued','running','verifying','ready','integrating','resolving'))agent_count,(select count(*)from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status in('queued','running'))feature_count,(select count(*)from architecture_views where user_id=p_user_id and message='daemon_review' and status in('queued','running'))architecture_count,(select count(*)from communications where user_id=p_user_id and message='daemon_review' and purpose in('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'))communication_count,coalesce((select jsonb_object_agg(purpose,purpose_count)from(select purpose,count(*)purpose_count from communications where user_id=p_user_id and message='daemon_review' and purpose in('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')group by purpose)groups),'{}')communication_counts)counts;return result;
end; $$;

-- Final Architecture View progress inbox/acknowledgement overrides.
alter function get_client_review_inbox() rename to get_client_review_inbox_032_final_previous;
create function get_client_review_inbox() returns jsonb language sql stable security definer set search_path=public as $$
 with owner as(select auth.uid() user_id)select jsonb_set(previous.inbox,'{architectureProgressEvents}',coalesce((select jsonb_agg(to_jsonb(r)order by created_at,id)from(select id,architecture_view_id,generation,stage,stage_order,attempt,total_attempts,detail,created_at,updated_at from architecture_view_progress_events,owner where architecture_view_progress_events.user_id=owner.user_id and message='client_review' order by created_at,id limit 50)r),'[]'::jsonb))from(select get_client_review_inbox_032_final_previous() inbox)previous;
$$;
revoke all on function get_client_review_inbox()from public;grant execute on function get_client_review_inbox()to authenticated;
alter function acknowledge_client_reviews(jsonb) rename to acknowledge_client_reviews_032_final_previous;
create function acknowledge_client_reviews(receipts jsonb)returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid();r jsonb;rid text;ok jsonb:='[]'::jsonb;stale jsonb:='[]'::jsonb;begin
 if owner_id is null then raise exception 'Authentication required';end if;if jsonb_typeof(receipts)<>'array'then raise exception 'Receipts must be an array';end if;
 for r in select value from jsonb_array_elements(receipts)loop rid:=coalesce(r->>'receiptId','');if r->>'transport'='architectureProgressEvents'then update architecture_view_progress_events set message='client_complete'where user_id=owner_id and id=(r->>'key')::uuid and generation=(r->>'generation')::integer and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;else perform 1 from acknowledge_client_reviews_032_final_previous(jsonb_build_array(r));if found then ok:=ok||jsonb_build_array(rid);else stale:=stale||jsonb_build_array(rid);end if;continue;end if;if found then ok:=ok||jsonb_build_array(rid);else stale:=stale||jsonb_build_array(rid);end if;end loop;return jsonb_build_object('acknowledged',ok,'rejected',stale);end;$$;
revoke all on function acknowledge_client_reviews(jsonb)from public;grant execute on function acknowledge_client_reviews(jsonb)to authenticated;

-- Manager tick snapshot retained before later architecture migration snapshots.
-- Manager tick snapshot retained before later architecture migration snapshots.
-- Final Architecture View progress inbox/acknowledgement overrides.
alter function get_client_review_inbox() rename to get_client_review_inbox_032_latest_previous;
create function get_client_review_inbox() returns jsonb language sql stable security definer set search_path=public as $$
 with owner as(select auth.uid() user_id)select jsonb_set(previous.inbox,'{architectureProgressEvents}',coalesce((select jsonb_agg(to_jsonb(r)order by created_at,id)from(select id,architecture_view_id,generation,stage,stage_order,attempt,total_attempts,detail,created_at,updated_at from architecture_view_progress_events,owner where architecture_view_progress_events.user_id=owner.user_id and message='client_review' order by created_at,id limit 50)r),'[]'::jsonb))from(select get_client_review_inbox_032_latest_previous() inbox)previous;
$$;
revoke all on function get_client_review_inbox()from public;grant execute on function get_client_review_inbox()to authenticated;
alter function acknowledge_client_reviews(jsonb) rename to acknowledge_client_reviews_032_latest_previous;
create function acknowledge_client_reviews(receipts jsonb)returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid();r jsonb;rid text;ok jsonb:='[]'::jsonb;stale jsonb:='[]'::jsonb;begin
 if owner_id is null then raise exception 'Authentication required';end if;if jsonb_typeof(receipts)<>'array'then raise exception 'Receipts must be an array';end if;
 for r in select value from jsonb_array_elements(receipts)loop rid:=coalesce(r->>'receiptId','');if r->>'transport'='architectureProgressEvents'then update architecture_view_progress_events set message='client_complete'where user_id=owner_id and id=(r->>'key')::uuid and generation=(r->>'generation')::integer and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;else perform 1 from acknowledge_client_reviews_032_latest_previous(jsonb_build_array(r));if found then ok:=ok||jsonb_build_array(rid);else stale:=stale||jsonb_build_array(rid);end if;continue;end if;if found then ok:=ok||jsonb_build_array(rid);else stale:=stale||jsonb_build_array(rid);end if;end loop;return jsonb_build_object('acknowledged',ok,'rejected',stale);end;$$;
revoke all on function acknowledge_client_reviews(jsonb)from public;grant execute on function acknowledge_client_reviews(jsonb)to authenticated;

create or replace function daemon_manager_tick(p_user_id uuid,p_manager_instance_id uuid,p_execution_process_id integer,p_execution_started_at timestamptz,p_status_detail text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;begin
 update daemon_manager_state set manager_heartbeat_at=now(),execution_process_id=p_execution_process_id,execution_started_at=p_execution_started_at,status_detail=coalesce(p_status_detail,status_detail),message='client_review',updated_at=now()where user_id=p_user_id and manager_instance_id=p_manager_instance_id;if not found then raise exception 'Manager lease ownership was lost';end if;
 select jsonb_build_object('activeRequest',case when q.id is null then null else jsonb_build_object('id',q.id,'status',q.status,'updated_at',q.updated_at)end,'drainSummary',case when q.status<>'draining' then null else daemon_manager_get_drain_summary(p_user_id,p_manager_instance_id)end)into result from daemon_manager_state s left join daemon_manager_requests q on q.id=s.active_request_id and q.message='daemon_review' where s.user_id=p_user_id and s.manager_instance_id=p_manager_instance_id;return result;
end; $$;


-- Confirmed direct-prompt archive deletion.  A null return means that no owned,
-- terminal direct-prompt history row was eligible for deletion.
create or replace function delete_terminal_direct_prompt_agent_output_history(p_prompt_id text)
returns text language plpgsql security definer set search_path = public as $$
declare deleted_prompt_id text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 delete from agent_output_history
 where user_id=auth.uid() and prompt_id=p_prompt_id and source='direct_prompt'
   and status in ('completed','failed','blocked','cancelled')
 returning prompt_id into deleted_prompt_id;
 return deleted_prompt_id;
end;
$$;
revoke all on function delete_terminal_direct_prompt_agent_output_history(text) from public;
grant execute on function delete_terminal_direct_prompt_agent_output_history(text) to authenticated;

-- Task-scoped integration compatibility contract (migration 038 snapshot).
create or replace function daemon_update_agent_task(p_user_id uuid,p_task_id uuid,p_expected_status text,p_updates jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update agent_tasks set status=coalesce(p_updates->>'status',status),message=coalesce(p_updates->>'message',case when p_updates->>'status'in('completed','failed','blocked','cancelled')then'client_review'else message end),base_commit=coalesce(p_updates->>'base_commit',base_commit),completed_commit=coalesce(p_updates->>'completed_commit',completed_commit),branch_name=coalesce(p_updates->>'branch_name',branch_name),worktree_path=coalesce(p_updates->>'worktree_path',worktree_path),result=coalesce(p_updates->>'result',result),error=coalesce(p_updates->>'error',error),verification_attempts=coalesce((p_updates->>'verification_attempts')::integer,verification_attempts),resolver_attempts=coalesce((p_updates->>'resolver_attempts')::integer,resolver_attempts),cancel_requested=coalesce((p_updates->>'cancel_requested')::boolean,cancel_requested),started_at=case when p_updates?'started_at'then(p_updates->>'started_at')::timestamptz else started_at end,completed_at=case when p_updates?'completed_at'then(p_updates->>'completed_at')::timestamptz else completed_at end,updated_at=now()
 where id=p_task_id and user_id=p_user_id and status=p_expected_status;return found;
end; $$;

create or replace function request_agent_task_retry(p_task_id uuid,p_expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update agent_tasks set status=case status when'failed'then'queued'when'blocked'then'ready'end,message='daemon_review',cancel_requested=false,completed_at=null,retry_generation=retry_generation+1,resolver_attempts=case when status='blocked'then 0 else resolver_attempts end,updated_at=now()
 where id=p_task_id and user_id=auth.uid()and updated_at=p_expected_updated_at and status in('failed','blocked')and worktree_path is not null and branch_name is not null;return found;
end; $$;

create or replace function daemon_list_task_integration_work(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path=public as $$
 select task.* from agent_tasks task where task.user_id=p_user_id and task.message='daemon_review'order by task.queue_sequence limit 100;
$$;

create or replace function daemon_poll_task_work(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare claimed_id uuid;result jsonb;begin
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id)then raise exception'Invalid daemon user scope';end if;
 select id into claimed_id from feature_execution_runs where user_id=p_user_id and message='daemon_review'and status='queued'and not cancel_requested order by created_at,id for update skip locked limit 1;
 if claimed_id is not null then update feature_execution_runs set status='running',started_at=now(),updated_at=now()where id=claimed_id;end if;
 select jsonb_build_object('communications',coalesce((select jsonb_agg(to_jsonb(r)order by purpose)from(select purpose,content,updated_at from communications where user_id=p_user_id and message='daemon_review'and purpose in('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')order by purpose limit 6)r),'[]'),'agentTasks',coalesce((select jsonb_agg(to_jsonb(task)order by task.queue_sequence)from daemon_list_task_integration_work(p_user_id)task),'[]'),'architectureViews',coalesce((select jsonb_agg(to_jsonb(r)order by requested_at,id)from(select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,status,requested_at,updated_at from architecture_views where user_id=p_user_id and message='daemon_review'and status in('queued','running')order by requested_at,id limit 10)r),'[]'),'featureRunControls',coalesce((select jsonb_agg(to_jsonb(r)order by created_at,id)from(select id,status,cancel_requested,created_at from feature_execution_runs where user_id=p_user_id and message='daemon_review'and status in('queued','running')and id is distinct from claimed_id order by created_at,id limit 100)r),'[]'),'claimedFeatureRun',(select case when r.id is null then null else to_jsonb(r)end from(select id,project_directory,feature_file_path,status,cancel_requested from feature_execution_runs where id=claimed_id)r))into result;return result;
end; $$;

create or replace function daemon_record_task_event(p_user_id uuid,p_repository text,p_task_id uuid,p_severity text,p_message text,p_event_type text default'status')
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_event_type not in('status','task_integrated','migration_deployment_started','migration_deployment_no_pending','migration_deployment_succeeded','migration_deployment_blocked')then raise exception'Unsupported daemon task event type: %',p_event_type;end if;
 insert into daemon_events(user_id,repository,task_id,severity,event_type,message,content)values(p_user_id,p_repository,p_task_id,p_severity,p_event_type,'client_review',p_message);
end; $$;

revoke all on function daemon_list_task_integration_work(uuid) from public;
revoke all on function daemon_poll_task_work(uuid) from public;
revoke all on function daemon_record_task_event(uuid,text,uuid,text,text,text) from public;
grant execute on function daemon_list_task_integration_work(uuid) to anon;
grant execute on function daemon_poll_task_work(uuid) to anon;
grant execute on function daemon_record_task_event(uuid,text,uuid,text,text,text) to anon;
grant execute on function request_agent_task_retry(uuid,timestamptz) to authenticated;

-- Final Agent Output Viewer reliability definitions.
create or replace function ensure_agent_task_terminal_timestamp()
returns trigger language plpgsql as $$
begin
 if new.status in('completed','failed','blocked','cancelled')then new.completed_at:=coalesce(new.completed_at,now());end if;
 return new;
end;$$;
create trigger ensure_agent_task_terminal_timestamp before insert or update of status,completed_at on agent_tasks for each row execute function ensure_agent_task_terminal_timestamp();

create or replace function acknowledge_client_reviews(receipts jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid();r jsonb;rid text;ok jsonb:='[]';stale jsonb:='[]';begin
 if owner_id is null or jsonb_typeof(receipts)<>'array'then raise exception 'Authentication required with receipt array';end if;
 for r in select value from jsonb_array_elements(receipts)loop rid:=coalesce(r->>'receiptId','');case r->>'transport'
 when 'communications'then update communications set message='client_complete'where user_id=owner_id and purpose=r->>'key'and message='client_review'and updated_at=(r->>'updatedAt')::timestamptz;
 when 'daemonPayloads'then update daemon_payloads set message='client_complete'where user_id=owner_id and kind=r->>'key'and message='client_review'and updated_at=(r->>'updatedAt')::timestamptz;
 when 'agentTasks'then update agent_tasks set message='client_complete'where user_id=owner_id and id=(r->>'key')::uuid and message='client_review'and updated_at=(r->>'updatedAt')::timestamptz;
 when 'taskDeletionRequests'then update agent_task_deletion_requests set message='client_complete'where user_id=owner_id and id=(r->>'key')::uuid and message='client_review'and updated_at=(r->>'updatedAt')::timestamptz;
 when 'architectureViews'then update architecture_views set message='client_complete'where user_id=owner_id and id=(r->>'key')::uuid and generation=(r->>'generation')::integer and message='client_review'and updated_at=(r->>'updatedAt')::timestamptz;
 when 'architectureProgressEvents'then update architecture_view_progress_events set message='client_complete'where user_id=owner_id and id=(r->>'key')::uuid and generation=(r->>'generation')::integer and message='client_review'and updated_at=(r->>'updatedAt')::timestamptz;
 when 'featureExecutionRuns'then update feature_execution_runs set message='client_complete'where user_id=owner_id and id=(r->>'key')::uuid and message='client_review'and updated_at=(r->>'updatedAt')::timestamptz;
 when 'daemonEvents'then update daemon_events set message='client_complete'where user_id=owner_id and id=(r->>'key')::bigint and message='client_review'and updated_at=(r->>'updatedAt')::timestamptz;
 when 'managerStatus'then update daemon_manager_state set message='client_complete'where user_id=owner_id and message='client_review'and updated_at=(r->>'updatedAt')::timestamptz;
 else continue;end case;if found then ok:=ok||jsonb_build_array(rid);else stale:=stale||jsonb_build_array(rid);end if;end loop;return jsonb_build_object('acknowledged',ok,'rejected',stale);end;$$;
revoke all on function acknowledge_client_reviews(jsonb)from public;grant execute on function acknowledge_client_reviews(jsonb)to authenticated;

create or replace function daemon_list_agent_tasks(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path = public as $$
  select task.* from agent_tasks task
  where task.user_id = p_user_id and task.message = 'daemon_review'
  order by task.queue_sequence limit 100;
$$;

grant execute on function daemon_list_agent_tasks(uuid) to anon;

-- Architecture View generation progress (migration 033 snapshot).
create table architecture_view_progress_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,
 architecture_view_id uuid not null references architecture_views(id) on delete cascade,
 generation integer not null check(generation>=1),stage text not null check(stage in('queued','preparing_snapshot','collecting_evidence','generating_document','validating_document','correcting_document','finalizing')),
 stage_order integer not null check(stage_order between 1 and 7),attempt integer check(attempt is null or attempt>=1),total_attempts integer check(total_attempts is null or total_attempts>=1),detail text not null default '',
 message text not null default 'client_review' check(message in('daemon_review','client_review','client_complete','daemon_complete')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(attempt is null or total_attempts is null or attempt<=total_attempts)
);
alter table architecture_view_progress_events enable row level security;
revoke all on architecture_view_progress_events from anon,authenticated;
grant select on architecture_view_progress_events to authenticated;
create policy "authenticated users can read own architecture progress" on architecture_view_progress_events for select to authenticated using(user_id=auth.uid());
create index architecture_progress_daemon_review_idx on architecture_view_progress_events(user_id,created_at,id)where message='daemon_review';
create index architecture_progress_client_review_idx on architecture_view_progress_events(user_id,created_at,id)where message='client_review';
create trigger set_architecture_view_progress_events_updated_at before update on architecture_view_progress_events for each row execute function set_updated_at();

create function daemon_publish_architecture_progress_event(p_user_id uuid,p_view_id uuid,p_generation integer,p_stage text,p_detail text default '',p_attempt integer default null,p_total_attempts integer default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare stage_position integer;begin
 stage_position:=case p_stage when 'queued' then 1 when 'preparing_snapshot' then 2 when 'collecting_evidence' then 3 when 'generating_document' then 4 when 'validating_document' then 5 when 'correcting_document' then 6 when 'finalizing' then 7 else null end;
 if stage_position is null then raise exception 'Unsupported architecture progress stage: %',p_stage;end if;
 if not exists(select 1 from architecture_views where id=p_view_id and user_id=p_user_id and generation=p_generation and status='running' and message='daemon_review')then return false;end if;
 insert into architecture_view_progress_events(user_id,architecture_view_id,generation,stage,stage_order,attempt,total_attempts,detail,message)values(p_user_id,p_view_id,p_generation,p_stage,stage_position,p_attempt,p_total_attempts,left(coalesce(p_detail,''),240),'client_review');return true;
end; $$;
revoke all on function daemon_publish_architecture_progress_event(uuid,uuid,integer,text,text,integer,integer)from public;
grant execute on function daemon_publish_architecture_progress_event(uuid,uuid,integer,text,text,integer,integer)to anon;

alter function get_client_review_inbox() rename to get_client_review_inbox_previous;
create function get_client_review_inbox() returns jsonb language sql stable security definer set search_path=public as $$
 with owner as(select auth.uid() user_id)select jsonb_set(previous.inbox,'{architectureProgressEvents}',coalesce((select jsonb_agg(to_jsonb(r)order by created_at,id)from(select id,architecture_view_id,generation,stage,stage_order,attempt,total_attempts,detail,created_at,updated_at from architecture_view_progress_events,owner where architecture_view_progress_events.user_id=owner.user_id and message='client_review' order by created_at,id limit 50)r),'[]'::jsonb))from(select get_client_review_inbox_previous() inbox)previous;
$$;
revoke all on function get_client_review_inbox()from public;grant execute on function get_client_review_inbox()to authenticated;

alter function acknowledge_client_reviews(jsonb) rename to acknowledge_client_reviews_previous;
create function acknowledge_client_reviews(receipts jsonb)returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid();r jsonb;rid text;ok jsonb:='[]'::jsonb;stale jsonb:='[]'::jsonb;begin
 if owner_id is null then raise exception 'Authentication required';end if;if jsonb_typeof(receipts)<>'array'then raise exception 'Receipts must be an array';end if;
 for r in select value from jsonb_array_elements(receipts)loop rid:=coalesce(r->>'receiptId','');if r->>'transport'='architectureProgressEvents'then update architecture_view_progress_events set message='client_complete'where user_id=owner_id and id=(r->>'key')::uuid and generation=(r->>'generation')::integer and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;else perform 1 from acknowledge_client_reviews_previous(jsonb_build_array(r));if found then ok:=ok||jsonb_build_array(rid);else stale:=stale||jsonb_build_array(rid);end if;continue;end if;if found then ok:=ok||jsonb_build_array(rid);else stale:=stale||jsonb_build_array(rid);end if;end loop;return jsonb_build_object('acknowledged',ok,'rejected',stale);end;$$;
revoke all on function acknowledge_client_reviews(jsonb)from public;grant execute on function acknowledge_client_reviews(jsonb)to authenticated;
revoke all on function acknowledge_client_reviews(jsonb) from public;
grant execute on function acknowledge_client_reviews(jsonb) to authenticated;

create or replace function daemon_poll_work(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare claimed_id uuid; result jsonb;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Invalid daemon user scope'; end if;
  select id into claimed_id from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status='queued' and not cancel_requested order by created_at,id for update skip locked limit 1;
  if claimed_id is not null then update feature_execution_runs set status='running',started_at=now(),updated_at=now() where id=claimed_id; end if;
  select jsonb_build_object(
    'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (select purpose,content,updated_at from communications where user_id=p_user_id and message='daemon_review' and purpose in('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update') order by purpose limit 6) r),'[]'),
    'agentTasks',coalesce((select jsonb_agg(to_jsonb(r) order by queue_sequence) from (select id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,status,queue_sequence,base_commit,branch_name,worktree_path,error,verification_attempts,resolver_attempts,cancel_requested,created_at,started_at,completed_at,updated_at from agent_tasks where user_id=p_user_id and message='daemon_review' order by queue_sequence limit 100) r),'[]'),
    'featureRunControls',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (select id,status,cancel_requested,created_at from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status in('queued','running') and id is distinct from claimed_id order by created_at,id limit 100) r),'[]'),
    'claimedFeatureRun',(select case when r.id is null then null else to_jsonb(r) end from (select id,project_directory,feature_file_path,status,cancel_requested from feature_execution_runs where id=claimed_id) r)
  ) into result; return result;
end; $$;
revoke all on function daemon_poll_work(uuid) from public;
grant execute on function daemon_poll_work(uuid) to anon;

create function daemon_get_agent_task_control(p_user_id uuid,p_task_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select case when t.id is null then null else jsonb_build_object('id',t.id,'status',t.status,'cancel_requested',t.cancel_requested,'updated_at',t.updated_at) end from (select 1) seed left join agent_tasks t on t.id=p_task_id and t.user_id=p_user_id and t.message='daemon_review';
$$;
revoke all on function daemon_get_agent_task_control(uuid,uuid) from public;
grant execute on function daemon_get_agent_task_control(uuid,uuid) to anon;

create or replace function daemon_manager_tick(p_user_id uuid,p_manager_instance_id uuid,p_execution_process_id integer,p_execution_started_at timestamptz,p_status_detail text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
 update daemon_manager_state set manager_heartbeat_at=now(),execution_process_id=p_execution_process_id,execution_started_at=p_execution_started_at,status_detail=coalesce(p_status_detail,status_detail),message='client_review',updated_at=now() where user_id=p_user_id and manager_instance_id=p_manager_instance_id;
 if not found then raise exception 'Manager lease ownership was lost'; end if;
 select jsonb_build_object('activeRequest',case when q.id is null then null else jsonb_build_object('id',q.id,'status',q.status,'updated_at',q.updated_at) end,'drainSummary',case when q.status<>'draining' then null else daemon_manager_get_drain_summary(p_user_id,p_manager_instance_id) end) into result from daemon_manager_state s left join daemon_manager_requests q on q.id=s.active_request_id and q.message='daemon_review' where s.user_id=p_user_id and s.manager_instance_id=p_manager_instance_id; return result;
end; $$;
revoke all on function daemon_manager_tick(uuid,uuid,integer,timestamptz,text) from public;
grant execute on function daemon_manager_tick(uuid,uuid,integer,timestamptz,text) to anon;

create type agent_output_history_summary as (
  id uuid, prompt_id text, task_id uuid, conversation_id text, repository text,
  prompt_snippet text, provider text, model text, reasoning text, mode text,
  source text, targeted_feature_paths jsonb, status text, status_detail text,
  created_at timestamptz, started_at timestamptz, completed_at timestamptz, updated_at timestamptz
);
drop function search_agent_output_history(text,integer);
create function search_agent_output_history(p_query text,p_limit integer default 50)
returns setof agent_output_history_summary language sql stable security definer set search_path=public as $$
 select h.id,h.prompt_id,h.task_id,h.conversation_id,h.repository,left(h.prompt,240),h.provider,h.model,h.reasoning,h.mode,h.source,h.targeted_feature_paths,h.status,h.status_detail,h.created_at,h.started_at,h.completed_at,h.updated_at from agent_output_history h where h.user_id=auth.uid() and (nullif(trim(p_query),'') is null or concat_ws(' ',h.prompt,h.repository,h.targeted_feature_paths::text,h.provider,h.model,h.mode,h.status) ilike '%'||trim(p_query)||'%') order by coalesce(h.completed_at,h.updated_at) desc,h.id desc limit least(greatest(p_limit,1),50);
$$;
revoke all on function search_agent_output_history(text,integer) from public;
grant execute on function search_agent_output_history(text,integer) to authenticated;

create function get_agent_output_history_page(p_cursor_completed_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 31)
returns setof agent_output_history_summary language sql stable security definer set search_path=public as $$
 select h.id,h.prompt_id,h.task_id,h.conversation_id,h.repository,left(h.prompt,240),h.provider,h.model,h.reasoning,h.mode,h.source,h.targeted_feature_paths,h.status,h.status_detail,h.created_at,h.started_at,h.completed_at,h.updated_at from agent_output_history h where h.user_id=auth.uid() and h.completed_at is not null and (p_cursor_completed_at is null or (h.completed_at,h.id)<(p_cursor_completed_at,p_cursor_id)) order by h.completed_at desc,h.id desc limit least(greatest(p_limit,1),31);
$$;
revoke all on function get_agent_output_history_page(timestamptz,uuid,integer) from public;
grant execute on function get_agent_output_history_page(timestamptz,uuid,integer) to authenticated;

-- System architecture visualization engine (migration 029 snapshot).
create function get_architecture_view(p_prompt_id text)
returns setof architecture_views language sql stable security definer set search_path=public as $$
 select architecture_views.* from architecture_views where user_id=auth.uid() and prompt_id=p_prompt_id limit 1;
$$;
revoke all on function get_architecture_view(text) from public;
grant execute on function get_architecture_view(text) to authenticated;

create function request_architecture_view(p_prompt_id text)
returns setof architecture_views language plpgsql security definer set search_path=public as $$
begin
 return query update architecture_views set generation=generation+1,status='queued',message='daemon_review',error='',requested_at=now(),started_at=null,completed_at=null
 where user_id=auth.uid() and prompt_id=p_prompt_id and status in('available','completed','failed') and nullif(base_commit,'')is not null and nullif(final_commit,'')is not null returning architecture_views.*;
end; $$;
revoke all on function request_architecture_view(text) from public;
grant execute on function request_architecture_view(text) to authenticated;

create function daemon_claim_architecture_view(p_user_id uuid,p_view_id uuid,p_generation integer,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
 update architecture_views set status='running',started_at=now() where id=p_view_id and user_id=p_user_id and generation=p_generation and status in('queued','running') and message='daemon_review' and updated_at=p_expected_updated_at
 returning jsonb_build_object('id',id,'prompt_id',prompt_id,'repository',repository,'base_commit',base_commit,'final_commit',final_commit,'targeted_feature_paths',targeted_feature_paths,'generation',generation,'updated_at',updated_at) into result;
 return result;
end; $$;
revoke all on function daemon_claim_architecture_view(uuid,uuid,integer,timestamptz) from public;
grant execute on function daemon_claim_architecture_view(uuid,uuid,integer,timestamptz) to anon;

create function daemon_complete_architecture_view(p_user_id uuid,p_view_id uuid,p_generation integer,p_expected_updated_at timestamptz,p_status text,p_changed_files jsonb,p_architecture_document jsonb,p_error text,p_failure_details jsonb,p_provider text,p_model text,p_reasoning text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if p_status not in('completed','failed') then raise exception 'Unsupported architecture completion status: %',p_status; end if;
 if p_status='completed' and(p_architecture_document is null or jsonb_typeof(p_architecture_document)<>'object')then raise exception 'Completed architecture views require an object document';end if;
 if p_failure_details is not null and jsonb_typeof(p_failure_details)<>'object' then raise exception 'Architecture failure details must be an object'; end if;
 update architecture_views set status=p_status,message='client_review',changed_files=coalesce(p_changed_files,changed_files),architecture_document=case when p_status='completed' then p_architecture_document else architecture_document end,error=case when p_status='failed' then coalesce(nullif(p_error,''),'Architecture generation failed.') else '' end,failure_details=case when p_status='failed' then p_failure_details else null end,provider=coalesce(p_provider,''),model=coalesce(p_model,''),reasoning=coalesce(p_reasoning,''),completed_at=now()
 where id=p_view_id and user_id=p_user_id and generation=p_generation and status='running' and message='daemon_review' and updated_at=p_expected_updated_at; return found;
end; $$;
revoke all on function daemon_complete_architecture_view(uuid,uuid,integer,timestamptz,text,jsonb,jsonb,text,jsonb,text,text,text) from public;
grant execute on function daemon_complete_architecture_view(uuid,uuid,integer,timestamptz,text,jsonb,jsonb,text,jsonb,text,text,text) to anon;

create or replace function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path=public as $$
  with owner as (select auth.uid() user_id)
  select jsonb_build_object(
    'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (select purpose,content,updated_at from communications,owner where communications.user_id=owner.user_id and communications.message='client_review' order by purpose limit 10) r),'[]'),
    'daemonPayloads',coalesce((select jsonb_agg(to_jsonb(r) order by kind) from (select kind,payload,updated_at from daemon_payloads,owner where daemon_payloads.user_id=owner.user_id and daemon_payloads.message='client_review' order by kind limit 3) r),'[]'),
    'agentTasks',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,status,queue_sequence,created_at,started_at,completed_at,error,verification_attempts,resolver_attempts,cancel_requested,retry_generation,updated_at from agent_tasks,owner where agent_tasks.user_id=owner.user_id and agent_tasks.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'taskDeletionRequests',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,task_id,prompt_id,status,error,updated_at from agent_task_deletion_requests,owner where agent_task_deletion_requests.user_id=owner.user_id and agent_task_deletion_requests.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'architectureViews',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,status,changed_files,architecture_document,error,failure_details,provider,model,reasoning,requested_at,started_at,completed_at,created_at,updated_at from architecture_views,owner where architecture_views.user_id=owner.user_id and architecture_views.message='client_review' order by updated_at,id limit 20) r),'[]'),
    'architectureProgressEvents',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (select id,architecture_view_id,generation,stage,stage_order,attempt,total_attempts,detail,created_at,updated_at from architecture_view_progress_events,owner where architecture_view_progress_events.user_id=owner.user_id and architecture_view_progress_events.message='client_review' order by created_at,id limit 50) r),'[]'),
    'featureExecutionRuns',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (select id,project_directory,feature_file_path,status,cancel_requested,command,parameter_file_path,entry_point_path,started_at,completed_at,exit_code,stdout_tail,stderr_tail,error,updated_at from feature_execution_runs,owner where feature_execution_runs.user_id=owner.user_id and feature_execution_runs.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'daemonEvents',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (select id,event_type,task_id,conversation_id,severity,content,created_at,updated_at from daemon_events,owner where daemon_events.user_id=owner.user_id and daemon_events.message='client_review' order by created_at,id limit 50) r),'[]'),
    'managerStatus',(select case when s.user_id is null then null else jsonb_build_object('state',s.state,'accepts_work',s.accepts_work,'manager_heartbeat_at',s.manager_heartbeat_at,'execution_process_id',s.execution_process_id,'execution_generation',s.execution_generation,'execution_started_at',s.execution_started_at,'last_successful_restart_at',s.last_successful_restart_at,'status_detail',s.status_detail,'updated_at',s.updated_at,'activeRequest',case when q.id is null then null else jsonb_build_object('id',q.id,'status',q.status,'blockers',q.blockers) end) end from owner left join daemon_manager_state s on s.user_id=owner.user_id and s.message='client_review' left join daemon_manager_requests q on q.id=s.active_request_id)
  );
$$;

create or replace function daemon_poll_work(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare claimed_id uuid;result jsonb;begin
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id)then raise exception 'Invalid daemon user scope';end if;
 select id into claimed_id from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status='queued' and not cancel_requested order by created_at,id for update skip locked limit 1;
 if claimed_id is not null then update feature_execution_runs set status='running',started_at=now(),updated_at=now() where id=claimed_id;end if;
 select jsonb_build_object(
 'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose)from(select purpose,content,updated_at from communications where user_id=p_user_id and message='daemon_review' and purpose in('agent_prompt','git_sync_request','feature_file_load','parameter_file_load','parameter_file_update','entry_point_update')order by purpose limit 6)r),'[]'),
 'agentTasks',coalesce((select jsonb_agg(to_jsonb(task) order by task.queue_sequence) from daemon_list_agent_tasks(p_user_id) task),'[]'),
 'architectureViews',coalesce((select jsonb_agg(to_jsonb(r)order by requested_at,id)from(select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,status,requested_at,updated_at from architecture_views where user_id=p_user_id and message='daemon_review' and status in('queued','running')order by requested_at,id limit 10)r),'[]'),
 'featureRunControls',coalesce((select jsonb_agg(to_jsonb(r)order by created_at,id)from(select id,status,cancel_requested,created_at from feature_execution_runs where user_id=p_user_id and message='daemon_review' and status in('queued','running')and id is distinct from claimed_id order by created_at,id limit 100)r),'[]'),
 'claimedFeatureRun',(select case when r.id is null then null else to_jsonb(r)end from(select id,project_directory,feature_file_path,status,cancel_requested from feature_execution_runs where id=claimed_id)r))into result;return result;
end; $$;

create or replace function daemon_manager_tick(p_user_id uuid,p_manager_instance_id uuid,p_execution_process_id integer,p_execution_started_at timestamptz,p_status_detail text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;begin
 update daemon_manager_state set manager_heartbeat_at=now(),execution_process_id=p_execution_process_id,execution_started_at=p_execution_started_at,status_detail=coalesce(p_status_detail,status_detail),message='client_review',updated_at=now()where user_id=p_user_id and manager_instance_id=p_manager_instance_id;if not found then raise exception 'Manager lease ownership was lost';end if;
 select jsonb_build_object('activeRequest',case when q.id is null then null else jsonb_build_object('id',q.id,'status',q.status,'updated_at',q.updated_at)end,'drainSummary',case when q.status<>'draining' then null else daemon_manager_get_drain_summary(p_user_id,p_manager_instance_id)end)into result from daemon_manager_state s left join daemon_manager_requests q on q.id=s.active_request_id and q.message='daemon_review' where s.user_id=p_user_id and s.manager_instance_id=p_manager_instance_id;return result;
end; $$;

-- Migration 043: automated project initialization.
alter table daemon_manager_state add column execution_root text;

drop policy if exists "authenticated users can insert own communications" on communications;
create policy "authenticated users can insert own communications"
on communications for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    message <> 'daemon_review'
    or purpose not in (
      'agent_prompt','git_sync_request','project_initialization_request',
      'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
    )
    or daemon_accepts_work(auth.uid())
  )
);

drop policy if exists "authenticated users can update own communications" on communications;
create policy "authenticated users can update own communications"
on communications for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (
    message <> 'daemon_review'
    or purpose not in (
      'agent_prompt','git_sync_request','project_initialization_request',
      'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
    )
    or daemon_accepts_work(auth.uid())
  )
);

alter table daemon_payloads drop constraint if exists daemon_payloads_kind_check;
alter table daemon_payloads add constraint daemon_payloads_kind_check check (
  kind in ('feature_files','parameter_files','git_sync_result','project_initialization_result')
);

create or replace function daemon_list_communication_reviews(p_user_id uuid)
returns table(purpose text, content text, updated_at timestamptz)
language sql security definer set search_path=public as $$
  select communications.purpose,communications.content,communications.updated_at
  from communications
  where communications.user_id=p_user_id and communications.message='daemon_review'
    and communications.purpose in (
      'agent_prompt','git_sync_request','project_initialization_request',
      'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
    )
  order by communications.purpose limit 7;
$$;

create or replace function daemon_upsert_payload(
  p_user_id uuid,p_kind text,p_payload jsonb
) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_kind not in (
    'feature_files','parameter_files','git_sync_result','project_initialization_result'
  ) then raise exception 'Unsupported daemon payload kind: %',p_kind; end if;
  insert into daemon_payloads(user_id,kind,payload,message)
  values(p_user_id,p_kind,p_payload,'client_review')
  on conflict(user_id,kind) do update set
    payload=excluded.payload,message=excluded.message,updated_at=now();
end;
$$;

create or replace function daemon_poll_task_work(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare claimed_id uuid; result jsonb;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'Invalid daemon user scope';
  end if;
  insert into daemon_manager_state(user_id,execution_heartbeat_at,message)
  values(p_user_id,now(),'client_review')
  on conflict(user_id) do update set
    execution_heartbeat_at=excluded.execution_heartbeat_at,
    message='client_review',updated_at=now();
  select id into claimed_id from feature_execution_runs
  where user_id=p_user_id and message='daemon_review' and status='queued' and not cancel_requested
  order by created_at,id for update skip locked limit 1;
  if claimed_id is not null then
    update feature_execution_runs set status='running',started_at=now(),updated_at=now()
    where id=claimed_id;
  end if;
  select jsonb_build_object(
    'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (
      select purpose,content,updated_at from communications where user_id=p_user_id
      and message='daemon_review' and purpose in (
        'agent_prompt','git_sync_request','project_initialization_request',
        'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
      ) order by purpose limit 7) r),'[]'),
    'agentTasks',coalesce((select jsonb_agg(to_jsonb(task) order by task.queue_sequence)
      from daemon_list_task_integration_work(p_user_id) task),'[]'),
    'architectureViews',coalesce((select jsonb_agg(to_jsonb(r) order by requested_at,id) from (
      select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,
        status,requested_at,updated_at from architecture_views where user_id=p_user_id
        and message='daemon_review' and status in('queued','running')
      order by requested_at,id limit 10) r),'[]'),
    'featureRunControls',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (
      select id,status,cancel_requested,created_at from feature_execution_runs
      where user_id=p_user_id and message='daemon_review' and status in('queued','running')
        and id is distinct from claimed_id order by created_at,id limit 100) r),'[]'),
    'claimedFeatureRun',(select case when r.id is null then null else to_jsonb(r) end from (
      select id,project_directory,feature_file_path,status,cancel_requested
      from feature_execution_runs where id=claimed_id) r)
  ) into result;
  return result;
end;
$$;

create or replace function daemon_poll_work(p_user_id uuid)
returns jsonb language sql security definer set search_path=public as $$
  select daemon_poll_task_work(p_user_id);
$$;

create or replace function daemon_manager_get_drain_summary(
  p_user_id uuid,p_manager_instance_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not exists(select 1 from daemon_manager_state where user_id=p_user_id
    and manager_instance_id=p_manager_instance_id) then raise exception 'Manager lease is not owned'; end if;
  select jsonb_build_object(
    'total',agent_count+feature_count+architecture_count+communication_count,
    'agentTasks',agent_count,'featureExecutions',feature_count,
    'architectureViews',architecture_count,'communications',communication_counts,
    'identifiers',jsonb_build_object(
      'agentTasks',coalesce((select jsonb_agg(id order by queue_sequence) from (
        select id,queue_sequence from agent_tasks where user_id=p_user_id and message='daemon_review'
          and status in('queued','running','verifying','ready','integrating','resolving')
        order by queue_sequence limit 100) rows),'[]'),
      'featureExecutions',coalesce((select jsonb_agg(id order by created_at) from (
        select id,created_at from feature_execution_runs where user_id=p_user_id
          and message='daemon_review' and status in('queued','running')
        order by created_at limit 100) rows),'[]'),
      'architectureViews',coalesce((select jsonb_agg(id order by requested_at,id) from (
        select id,requested_at from architecture_views where user_id=p_user_id
          and message='daemon_review' and status in('queued','running')
        order by requested_at,id limit 10) rows),'[]'),
      'communications',coalesce((select jsonb_agg(jsonb_build_object(
        'purpose',purpose,'updatedAt',updated_at) order by purpose) from communications
        where user_id=p_user_id and message='daemon_review' and purpose in (
          'agent_prompt','git_sync_request','project_initialization_request',
          'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
        )),'[]')
    )) into result
  from (select
    (select count(*) from agent_tasks where user_id=p_user_id and message='daemon_review'
      and status in('queued','running','verifying','ready','integrating','resolving')) agent_count,
    (select count(*) from feature_execution_runs where user_id=p_user_id and message='daemon_review'
      and status in('queued','running')) feature_count,
    (select count(*) from architecture_views where user_id=p_user_id and message='daemon_review'
      and status in('queued','running')) architecture_count,
    (select count(*) from communications where user_id=p_user_id and message='daemon_review'
      and purpose in (
        'agent_prompt','git_sync_request','project_initialization_request',
        'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
      )) communication_count,
    coalesce((select jsonb_object_agg(purpose,purpose_count) from (
      select purpose,count(*) purpose_count from communications
      where user_id=p_user_id and message='daemon_review' and purpose in (
        'agent_prompt','git_sync_request','project_initialization_request',
        'feature_file_load','parameter_file_load','parameter_file_update','entry_point_update'
      ) group by purpose) groups),'{}') communication_counts) counts;
  return result;
end;
$$;

drop function daemon_manager_acquire_lease(uuid,uuid,integer);
create function daemon_manager_acquire_lease(
  p_user_id uuid,p_manager_instance_id uuid,p_stale_after_seconds integer,p_execution_root text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  insert into daemon_manager_state(
    user_id,manager_instance_id,manager_heartbeat_at,status_detail,message,execution_root
  ) values(p_user_id,p_manager_instance_id,now(),'Manager connected.','client_review',p_execution_root)
  on conflict(user_id) do update set manager_instance_id=excluded.manager_instance_id,
    manager_heartbeat_at=now(),execution_root=excluded.execution_root,
    message='client_review',updated_at=now()
  where daemon_manager_state.manager_instance_id=p_manager_instance_id
    or daemon_manager_state.manager_instance_id is null
    or daemon_manager_state.manager_heartbeat_at is null
    or daemon_manager_state.manager_heartbeat_at <
      now()-make_interval(secs=>greatest(p_stale_after_seconds,1));
  return found;
end;
$$;

drop function daemon_manager_publish_heartbeat(uuid,uuid,integer,timestamptz,text);
create function daemon_manager_publish_heartbeat(
  p_user_id uuid,p_manager_instance_id uuid,p_execution_process_id integer,
  p_execution_started_at timestamptz,p_status_detail text default null,p_execution_root text default null
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  update daemon_manager_state set manager_heartbeat_at=now(),
    execution_process_id=p_execution_process_id,execution_started_at=p_execution_started_at,
    execution_root=coalesce(p_execution_root,execution_root),
    status_detail=coalesce(p_status_detail,status_detail),message='client_review',updated_at=now()
  where user_id=p_user_id and manager_instance_id=p_manager_instance_id;
  return found;
end;
$$;

drop function daemon_manager_tick(uuid,uuid,integer,timestamptz,text);
create function daemon_manager_tick(
  p_user_id uuid,p_manager_instance_id uuid,p_execution_process_id integer,
  p_execution_started_at timestamptz,p_status_detail text default null,p_execution_root text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  update daemon_manager_state set manager_heartbeat_at=now(),
    execution_process_id=p_execution_process_id,execution_started_at=p_execution_started_at,
    execution_root=coalesce(p_execution_root,execution_root),
    status_detail=coalesce(p_status_detail,status_detail),message='client_review',updated_at=now()
  where user_id=p_user_id and manager_instance_id=p_manager_instance_id;
  if not found then raise exception 'Manager lease ownership was lost'; end if;
  select jsonb_build_object(
    'activeRequest',case when q.id is null then null else jsonb_build_object(
      'id',q.id,'status',q.status,'updated_at',q.updated_at) end,
    'drainSummary',case when q.status<>'draining' then null
      else daemon_manager_get_drain_summary(p_user_id,p_manager_instance_id) end)
  into result from daemon_manager_state s left join daemon_manager_requests q
    on q.id=s.active_request_id and q.message='daemon_review'
  where s.user_id=p_user_id and s.manager_instance_id=p_manager_instance_id;
  return result;
end;
$$;

create or replace function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path=public as $$
  with owner as(select auth.uid() user_id)
  select jsonb_build_object(
    'communications',coalesce((select jsonb_agg(to_jsonb(r) order by purpose) from (
      select purpose,content,updated_at from communications,owner
      where communications.user_id=owner.user_id and communications.message='client_review'
      order by purpose limit 10) r),'[]'),
    'daemonPayloads',coalesce((select jsonb_agg(to_jsonb(r) order by kind) from (
      select kind,payload,updated_at from daemon_payloads,owner
      where daemon_payloads.user_id=owner.user_id and daemon_payloads.message='client_review'
      order by kind limit 4) r),'[]'),
    'agentTasks',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,
        status,queue_sequence,created_at,started_at,completed_at,error,verification_attempts,
        resolver_attempts,cancel_requested,retry_generation,updated_at from agent_tasks,owner
      where agent_tasks.user_id=owner.user_id and agent_tasks.message='client_review'
      order by updated_at,id limit 50) r),'[]'),
    'taskDeletionRequests',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,task_id,prompt_id,status,error,updated_at from agent_task_deletion_requests,owner
      where agent_task_deletion_requests.user_id=owner.user_id
        and agent_task_deletion_requests.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'architectureViews',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,
        status,changed_files,architecture_document,error,failure_details,provider,model,reasoning,
        requested_at,started_at,completed_at,created_at,updated_at from architecture_views,owner
      where architecture_views.user_id=owner.user_id and architecture_views.message='client_review'
      order by updated_at,id limit 20) r),'[]'),
    'architectureProgressEvents',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (
      select id,architecture_view_id,generation,stage,stage_order,attempt,total_attempts,detail,
        created_at,updated_at from architecture_view_progress_events,owner
      where architecture_view_progress_events.user_id=owner.user_id
        and architecture_view_progress_events.message='client_review'
      order by created_at,id limit 50) r),'[]'),
    'featureExecutionRuns',coalesce((select jsonb_agg(to_jsonb(r) order by updated_at,id) from (
      select id,project_directory,feature_file_path,status,cancel_requested,command,
        parameter_file_path,entry_point_path,started_at,completed_at,exit_code,stdout_tail,
        stderr_tail,error,updated_at from feature_execution_runs,owner
      where feature_execution_runs.user_id=owner.user_id
        and feature_execution_runs.message='client_review' order by updated_at,id limit 50) r),'[]'),
    'daemonEvents',coalesce((select jsonb_agg(to_jsonb(r) order by created_at,id) from (
      select id,event_type,task_id,severity,content,created_at,updated_at
      from daemon_events,owner where daemon_events.user_id=owner.user_id
        and daemon_events.message='client_review' order by created_at,id limit 50) r),'[]'),
    'managerStatus',(select case when s.user_id is null then null else jsonb_build_object(
      'state',s.state,'accepts_work',s.accepts_work,'manager_heartbeat_at',s.manager_heartbeat_at,
      'execution_heartbeat_at',s.execution_heartbeat_at,
      'execution_process_id',s.execution_process_id,'execution_generation',s.execution_generation,
      'execution_started_at',s.execution_started_at,'execution_root',s.execution_root,
      'last_successful_restart_at',s.last_successful_restart_at,'status_detail',s.status_detail,
      'updated_at',s.updated_at,'activeRequest',case when q.id is null then null else
        jsonb_build_object('id',q.id,'status',q.status,'blockers',q.blockers) end) end
      from owner left join daemon_manager_state s
        on s.user_id=owner.user_id and s.message='client_review'
      left join daemon_manager_requests q on q.id=s.active_request_id)
  );
$$;

revoke all on function daemon_manager_acquire_lease(uuid,uuid,integer,text) from public;
revoke all on function daemon_manager_publish_heartbeat(uuid,uuid,integer,timestamptz,text,text) from public;
revoke all on function daemon_manager_tick(uuid,uuid,integer,timestamptz,text,text) from public;
revoke all on function get_client_review_inbox() from public;
grant execute on function daemon_manager_acquire_lease(uuid,uuid,integer,text) to anon;
grant execute on function daemon_manager_publish_heartbeat(uuid,uuid,integer,timestamptz,text,text) to anon;
grant execute on function daemon_manager_tick(uuid,uuid,integer,timestamptz,text,text) to anon;
grant execute on function get_client_review_inbox() to authenticated;

-- Migration 045: execution delivery health is independent of manager control-plane health.

-- Migration 047: AOP execution loops (full DDL in supabase/migrations/047_aop_execution_loops.sql)
create table if not exists aop_execution_loops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  repository text not null,
  status text not null,
  paused_from text not null default '',
  direction_prompt text not null default '',
  conversation_id text not null default '',
  provider text not null default '',
  model text not null default '',
  reasoning text not null default '',
  targeted_feature_paths jsonb not null default '[]'::jsonb,
  current_task_title text not null default '',
  current_task_prompt text not null default '',
  prep_notes text not null default '',
  pending_questions jsonb not null default '[]'::jsonb,
  prep_answers jsonb not null default '[]'::jsonb,
  current_agent_task_id uuid references agent_tasks(id) on delete set null,
  active_prompt_id text not null default '',
  tasks_completed_total integer not null default 0,
  tasks_since_verification integer not null default 0,
  max_tasks_before_verification integer not null default 3,
  loop_base_commit text not null default '',
  integrated_commits text[] not null default '{}',
  recent_task_titles text[] not null default '{}',
  status_detail text not null default '',
  cancel_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table agent_tasks add column if not exists source_loop_id uuid references aop_execution_loops(id) on delete set null;
