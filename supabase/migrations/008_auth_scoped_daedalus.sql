do $$
declare
  legacy_owner uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
  if legacy_owner = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace the legacy_owner UUID in migration 008 with the Supabase user id that should own existing rows before applying this migration.';
  end if;

  alter table communications
    add column if not exists user_id uuid references auth.users(id) on delete cascade,
    add column if not exists updated_at timestamptz not null default now();

  update communications
  set user_id = legacy_owner
  where user_id is null;

  alter table communications
    alter column user_id set not null;

  alter table ventures
    add column if not exists user_id uuid references auth.users(id) on delete cascade,
    add column if not exists updated_at timestamptz not null default now();

  update ventures
  set user_id = legacy_owner
  where user_id is null;

  alter table ventures
    alter column user_id set not null;
end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_communications_updated_at on communications;
create trigger set_communications_updated_at
before update on communications
for each row
execute function set_updated_at();

drop trigger if exists set_ventures_updated_at on ventures;
create trigger set_ventures_updated_at
before update on ventures
for each row
execute function set_updated_at();

alter table communications
  drop constraint if exists communications_user_id_purpose_key;

alter table communications
  add constraint communications_user_id_purpose_key unique (user_id, purpose);

drop policy if exists "anon can read communications" on communications;
drop policy if exists "anon can insert communications" on communications;
drop policy if exists "anon can update communications" on communications;

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

drop policy if exists "anon can read ventures" on ventures;
drop policy if exists "anon can insert ventures" on ventures;
drop policy if exists "anon can update ventures" on ventures;
drop policy if exists "anon can delete ventures" on ventures;

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

create table if not exists daemon_payloads (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('feature_files', 'parameter_files', 'agent_chat')),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table daemon_payloads enable row level security;

drop trigger if exists set_daemon_payloads_updated_at on daemon_payloads;
create trigger set_daemon_payloads_updated_at
before update on daemon_payloads
for each row
execute function set_updated_at();

create policy "authenticated users can read own daemon payloads"
on daemon_payloads
for select
to authenticated
using (user_id = auth.uid());

create or replace function daemon_get_communication(
  p_user_id uuid,
  p_purpose text
)
returns table(message text, purpose text)
language sql
security definer
set search_path = public
as $$
  select communications.message, communications.purpose
  from communications
  where communications.user_id = p_user_id
    and communications.purpose = p_purpose
  limit 1;
$$;

create or replace function daemon_upsert_communication(
  p_user_id uuid,
  p_purpose text,
  p_message text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into communications (user_id, purpose, message)
  values (p_user_id, p_purpose, p_message)
  on conflict (user_id, purpose)
  do update set
    message = excluded.message,
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
  if p_kind not in ('feature_files', 'parameter_files', 'agent_chat') then
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

grant execute on function daemon_get_communication(uuid, text) to anon;
grant execute on function daemon_upsert_communication(uuid, text, text) to anon;
grant execute on function daemon_upsert_payload(uuid, text, jsonb) to anon;
