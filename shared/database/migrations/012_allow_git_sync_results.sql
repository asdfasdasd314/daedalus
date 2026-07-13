alter table daemon_payloads
  drop constraint if exists daemon_payloads_kind_check;

alter table daemon_payloads
  add constraint daemon_payloads_kind_check
  check (kind in (
    'feature_files',
    'parameter_files',
    'agent_chat',
    'git_sync_result'
  ));

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
    'agent_chat',
    'git_sync_result'
  ) then
    raise exception 'Unsupported daemon payload kind: %', p_kind;
  end if;

  insert into daemon_payloads (user_id, kind, payload)
  values (p_user_id, p_kind, p_payload)
  on conflict (user_id, kind)
  do update set
    payload = excluded.payload,
    updated_at = now();
end;
$$;

grant execute on function daemon_upsert_payload(uuid, text, jsonb) to anon;
