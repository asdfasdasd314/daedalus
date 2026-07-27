-- Conversations own the user-visible transcript; agent_tasks own every turn.
create table if not exists agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  repository text not null default '',
  legacy_conversation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_conversation_id)
);
alter table agent_conversations enable row level security;
drop policy if exists "authenticated users can read own agent conversations" on agent_conversations;
create policy "authenticated users can read own agent conversations" on agent_conversations
  for select to authenticated using (user_id = auth.uid());

-- Preserve the old text linkage only long enough to map existing rows safely.
alter table agent_tasks rename column conversation_id to legacy_conversation_id;
alter table agent_tasks add column conversation_id uuid references agent_conversations(id) on delete cascade;
alter table agent_tasks add column if not exists prompt_id text;
alter table agent_tasks add column if not exists task_type text not null default 'implementation'
  check (task_type in ('implementation', 'planning', 'ask'));
alter table agent_tasks add column if not exists source text not null default 'durable_task'
  check (source in ('durable_task', 'direct_prompt'));
alter table agent_tasks add column if not exists status_detail text not null default '';

-- The old projection assumes conversation_id is text and is incompatible with
-- the UUID column above. Retire it before updating existing task rows.
drop trigger if exists project_agent_task_history on agent_tasks;
drop function if exists project_agent_task_to_output_history();

insert into agent_conversations (user_id, repository, legacy_conversation_id, created_at, updated_at)
select user_id, max(repository), conversation_key, min(created_at), max(updated_at)
from (
  select user_id, repository, coalesce(nullif(conversation_id::text, ''), prompt_id) conversation_key, created_at, updated_at
  from agent_output_history
  union all
  select user_id, repository, coalesce(nullif(legacy_conversation_id::text, ''), id::text), created_at, updated_at
  from agent_tasks
) turns
group by user_id, conversation_key
on conflict (user_id, legacy_conversation_id) do nothing;

update agent_tasks task set
  conversation_id = conversation.id,
  prompt_id = coalesce(nullif(task.prompt_id, ''), task.id::text)
from agent_conversations conversation
where conversation.user_id = task.user_id
  and conversation.legacy_conversation_id = coalesce(nullif(task.legacy_conversation_id::text, ''), task.id::text);

-- Historic direct turns become first-class tasks. UUID v5-like deterministic IDs
-- are unnecessary here: the legacy task ID is retained when present, and each
-- remaining history row receives a fresh durable task exactly once.
insert into agent_tasks (
  id, user_id, conversation_id, prompt_id, repository, prompt, provider, model,
  reasoning, planning_mode, targeted_feature_paths, status, result, error,
  created_at, started_at, completed_at, updated_at, message, task_type, source, status_detail
)
select gen_random_uuid(), history.user_id, conversation.id, history.prompt_id,
  history.repository, history.prompt, history.provider, history.model, history.reasoning,
  history.mode = 'planning', history.targeted_feature_paths, history.status,
  history.output, history.error, history.created_at, history.started_at,
  history.completed_at, history.updated_at, 'client_complete',
  case history.mode when 'planning' then 'planning' when 'ask' then 'ask' else 'implementation' end,
  history.source, coalesce(history.status_detail, '')
from agent_output_history history
join agent_conversations conversation on conversation.user_id = history.user_id
  and conversation.legacy_conversation_id = coalesce(nullif(history.conversation_id::text, ''), history.prompt_id)
where not exists (
  select 1 from agent_tasks task where task.user_id = history.user_id
    and task.prompt_id = history.prompt_id
);

update agent_tasks task set
  prompt_id = coalesce(nullif(task.prompt_id, ''), task.id::text),
  task_type = case when task.planning_mode then 'planning' else task.task_type end,
  status_detail = coalesce(nullif(task.status_detail, ''), task.error, '')
where task.conversation_id is not null;

create or replace function assign_agent_task_conversation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.conversation_id is null then
    insert into agent_conversations (user_id,repository,legacy_conversation_id)
    values (new.user_id,new.repository,coalesce(nullif(new.legacy_conversation_id::text,''),new.id::text))
    returning id into new.conversation_id;
  end if;
  new.prompt_id := coalesce(nullif(new.prompt_id,''),new.id::text);
  return new;
