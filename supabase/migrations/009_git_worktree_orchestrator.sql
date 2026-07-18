create table agent_tasks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  repository text not null,
  prompt text not null,
  provider text not null,
  model text not null default '',
  reasoning text not null default '',
  planning_mode boolean not null default false,
  targeted_feature_paths jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in (
    'queued', 'running', 'verifying', 'ready', 'failed', 'integrating',
    'resolving', 'completed', 'blocked'
  )),
  queue_sequence bigint generated always as identity,
  base_commit text,
  branch_name text,
  worktree_path text,
  batch_id uuid,
  result text not null default '',
  error text not null default '',
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
  status text not null default 'collecting' check (status in (
    'collecting', 'integrating', 'resolving', 'completed', 'blocked'
  )),
  resolver_attempts integer not null default 0,
  verification_output text not null default '',
  quiet_since timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table agent_tasks
  add constraint agent_tasks_batch_id_fkey
  foreign key (batch_id) references orchestration_batches(id) on delete set null;

create table daemon_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  repository text not null,
  task_id uuid references agent_tasks(id) on delete set null,
  batch_id uuid references orchestration_batches(id) on delete set null,
  severity text not null check (severity in ('info', 'warning', 'error')),
  message text not null,
  created_at timestamptz not null default now()
);

create index agent_tasks_scheduler_idx
on agent_tasks (user_id, repository, status, queue_sequence);
create index orchestration_batches_scheduler_idx
on orchestration_batches (user_id, repository, status, created_at);
create index daemon_events_user_created_idx
on daemon_events (user_id, created_at desc);

alter table agent_tasks enable row level security;
alter table orchestration_batches enable row level security;
alter table daemon_events enable row level security;

create policy "authenticated users can insert own agent tasks"
on agent_tasks for insert to authenticated
with check (user_id = auth.uid() and status = 'queued');
create policy "authenticated users can read own agent tasks"
on agent_tasks for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can read own orchestration batches"
on orchestration_batches for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can read own daemon events"
on daemon_events for select to authenticated using (user_id = auth.uid());

create or replace function daemon_list_agent_tasks(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path = public as $$
  select * from agent_tasks where user_id = p_user_id order by queue_sequence;
$$;

create or replace function daemon_update_agent_task(
  p_user_id uuid, p_task_id uuid, p_expected_status text, p_updates jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update agent_tasks set
    status = coalesce(p_updates->>'status', status),
    base_commit = coalesce(p_updates->>'base_commit', base_commit),
    branch_name = coalesce(p_updates->>'branch_name', branch_name),
    worktree_path = coalesce(p_updates->>'worktree_path', worktree_path),
    batch_id = coalesce((p_updates->>'batch_id')::uuid, batch_id),
    result = coalesce(p_updates->>'result', result),
    error = coalesce(p_updates->>'error', error),
    started_at = case when p_updates ? 'started_at' then (p_updates->>'started_at')::timestamptz else started_at end,
    completed_at = case when p_updates ? 'completed_at' then (p_updates->>'completed_at')::timestamptz else completed_at end,
    updated_at = now()
  where id = p_task_id and user_id = p_user_id and status = p_expected_status;
  return found;
end;
$$;

create or replace function daemon_upsert_orchestration_batch(p_user_id uuid, p_batch jsonb)
returns void language sql security definer set search_path = public as $$
  insert into orchestration_batches (
    id, user_id, repository, base_commit, task_ids, integration_branch,
    integration_worktree_path, status, resolver_attempts, verification_output,
    quiet_since, completed_at
  ) values (
    (p_batch->>'id')::uuid, p_user_id, p_batch->>'repository',
    p_batch->>'base_commit', coalesce(p_batch->'task_ids', '[]'::jsonb),
    p_batch->>'integration_branch', coalesce(p_batch->>'integration_worktree_path', ''),
    coalesce(p_batch->>'status', 'collecting'),
    coalesce((p_batch->>'resolver_attempts')::integer, 0),
    coalesce(p_batch->>'verification_output', ''),
    (p_batch->>'quiet_since')::timestamptz, (p_batch->>'completed_at')::timestamptz
  ) on conflict (id) do update set
    task_ids = excluded.task_ids,
    integration_worktree_path = excluded.integration_worktree_path,
    status = excluded.status,
    resolver_attempts = excluded.resolver_attempts,
    verification_output = excluded.verification_output,
    quiet_since = excluded.quiet_since,
    completed_at = excluded.completed_at,
    updated_at = now();
$$;

create or replace function daemon_list_orchestration_batches(p_user_id uuid)
returns setof orchestration_batches language sql security definer set search_path = public as $$
  select * from orchestration_batches where user_id = p_user_id order by created_at;
$$;

create or replace function daemon_record_event(
  p_user_id uuid, p_repository text, p_task_id uuid, p_batch_id uuid,
  p_severity text, p_message text
) returns void language sql security definer set search_path = public as $$
  insert into daemon_events (user_id, repository, task_id, batch_id, severity, message)
  values (p_user_id, p_repository, p_task_id, p_batch_id, p_severity, p_message);
$$;

grant execute on function daemon_list_agent_tasks(uuid) to anon;
grant execute on function daemon_update_agent_task(uuid, uuid, text, jsonb) to anon;
grant execute on function daemon_upsert_orchestration_batch(uuid, jsonb) to anon;
grant execute on function daemon_list_orchestration_batches(uuid) to anon;
grant execute on function daemon_record_event(uuid, text, uuid, uuid, text, text) to anon;
