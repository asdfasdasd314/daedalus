create table architecture_view_progress_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  architecture_view_id uuid not null references architecture_views(id) on delete cascade,
  generation integer not null check (generation >= 1),
  stage text not null check (stage in (
    'queued', 'preparing_snapshot', 'collecting_evidence', 'generating_document',
    'validating_document', 'correcting_document', 'finalizing'
  )),
  stage_order integer not null check (stage_order between 1 and 7),
  attempt integer check (attempt is null or attempt >= 1),
  total_attempts integer check (total_attempts is null or total_attempts >= 1),
  detail text not null default '',
  message text not null default 'client_review'
    check (message in ('daemon_review', 'client_review', 'client_complete', 'daemon_complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (attempt is null or total_attempts is null or attempt <= total_attempts)
);

alter table architecture_view_progress_events enable row level security;
revoke all on architecture_view_progress_events from anon, authenticated;
grant select on architecture_view_progress_events to authenticated;
create policy "authenticated users can read own architecture progress"
on architecture_view_progress_events for select to authenticated using (user_id = auth.uid());

create index architecture_progress_daemon_review_idx
on architecture_view_progress_events (user_id, created_at, id)
where message = 'daemon_review';

create index architecture_progress_client_review_idx
on architecture_view_progress_events (user_id, created_at, id)
where message = 'client_review';

create trigger set_architecture_view_progress_events_updated_at
before update on architecture_view_progress_events
for each row execute function set_updated_at();

create function daemon_publish_architecture_progress_event(
  p_user_id uuid, p_view_id uuid, p_generation integer, p_stage text,
  p_detail text default '', p_attempt integer default null,
  p_total_attempts integer default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare stage_position integer;
begin
  stage_position := case p_stage
    when 'queued' then 1 when 'preparing_snapshot' then 2
    when 'collecting_evidence' then 3 when 'generating_document' then 4
    when 'validating_document' then 5 when 'correcting_document' then 6
    when 'finalizing' then 7 else null end;
  if stage_position is null then raise exception 'Unsupported architecture progress stage: %', p_stage; end if;
  if not exists (
    select 1 from architecture_views where id = p_view_id and user_id = p_user_id
      and generation = p_generation and status = 'running' and message = 'daemon_review'
  ) then return false; end if;
  insert into architecture_view_progress_events (
    user_id, architecture_view_id, generation, stage, stage_order, attempt,
    total_attempts, detail, message
  ) values (
    p_user_id, p_view_id, p_generation, p_stage, stage_position, p_attempt,
    p_total_attempts, left(coalesce(p_detail, ''), 240), 'client_review'
  );
  return true;
end;
$$;
revoke all on function daemon_publish_architecture_progress_event(uuid, uuid, integer, text, text, integer, integer) from public;
grant execute on function daemon_publish_architecture_progress_event(uuid, uuid, integer, text, text, integer, integer) to anon;

alter function get_client_review_inbox() rename to get_client_review_inbox_previous;

create function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path = public as $$
  with owner as (select auth.uid() as user_id)
  select jsonb_set(
    previous.inbox,
    '{architectureProgressEvents}',
    coalesce((select jsonb_agg(to_jsonb(row_data) order by created_at, id) from (
      select id, architecture_view_id, generation, stage, stage_order, attempt,
        total_attempts, detail, created_at, updated_at
      from architecture_view_progress_events, owner
      where architecture_view_progress_events.user_id = owner.user_id
        and message = 'client_review'
      order by created_at, id limit 50
    ) row_data), '[]'::jsonb)
  ) from (select get_client_review_inbox_previous() as inbox) previous;
$$;
revoke all on function get_client_review_inbox() from public;
grant execute on function get_client_review_inbox() to authenticated;

alter function acknowledge_client_reviews(jsonb) rename to acknowledge_client_reviews_previous;

create function acknowledge_client_reviews(receipts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid := auth.uid(); receipt jsonb; receipt_id text;
  acknowledged jsonb := '[]'::jsonb; rejected jsonb := '[]'::jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(receipts) <> 'array' then raise exception 'Receipts must be an array'; end if;
  for receipt in select value from jsonb_array_elements(receipts) loop
    receipt_id := coalesce(receipt->>'receiptId', '');
    if receipt->>'transport' = 'architectureProgressEvents' then
      update architecture_view_progress_events set message = 'client_complete'
      where user_id = owner_id and id = (receipt->>'key')::uuid
        and generation = (receipt->>'generation')::integer
        and message = 'client_review'
        and updated_at = (receipt->>'updatedAt')::timestamptz;
    else
      perform 1 from acknowledge_client_reviews_previous(jsonb_build_array(receipt));
      if found then
        acknowledged := acknowledged || jsonb_build_array(receipt_id);
      else
        rejected := rejected || jsonb_build_array(receipt_id);
      end if;
      continue;
    end if;
    if found then acknowledged := acknowledged || jsonb_build_array(receipt_id);
    else rejected := rejected || jsonb_build_array(receipt_id); end if;
  end loop;
  return jsonb_build_object('acknowledged', acknowledged, 'rejected', rejected);
end;
$$;
revoke all on function acknowledge_client_reviews(jsonb) from public;
grant execute on function acknowledge_client_reviews(jsonb) to authenticated;