end; $$;
drop trigger if exists assign_agent_task_conversation_before_insert on agent_tasks;
create trigger assign_agent_task_conversation_before_insert before insert on agent_tasks
for each row execute function assign_agent_task_conversation();
alter table agent_tasks alter column conversation_id set not null;
alter table agent_tasks alter column prompt_id set not null;
create unique index if not exists agent_tasks_user_prompt_id_idx on agent_tasks (user_id, prompt_id);
create index if not exists agent_tasks_conversation_turn_idx on agent_tasks (user_id, conversation_id, created_at, id);
create unique index if not exists agent_conversations_single_active_task_idx
  on agent_tasks (conversation_id)
  where status in ('queued', 'running', 'verifying', 'ready', 'integrating', 'resolving');

create table if not exists agent_conversation_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Intentionally not a foreign key: the client must observe the completed
  -- acknowledgement after the conversation itself has been removed.
  conversation_id uuid not null,
  message text not null default 'daemon_review' check (message in ('daemon_review', 'client_review', 'client_complete')),
  status text not null default 'requested' check (status in ('requested', 'completed', 'rejected')),
  error text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, conversation_id, status)
);
create table if not exists agent_conversation_deletion_request_items (
  request_id uuid not null references agent_conversation_deletion_requests(id) on delete cascade,
  task_id uuid not null, expected_updated_at timestamptz not null,
  primary key (request_id, task_id)
);
alter table agent_conversation_deletion_requests enable row level security;
alter table agent_conversation_deletion_request_items enable row level security;
create policy "authenticated users can read own conversation deletion requests" on agent_conversation_deletion_requests for select to authenticated using (user_id = auth.uid());
create policy "authenticated users can read own conversation deletion request items" on agent_conversation_deletion_request_items for select to authenticated using (exists (select 1 from agent_conversation_deletion_requests request where request.id = request_id and request.user_id = auth.uid()));
create index if not exists agent_conversation_deletion_requests_daemon_idx on agent_conversation_deletion_requests (user_id, created_at, id) where message = 'daemon_review';

create or replace function request_conversation_deletion(p_conversation_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare request_id uuid;
begin
  if not exists (select 1 from agent_conversations where id=p_conversation_id and user_id=auth.uid()) then
    raise exception 'Conversation is unavailable for deletion';
  end if;
  if exists (select 1 from agent_tasks where conversation_id=p_conversation_id and user_id=auth.uid() and status not in ('completed','failed','blocked','cancelled')) then
    raise exception 'Cancel or finish the active task before deleting this conversation';
  end if;
  insert into agent_conversation_deletion_requests (user_id, conversation_id)
  values (auth.uid(), p_conversation_id)
  on conflict (user_id, conversation_id, status) do update set message='daemon_review', error='', updated_at=now()
  returning id into request_id;
  insert into agent_conversation_deletion_request_items (request_id, task_id, expected_updated_at)
  select request_id, id, updated_at from agent_tasks where user_id=auth.uid() and conversation_id=p_conversation_id
  on conflict do nothing;
  return request_id;
end; $$;

create or replace function daemon_list_conversation_deletion_requests(p_user_id uuid)
returns table (id uuid, conversation_id uuid, task_ids jsonb, tasks jsonb) language sql security definer set search_path=public as $$
  select request.id, request.conversation_id,
    coalesce(jsonb_agg(item.task_id order by item.task_id), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('id', task.id, 'repository', task.repository, 'worktree_path', task.worktree_path, 'updated_at', item.expected_updated_at) order by task.id), '[]'::jsonb)
  from agent_conversation_deletion_requests request
  join agent_conversation_deletion_request_items item on item.request_id=request.id
  join agent_tasks task on task.id=item.task_id
  where request.user_id=p_user_id and request.message='daemon_review'
  group by request.id, request.conversation_id order by min(request.created_at), request.id limit 1;
$$;

