create table communications (
  message text not null,
  purpose text not null
);

alter table communications enable row level security;

create policy "anon can read communications"
on communications
for select
to anon
using (true);

create policy "anon can insert communications"
on communications
for insert
to anon
with check (true);

create policy "anon can update communications"
on communications
for update
to anon
using (true)
with check (true);

create type venture_progress_state as enum ('idle', 'in progress', 'completed');

create table ventures (
  created_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  progress_state venture_progress_state not null default 'idle',
  venture_name text not null,
  project_directory text,
  details text
);

alter table ventures enable row level security;

create policy "anon can read ventures"
on ventures
for select
to anon
using (true);

create policy "anon can insert ventures"
on ventures
for insert
to anon
with check (true);

create policy "anon can update ventures"
on ventures
for update
to anon
using (true)
with check (true);

create policy "anon can delete ventures"
on ventures
for delete
to anon
using (true);
