create table feature_execution_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_directory text not null,
  feature_file_path text not null,
  parameter_file_path text not null default '',
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

create policy "authenticated users can insert own feature runs"
on feature_execution_runs for insert to authenticated
with check (user_id = auth.uid() and status = 'queued' and message = 'daemon_review'
  and cancel_requested = false and command = '[]'::jsonb and parameter_file_path = '');
create policy "authenticated users can read own feature runs"
on feature_execution_runs for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can cancel own active feature runs"
on feature_execution_runs for update to authenticated
using (user_id = auth.uid() and status in ('queued', 'running') and cancel_requested = false)
with check (user_id = auth.uid() and status in ('queued', 'running') and cancel_requested = true);
create policy "authenticated users can acknowledge own feature runs"
on feature_execution_runs for update to authenticated
using (user_id = auth.uid() and message = 'client_review')
with check (user_id = auth.uid() and message = 'client_complete');
create policy "authenticated users can delete own terminal feature runs"
on feature_execution_runs for delete to authenticated
using (user_id = auth.uid() and status in ('completed', 'failed', 'cancelled'));

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

create function daemon_update_feature_execution_run(
  p_user_id uuid, p_run_id uuid, p_expected_status text, p_updates jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update feature_execution_runs set
    status = coalesce(p_updates->>'status', status),
    message = coalesce(p_updates->>'message', case when p_updates->>'status' in ('completed', 'failed', 'cancelled') then 'client_review' else message end),
    parameter_file_path = coalesce(p_updates->>'parameter_file_path', parameter_file_path),
    command = coalesce(p_updates->'command', command),
    process_id = coalesce((p_updates->>'process_id')::integer, process_id),
    exit_code = case when p_updates ? 'exit_code' then (p_updates->>'exit_code')::integer else exit_code end,
    stdout_tail = coalesce(p_updates->>'stdout_tail', stdout_tail),
    stderr_tail = coalesce(p_updates->>'stderr_tail', stderr_tail),
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
  where user_id = p_user_id and status in ('queued', 'running')
  order by created_at;
$$;

grant execute on function daemon_claim_feature_execution_run(uuid) to anon;
grant execute on function daemon_update_feature_execution_run(uuid, uuid, text, jsonb) to anon;
grant execute on function daemon_list_active_feature_execution_runs(uuid) to anon;