create or replace function daemon_complete_conversation_deletion(p_user_id uuid, p_request_id uuid, p_error text default '')
returns boolean language plpgsql security definer set search_path=public as $$
declare request_row agent_conversation_deletion_requests%rowtype; item_count integer; deleted_count integer;
begin
  select * into request_row from agent_conversation_deletion_requests where id=p_request_id and user_id=p_user_id and message='daemon_review' for update;
  if not found then return false; end if;
  if p_error <> '' then update agent_conversation_deletion_requests set status='rejected',error=p_error,message='client_review',updated_at=now() where id=p_request_id; return true; end if;
  perform 1 from agent_tasks task join agent_conversation_deletion_request_items item on item.task_id=task.id
    where item.request_id=p_request_id and task.user_id=p_user_id for update;
  select count(*) into item_count from agent_conversation_deletion_request_items where request_id=p_request_id;
  if exists (select 1 from agent_conversation_deletion_request_items item left join agent_tasks task on task.id=item.task_id
    where item.request_id=p_request_id and (task.id is null or task.user_id<>p_user_id or task.updated_at<>item.expected_updated_at or task.status not in ('completed','failed','blocked','cancelled'))) then
    update agent_conversation_deletion_requests set status='rejected',error='Conversation changed before deletion could be completed.',message='client_review',updated_at=now() where id=p_request_id; return true;
  end if;
  delete from agent_conversations where id=request_row.conversation_id and user_id=p_user_id;
  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then update agent_conversation_deletion_requests set status='rejected',error='Conversation is no longer available for deletion.',message='client_review',updated_at=now() where id=p_request_id; return true; end if;
  update agent_conversation_deletion_requests set status='completed',error='',message='client_review',updated_at=now() where id=p_request_id;
  return item_count >= 0;
end; $$;

create or replace function daemon_upsert_agent_task_turn(
  p_user_id uuid, p_prompt_id text, p_repository text, p_prompt text,
  p_output text, p_error text, p_provider text, p_model text, p_reasoning text,
  p_conversation_id uuid, p_mode text, p_targeted_feature_paths jsonb,
  p_status text, p_status_detail text default null
) returns void language plpgsql security definer set search_path=public as $$
declare conversation_id_value uuid;
begin
  if p_mode not in ('planning','ask') or p_status not in ('running','completed','failed','cancelled') then
    raise exception 'Unsupported direct task turn';
  end if;
  conversation_id_value := coalesce(p_conversation_id, gen_random_uuid());
  insert into agent_conversations (id,user_id,repository,legacy_conversation_id)
  values (conversation_id_value,p_user_id,p_repository,conversation_id_value::text)
  on conflict (id) do update set updated_at=now();
  insert into agent_tasks (id,user_id,conversation_id,prompt_id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,status,result,error,started_at,completed_at,message,task_type,source,status_detail)
  values (gen_random_uuid(),p_user_id,conversation_id_value,p_prompt_id,p_repository,p_prompt,coalesce(p_provider,''),coalesce(p_model,''),coalesce(p_reasoning,''),p_mode='planning',coalesce(p_targeted_feature_paths,'[]'::jsonb),p_status,coalesce(p_output,''),coalesce(p_error,''),now(),case when p_status in ('completed','failed','cancelled') then now() else null end,'client_complete',p_mode,'direct_prompt',coalesce(p_status_detail,''))
  on conflict (user_id,prompt_id) do update set result=excluded.result,error=excluded.error,status=excluded.status,status_detail=excluded.status_detail,provider=excluded.provider,model=excluded.model,reasoning=excluded.reasoning,completed_at=excluded.completed_at,updated_at=now();
end; $$;

create or replace function daemon_list_agent_tasks(p_user_id uuid)
returns setof agent_tasks language sql security definer set search_path=public as $$
  select task.* from agent_tasks task where task.user_id=p_user_id and task.message='daemon_review'
    and not exists (select 1 from agent_conversation_deletion_requests request where request.user_id=p_user_id and request.conversation_id=task.conversation_id and request.message='daemon_review')
  order by task.queue_sequence limit 100;
$$;

