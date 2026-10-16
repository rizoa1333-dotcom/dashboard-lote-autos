begin;
create table if not exists public.whatsapp_inbox (
  instance_name text not null,
  message_id text not null,
  lote_id uuid not null references public.lotes(id) on delete cascade,
  phone_number text not null check (phone_number ~ '^[0-9]{10,15}$'),
  execution_id text not null,
  state text not null default 'processing' check (state in ('processing','sending','accepted','completed','failed','uncertain')),
  outbound_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (instance_name,message_id)
);
create index if not exists whatsapp_inbox_execution_idx on public.whatsapp_inbox(execution_id);
create index if not exists whatsapp_inbox_pending_idx on public.whatsapp_inbox(updated_at) where state in ('processing','sending');
create unique index if not exists whatsapp_inbox_outbound_unique on public.whatsapp_inbox(instance_name,outbound_id) where outbound_id is not null;
alter table public.whatsapp_inbox enable row level security;
revoke all on public.whatsapp_inbox from public,anon,authenticated;
grant all on public.whatsapp_inbox to service_role;

create table if not exists public.operational_incidents (
  execution_id text primary key,
  workflow_id text,
  lote_id uuid references public.lotes(id) on delete cascade,
  node_name text not null,
  code text not null check (code in ('CREDENTIALS_UNAVAILABLE','DEPENDENCY_TIMEOUT','WORKFLOW_FAILED','STALE_EXECUTION')),
  created_at timestamptz not null default now(),
  notification_state text not null default 'pending' check (notification_state in ('pending','sending','sent','uncertain'))
);
alter table public.operational_incidents enable row level security;
revoke all on public.operational_incidents from public,anon,authenticated;
grant all on public.operational_incidents to service_role;

create or replace function public.claim_whatsapp_event(p_instance text,p_message_id text,p_phone text,p_execution_id text)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare tenant uuid; existing_state text; inserted boolean;
begin
  if p_instance is null or p_instance !~ '^[A-Za-z0-9_-]{1,120}$'
    or p_message_id is null or p_message_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_phone is null or p_phone !~ '^[0-9]{10,15}$'
    or p_execution_id is null or p_execution_id !~ '^[A-Za-z0-9_-]{1,100}$' then
    raise exception using errcode='22023',message='INVALID_EVENT_IDENTITY';
  end if;
  select c.lote_id into tenant from public.whatsapp_channels c where c.instance_name=p_instance;
  if tenant is null then raise exception using errcode='22023',message='CHANNEL_NOT_CONFIGURED'; end if;
  if exists(select 1 from public.whatsapp_inbox where instance_name=p_instance and outbound_id=p_message_id) then
    return jsonb_build_object('acquired',false,'lote_id',tenant,'state','ignored');
  end if;
  insert into public.whatsapp_inbox(instance_name,message_id,lote_id,phone_number,execution_id)
    values(p_instance,p_message_id,tenant,p_phone,p_execution_id)
    on conflict(instance_name,message_id) do nothing;
  inserted:=found;
  select state into existing_state from public.whatsapp_inbox where instance_name=p_instance and message_id=p_message_id;
  return jsonb_build_object('acquired',inserted,'lote_id',tenant,'state',existing_state);
end $fn$;

create or replace function public.begin_whatsapp_send(p_instance text,p_message_id text,p_execution_id text)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
  update public.whatsapp_inbox set state='sending',updated_at=now()
  where instance_name=p_instance and message_id=p_message_id and execution_id=p_execution_id and state='processing';
  return jsonb_build_object('send',found);
end $fn$;

create or replace function public.finish_whatsapp_event(p_instance text,p_message_id text,p_execution_id text,p_state text,p_outbound_id text default null)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
  if p_state='accepted' then
    if p_outbound_id is null or p_outbound_id !~ '^[A-Za-z0-9_-]{1,128}$' then
      raise exception using errcode='22023',message='OUTBOUND_ID_REQUIRED';
    end if;
    update public.whatsapp_inbox set state='accepted',outbound_id=p_outbound_id,updated_at=now()
    where instance_name=p_instance and message_id=p_message_id and execution_id=p_execution_id and state='sending';
  elsif p_state='completed' then
    update public.whatsapp_inbox set state='completed',updated_at=now()
    where instance_name=p_instance and message_id=p_message_id and execution_id=p_execution_id and state in ('processing','accepted');
  else raise exception using errcode='22023',message='INVALID_EVENT_TRANSITION';
  end if;
  return jsonb_build_object('updated',found);
end $fn$;

create or replace function public.record_whatsapp_failure(p_execution_id text,p_workflow_id text,p_node_name text,p_code text)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare tenant uuid;
begin
  if p_execution_id is null or p_execution_id !~ '^[A-Za-z0-9_-]{1,100}$'
     or p_code not in ('CREDENTIALS_UNAVAILABLE','DEPENDENCY_TIMEOUT','WORKFLOW_FAILED','STALE_EXECUTION') then
    raise exception using errcode='22023',message='INVALID_INCIDENT';
  end if;
  update public.whatsapp_inbox set state=case when state='sending' then 'uncertain' else 'failed' end,updated_at=now()
  where execution_id=p_execution_id and state in ('processing','sending') returning lote_id into tenant;
  if tenant is null then select lote_id into tenant from public.whatsapp_inbox where execution_id=p_execution_id limit 1; end if;
  insert into public.operational_incidents(execution_id,workflow_id,lote_id,node_name,code)
  values(p_execution_id,left(p_workflow_id,100),tenant,left(coalesce(p_node_name,'unknown'),120),p_code)
  on conflict(execution_id) do nothing;
  return jsonb_build_object('recorded',true,'execution_id',p_execution_id,'code',p_code);
end $fn$;

create or replace function public.collect_stale_whatsapp_events()
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare item record; total integer:=0;
begin
  for item in select execution_id from public.whatsapp_inbox where state in ('processing','sending') and updated_at<now()-interval '10 minutes' limit 100 loop
    perform public.record_whatsapp_failure(item.execution_id,null,'execution_watchdog','STALE_EXECUTION');
    total:=total+1;
  end loop;
  return jsonb_build_object('incidents',total);
end $fn$;

revoke all on function public.claim_whatsapp_event(text,text,text,text) from public,anon,authenticated;
revoke all on function public.begin_whatsapp_send(text,text,text) from public,anon,authenticated;
revoke all on function public.finish_whatsapp_event(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.record_whatsapp_failure(text,text,text,text) from public,anon,authenticated;
revoke all on function public.collect_stale_whatsapp_events() from public,anon,authenticated;
grant execute on function public.claim_whatsapp_event(text,text,text,text) to service_role;
grant execute on function public.begin_whatsapp_send(text,text,text) to service_role;
grant execute on function public.finish_whatsapp_event(text,text,text,text,text) to service_role;
grant execute on function public.record_whatsapp_failure(text,text,text,text) to service_role;
grant execute on function public.collect_stale_whatsapp_events() to service_role;
notify pgrst,'reload schema';
commit;
