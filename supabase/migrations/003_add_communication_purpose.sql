alter table communications
add column purpose text;

update communications
set purpose = 'feature_file_load'
where purpose is null;

alter table communications
alter column purpose set not null;

insert into communications (message, purpose)
select '', 'agent_prompt'
where not exists (
  select 1
  from communications
  where purpose = 'agent_prompt'
);