-- Normalized read APIs retain the existing browser exchange payload shape.
create or replace function get_agent_conversation_page(p_cursor_completed_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 31)
returns table (id uuid,prompt_id text,task_id uuid,conversation_id uuid,repository text,prompt text,provider text,model text,reasoning text,mode text,source text,targeted_feature_paths jsonb,status text,status_detail text,created_at timestamptz,started_at timestamptz,completed_at timestamptz,updated_at timestamptz) language sql stable security definer set search_path=public as $$
  with latest as (select distinct on (conversation_id) * from agent_tasks where user_id=auth.uid() order by conversation_id,coalesce(completed_at,updated_at) desc,id desc)
  select id,prompt_id,id,conversation_id,repository,left(prompt,240),provider,model,reasoning,case task_type when 'planning' then 'planning' when 'ask' then 'ask' else 'standard' end,source,targeted_feature_paths,status,status_detail,created_at,started_at,completed_at,updated_at from latest
  where completed_at is not null and (p_cursor_completed_at is null or (completed_at,id)<(p_cursor_completed_at,p_cursor_id)) order by completed_at desc,id desc limit least(greatest(p_limit,1),31);
$$;
create or replace function get_agent_conversation_tasks(p_conversation_id uuid)
returns table (id uuid,prompt_id text,task_id uuid,conversation_id uuid,repository text,prompt text,output text,error text,provider text,model text,reasoning text,mode text,source text,targeted_feature_paths jsonb,status text,status_detail text,created_at timestamptz,started_at timestamptz,completed_at timestamptz,updated_at timestamptz) language sql stable security definer set search_path=public as $$
 select id,prompt_id,id,conversation_id,repository,prompt,result,error,provider,model,reasoning,case task_type when 'planning' then 'planning' when 'ask' then 'ask' else 'standard' end,source,targeted_feature_paths,status,status_detail,created_at,started_at,completed_at,updated_at from agent_tasks where user_id=auth.uid() and conversation_id=p_conversation_id order by created_at,id;
$$;
create or replace function search_agent_conversations(p_query text,p_limit integer default 50)
returns table (id uuid,prompt_id text,task_id uuid,conversation_id uuid,repository text,prompt text,provider text,model text,reasoning text,mode text,source text,targeted_feature_paths jsonb,status text,status_detail text,created_at timestamptz,started_at timestamptz,completed_at timestamptz,updated_at timestamptz) language sql stable security definer set search_path=public as $$
 select distinct on (task.conversation_id) task.id,task.prompt_id,task.id,task.conversation_id,task.repository,left(task.prompt,240),task.provider,task.model,task.reasoning,case task.task_type when 'planning' then 'planning' when 'ask' then 'ask' else 'standard' end,task.source,task.targeted_feature_paths,task.status,task.status_detail,task.created_at,task.started_at,task.completed_at,task.updated_at from agent_tasks task where task.user_id=auth.uid() and (nullif(trim(p_query),'') is null or concat_ws(' ',task.prompt,task.result,task.repository,task.targeted_feature_paths::text,task.provider,task.model,task.task_type,task.status) ilike '%'||trim(p_query)||'%') order by task.conversation_id,coalesce(task.completed_at,task.updated_at) desc,task.id desc limit least(greatest(p_limit,1),200);
$$;
create or replace function summarize_agent_conversation_features()
returns table(repository text,feature_path text,result_count bigint,latest_activity timestamptz) language sql stable security definer set search_path=public as $$
 select task.repository,feature.value,count(distinct task.conversation_id),max(coalesce(task.completed_at,task.updated_at))
 from agent_tasks task cross join lateral jsonb_array_elements_text(task.targeted_feature_paths) feature(value)
 where task.user_id=auth.uid() group by task.repository,feature.value;
$$;
create or replace function get_agent_conversation_deletion_requests()
returns table(id uuid,conversation_id uuid,task_ids jsonb,status text,error text,updated_at timestamptz) language sql stable security definer set search_path=public as $$
 select request.id,request.conversation_id,coalesce(jsonb_agg(item.task_id order by item.task_id),'[]'::jsonb),request.status,request.error,request.updated_at
 from agent_conversation_deletion_requests request left join agent_conversation_deletion_request_items item on item.request_id=request.id
 where request.user_id=auth.uid() group by request.id order by request.updated_at desc limit 100;
$$;

-- Architecture View is now owned by its implementation task; prompt lookup is
-- retained by the existing RPCs until consumers finish their cutover.
alter table architecture_views add column if not exists task_id uuid references agent_tasks(id) on delete cascade;
update architecture_views view set task_id=task.id from agent_tasks task
where view.user_id=task.user_id and view.prompt_id=task.prompt_id and view.task_id is null;

