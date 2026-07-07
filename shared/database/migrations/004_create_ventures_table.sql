create type venture_progress_state as enum ('idle', 'in progress', 'completed');

create table ventures (
  created_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  progress_state venture_progress_state not null default 'idle',
  venture_name text not null
);
