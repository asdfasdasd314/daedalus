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