create or replace function get_client_review_inbox()
returns jsonb language sql stable security definer set search_path=public as $$
 with owner as(select auth.uid() user_id) select jsonb_build_object(
  'communications',coalesce((select jsonb_agg(to_jsonb(r)) from (select purpose,content,updated_at from communications,owner where communications.user_id=owner.user_id and communications.message='client_review' limit 10)r),'[]'),
  'daemonPayloads',coalesce((select jsonb_agg(to_jsonb(r)) from (select kind,payload,updated_at from daemon_payloads,owner where daemon_payloads.user_id=owner.user_id and daemon_payloads.message='client_review' limit 4)r),'[]'),
  'agentTasks',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,status,queue_sequence,created_at,started_at,completed_at,error,verification_attempts,resolver_attempts,cancel_requested,retry_generation,updated_at from agent_tasks,owner where agent_tasks.user_id=owner.user_id and agent_tasks.message='client_review' limit 50)r),'[]'),
  'conversationDeletionRequests',coalesce((select jsonb_agg(to_jsonb(r)) from (select request.id,request.conversation_id,coalesce((select jsonb_agg(item.task_id) from agent_conversation_deletion_request_items item where item.request_id=request.id),'[]'::jsonb) task_ids,request.status,request.error,request.updated_at from agent_conversation_deletion_requests request,owner where request.user_id=owner.user_id and request.message='client_review' limit 50)r),'[]'),
  'architectureViews',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,prompt_id,repository,base_commit,final_commit,targeted_feature_paths,generation,status,changed_files,architecture_document,error,failure_details,provider,model,reasoning,requested_at,started_at,completed_at,created_at,updated_at from architecture_views,owner where architecture_views.user_id=owner.user_id and architecture_views.message='client_review' limit 20)r),'[]'),
  'architectureProgressEvents','[]'::jsonb,'featureExecutionRuns','[]'::jsonb,'daemonEvents','[]'::jsonb,'managerStatus',null);
$$;
create or replace function acknowledge_client_reviews(receipts jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); r jsonb; ok jsonb:='[]'; stale jsonb:='[]'; begin
 for r in select value from jsonb_array_elements(receipts) loop
  case r->>'transport'
   when 'conversationDeletionRequests' then update agent_conversation_deletion_requests set message='client_complete' where id=(r->>'key')::uuid and user_id=owner_id and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
   when 'communications' then update communications set message='client_complete' where user_id=owner_id and purpose=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
   when 'daemonPayloads' then update daemon_payloads set message='client_complete' where user_id=owner_id and kind=r->>'key' and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
   when 'agentTasks' then update agent_tasks set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
   when 'architectureViews' then update architecture_views set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
   when 'featureExecutionRuns' then update feature_execution_runs set message='client_complete' where user_id=owner_id and id=(r->>'key')::uuid and message='client_review' and updated_at=(r->>'updatedAt')::timestamptz;
   when 'daemonEvents' then update daemon_events set message='client_complete' where user_id=owner_id and id=(r->>'key')::bigint and message='client_review';
   else continue;
  end case;
  if found then ok:=ok||jsonb_build_array(r->>'receiptId'); else stale:=stale||jsonb_build_array(r->>'receiptId'); end if;
 end loop; return jsonb_build_object('acknowledged',ok,'rejected',stale); end;
$$;

drop function if exists request_finalized_task_deletion(uuid,timestamptz);
drop function if exists delete_terminal_direct_prompt_agent_output_history(text);
grant execute on function request_conversation_deletion(uuid),get_agent_conversation_page(timestamptz,uuid,integer),get_agent_conversation_tasks(uuid),search_agent_conversations(text,integer),summarize_agent_conversation_features(),get_agent_conversation_deletion_requests(),get_client_review_inbox(),acknowledge_client_reviews(jsonb) to authenticated;
grant execute on function daemon_list_conversation_deletion_requests(uuid),daemon_complete_conversation_deletion(uuid,uuid,text) to anon;
grant execute on function daemon_upsert_agent_task_turn(uuid,text,text,text,text,text,text,text,text,uuid,text,jsonb,text,text) to anon;
