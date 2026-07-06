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
