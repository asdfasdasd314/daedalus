-- Allow direct bridge agent turns and surface them in conversation history mode mapping.

alter table agent_output_history drop constraint if exists agent_output_history_mode_check;
alter table agent_output_history
  add constraint agent_output_history_mode_check
  check (mode in ('standard', 'planning', 'ask', 'bridge'));

alter table agent_tasks drop constraint if exists agent_tasks_task_type_check;
alter table agent_tasks
  add constraint agent_tasks_task_type_check
  check (task_type in ('implementation', 'planning', 'ask', 'bridge'));

create or replace function daemon_upsert_agent_task_turn(
  p_user_id uuid, p_prompt_id text, p_repository text, p_prompt text,
  p_output text, p_error text, p_provider text, p_model text, p_reasoning text,
  p_conversation_id uuid, p_mode text, p_targeted_feature_paths jsonb,
  p_status text, p_status_detail text default null
) returns void language plpgsql security definer set search_path=public as $$
declare conversation_id_value uuid;
begin
  if p_mode not in ('planning','ask','bridge') or p_status not in ('running','completed','failed','cancelled') then
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

create or replace function get_agent_conversation_page(p_cursor_completed_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 31)
returns table (id uuid,prompt_id text,task_id uuid,conversation_id uuid,repository text,prompt text,provider text,model text,reasoning text,mode text,source text,targeted_feature_paths jsonb,status text,status_detail text,created_at timestamptz,started_at timestamptz,completed_at timestamptz,updated_at timestamptz) language sql stable security definer set search_path=public as $$
  with latest as (select distinct on (conversation_id) * from agent_tasks where user_id=auth.uid() order by conversation_id,coalesce(completed_at,updated_at) desc,id desc)
  select id,prompt_id,id,conversation_id,repository,left(prompt,240),provider,model,reasoning,case task_type when 'planning' then 'planning' when 'ask' then 'ask' when 'bridge' then 'bridge' else 'standard' end,source,targeted_feature_paths,status,status_detail,created_at,started_at,completed_at,updated_at from latest
  where completed_at is not null and (p_cursor_completed_at is null or (completed_at,id)<(p_cursor_completed_at,p_cursor_id)) order by completed_at desc,id desc limit least(greatest(p_limit,1),31);
$$;

create or replace function get_agent_conversation_tasks(p_conversation_id uuid)
returns table (id uuid,prompt_id text,task_id uuid,conversation_id uuid,repository text,prompt text,output text,error text,provider text,model text,reasoning text,mode text,source text,targeted_feature_paths jsonb,status text,status_detail text,created_at timestamptz,started_at timestamptz,completed_at timestamptz,updated_at timestamptz) language sql stable security definer set search_path=public as $$
 select id,prompt_id,id,conversation_id,repository,prompt,result,error,provider,model,reasoning,case task_type when 'planning' then 'planning' when 'ask' then 'ask' when 'bridge' then 'bridge' else 'standard' end,source,targeted_feature_paths,status,status_detail,created_at,started_at,completed_at,updated_at from agent_tasks where user_id=auth.uid() and conversation_id=p_conversation_id order by created_at,id;
$$;

create or replace function search_agent_conversations(p_query text,p_limit integer default 50)
returns table (id uuid,prompt_id text,task_id uuid,conversation_id uuid,repository text,prompt text,provider text,model text,reasoning text,mode text,source text,targeted_feature_paths jsonb,status text,status_detail text,created_at timestamptz,started_at timestamptz,completed_at timestamptz,updated_at timestamptz) language sql stable security definer set search_path=public as $$
 select distinct on (task.conversation_id) task.id,task.prompt_id,task.id,task.conversation_id,task.repository,left(task.prompt,240),task.provider,task.model,task.reasoning,case task.task_type when 'planning' then 'planning' when 'ask' then 'ask' when 'bridge' then 'bridge' else 'standard' end,task.source,task.targeted_feature_paths,task.status,task.status_detail,task.created_at,task.started_at,task.completed_at,task.updated_at from agent_tasks task where task.user_id=auth.uid() and (nullif(trim(p_query),'') is null or concat_ws(' ',task.prompt,task.result,task.repository,task.targeted_feature_paths::text,task.provider,task.model,task.task_type,task.status) ilike '%'||trim(p_query)||'%') order by task.conversation_id,coalesce(task.completed_at,task.updated_at) desc,task.id desc limit least(greatest(p_limit,1),200);
$$;

-- Legacy direct-history upsert remains for compatibility if any callers still invoke it.
create or replace function daemon_upsert_agent_output_history(
  p_user_id uuid, p_prompt_id text, p_repository text, p_prompt text,
  p_output text, p_error text, p_provider text, p_model text, p_reasoning text,
  p_conversation_id text, p_mode text, p_targeted_feature_paths jsonb, p_status text,
  p_status_detail text default null, p_started_at timestamptz default null,
  p_completed_at timestamptz default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_mode not in ('planning', 'ask', 'bridge') then raise exception 'Direct prompt history only supports planning, ask, and bridge modes'; end if;
  if p_status not in ('running', 'completed', 'failed', 'cancelled') then raise exception 'Unsupported direct prompt history status: %', p_status; end if;
  if nullif(trim(p_prompt_id), '') is null then raise exception 'Prompt ID is required'; end if;
  insert into agent_output_history (
    user_id, prompt_id, conversation_id, repository, prompt, output, error, provider, model,
    reasoning, mode, source, targeted_feature_paths, status, status_detail,
    started_at, completed_at
  ) values (
    p_user_id, p_prompt_id, coalesce(nullif(trim(p_conversation_id), ''), p_prompt_id), p_repository, p_prompt, coalesce(p_output, ''),
    coalesce(p_error, ''), coalesce(p_provider, ''), coalesce(p_model, ''),
    coalesce(p_reasoning, ''), p_mode, 'direct_prompt',
    coalesce(p_targeted_feature_paths, '[]'::jsonb), p_status,
    left(p_status_detail, 500), coalesce(p_started_at, now()),
    case when p_status in ('completed', 'failed', 'cancelled') then coalesce(p_completed_at, now()) else p_completed_at end
  ) on conflict (user_id, prompt_id) do update set
    conversation_id = excluded.conversation_id, repository = excluded.repository, prompt = excluded.prompt,
    output = excluded.output, error = excluded.error, provider = excluded.provider,
    model = excluded.model, reasoning = excluded.reasoning, mode = excluded.mode,
    targeted_feature_paths = excluded.targeted_feature_paths,
    status = excluded.status, status_detail = excluded.status_detail,
    started_at = coalesce(agent_output_history.started_at, excluded.started_at),
    completed_at = excluded.completed_at, updated_at = now();
end;
$$;
