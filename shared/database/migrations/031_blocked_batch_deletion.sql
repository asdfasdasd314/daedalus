-- Blocked integrations can be dismissed without retrying them. The daemon owns
-- worktree cleanup and terminalizes the verified member tasks so they are not rebatched.
create table orchestration_batch_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  expected_updated_at timestamptz not null,
  message text not null default 'daemon_review' check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  status text not null default 'requested' check (status in ('requested', 'completed', 'rejected')),
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, batch_id, expected_updated_at)
);
alter table orchestration_batch_deletion_requests enable row level security;
create policy "authenticated users can read own batch deletion requests" on orchestration_batch_deletion_requests for select to authenticated using (user_id = auth.uid());
create index orchestration_batch_deletion_requests_daemon_review_idx on orchestration_batch_deletion_requests (user_id, created_at, id) where message = 'daemon_review';

create or replace function request_orchestration_batch_deletion(p_batch_id uuid, p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare request_id uuid;
begin
  insert into orchestration_batch_deletion_requests (user_id, batch_id, expected_updated_at)
  select auth.uid(), batch.id, p_expected_updated_at from orchestration_batches batch
  where batch.id = p_batch_id and batch.user_id = auth.uid()
    and batch.updated_at = p_expected_updated_at and batch.status = 'blocked'
  on conflict (user_id, batch_id, expected_updated_at) do update
    set message = 'daemon_review', status = 'requested', error = '', updated_at = now()
  returning id into request_id;
  if request_id is null then raise exception 'Integration batch is no longer eligible for deletion'; end if;
  return request_id;
end; $$;

create or replace function daemon_list_batch_deletion_requests(p_user_id uuid)
returns table (id uuid, batch jsonb, tasks jsonb) language sql security definer set search_path = public as $$
  select request.id, to_jsonb(batch), coalesce((
    select jsonb_agg(to_jsonb(task)) from agent_tasks task
    where task.user_id = p_user_id and batch.task_ids ? task.id::text
  ), '[]'::jsonb)
  from orchestration_batch_deletion_requests request
  left join orchestration_batches batch on batch.id = request.batch_id and batch.user_id = request.user_id
  where request.user_id = p_user_id and request.message = 'daemon_review'
  order by request.created_at, request.id limit 50;
$$;

create or replace function daemon_complete_batch_deletion(p_user_id uuid, p_request_id uuid, p_error text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare request_row orchestration_batch_deletion_requests%rowtype; batch_row orchestration_batches%rowtype;
begin
  select * into request_row from orchestration_batch_deletion_requests
  where id = p_request_id and user_id = p_user_id and message = 'daemon_review' for update;
  if not found then return false; end if;
  if p_error <> '' then
    update orchestration_batch_deletion_requests set status = 'rejected', error = p_error, message = 'client_review', updated_at = now() where id = p_request_id;
    return true;
  end if;
  select * into batch_row from orchestration_batches
  where id = request_row.batch_id and user_id = p_user_id and status = 'blocked'
    and updated_at = request_row.expected_updated_at for update;
  if not found then
    update orchestration_batch_deletion_requests set status = 'rejected', error = 'Integration batch changed before deletion could be completed.', message = 'client_review', updated_at = now() where id = p_request_id;
    return true;
  end if;
  update agent_tasks set status = 'completed', message = 'client_review', completed_at = coalesce(completed_at, now()), updated_at = now()
  where user_id = p_user_id and batch_row.task_ids ? id::text and status in ('ready', 'integrating', 'resolving');
  delete from orchestration_batches where id = batch_row.id and user_id = p_user_id and status = 'blocked' and updated_at = request_row.expected_updated_at;
  if not found then
    update orchestration_batch_deletion_requests set status = 'rejected', error = 'Integration batch changed before deletion could be completed.', message = 'client_review', updated_at = now() where id = p_request_id;
    return true;
  end if;
  update orchestration_batch_deletion_requests set status = 'completed', message = 'client_review', updated_at = now() where id = p_request_id;
  return true;
end; $$;

grant execute on function request_orchestration_batch_deletion(uuid, timestamptz) to authenticated;
grant execute on function daemon_list_batch_deletion_requests(uuid), daemon_complete_batch_deletion(uuid, uuid, text) to anon;
