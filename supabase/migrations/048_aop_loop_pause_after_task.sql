-- AOP loop debug pause controls:
-- pause_after_task: sticky — after each successful coding integrate, hold for operator inspect
-- pause_requested: one-shot — operator hit Pause while work was in flight; apply at next safe point

alter table aop_execution_loops
  add column if not exists pause_after_task boolean not null default false;

alter table aop_execution_loops
  add column if not exists pause_requested boolean not null default false;
