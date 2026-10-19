begin;

create or replace view public.agent_inventory
with (security_invoker=true, security_barrier=true) as
select c.id,c.lote_id,c.brand,c.model,c.year,c.price,c.status,c.image_url,c.image_urls,
  c.caracteristicas,c.enganche_minimo,c.kilometraje,c.transmision
from public.cars c join public.lotes l on l.id=c.lote_id
where l.plan_status='active';
revoke all on public.agent_inventory from public, anon, authenticated;
grant select on public.agent_inventory to service_role;

do $policies$
declare t text; cmd text; policy_name text; predicate text;
begin
  foreach t in array array['cars','leads','citas','car_expenses','chat_handoffs'] loop
    predicate := format('exists (select 1 from public.lotes l where l.id=%I.lote_id and l.profile_id=(select auth.uid()) and l.plan_status=''active'')',t);
    foreach cmd in array array['insert','update','delete'] loop
      policy_name:=t||'_paid_'||cmd;
      execute format('drop policy if exists %I on public.%I',policy_name,t);
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
        policy_name,t,cmd,case cmd when 'insert' then 'with check ('||predicate||')'
          when 'delete' then 'using ('||predicate||')'
          else 'using ('||predicate||') with check ('||predicate||')' end);
    end loop;
  end loop;
end $policies$;

revoke truncate, trigger, references on public.cars,public.leads,public.citas,public.chat_history,
  public.chat_handoffs,public.car_expenses,public.facturas,public.lotes from public,anon,authenticated;
revoke insert,update,delete on public.chat_history from public,anon,authenticated;
do $columns$
declare c record;
begin
  for c in select table_name,column_name from information_schema.columns where table_schema='public'
    and table_name in ('cars','leads','citas','chat_history','chat_handoffs','car_expenses','facturas','lotes') loop
    execute format('revoke references(%I) on public.%I from public,anon,authenticated',c.column_name,c.table_name);
    if c.table_name='chat_history' then
      execute format('revoke insert(%I),update(%I) on public.chat_history from public,anon,authenticated',c.column_name,c.column_name);
    end if;
  end loop;
end $columns$;
grant select on public.chat_history to authenticated;
alter table public.chat_history drop constraint if exists chat_history_role_check;
alter table public.chat_history add constraint chat_history_role_check check(role in ('user','model','human'));
alter function public.lotes_proteger_columnas_sensibles() set search_path='';
alter function public.citas_iniciar_documentos() set search_path='';
revoke execute on function public.lotes_proteger_columnas_sensibles(), public.citas_iniciar_documentos() from public,anon,authenticated;

create table if not exists public.cita_security_notifications (
  cita_id bigint primary key references public.citas(id) on delete cascade,
  execution_id text not null,
  state text not null check(state in ('claimed','accepted')),
  outbound_id text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
alter table public.cita_security_notifications enable row level security;
revoke all on public.cita_security_notifications from public,anon,authenticated;
grant select,insert,update on public.cita_security_notifications to service_role;

create or replace function public.claim_cita_security_notification(p_cita_id bigint,p_execution_id text)
returns jsonb language plpgsql set search_path='' as $$
declare v_cita public.citas%rowtype;
begin
  if p_cita_id is null or p_cita_id<=0 or p_execution_id is null
    or p_execution_id !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'INVALID_CITA_NOTIFICATION'; end if;
  select c.* into v_cita from public.citas c join public.lotes l on l.id=c.lote_id
    where c.id=p_cita_id and l.plan_status='active';
  if not found then return jsonb_build_object('acquired',false); end if;
  insert into public.cita_security_notifications(cita_id,execution_id,state)
    values(p_cita_id,p_execution_id,'claimed') on conflict do nothing;
  if not found then return jsonb_build_object('acquired',false); end if;
  return jsonb_build_object('acquired',true,'record',
    jsonb_set(to_jsonb(v_cita),'{id}',to_jsonb(v_cita.id::text)));
end $$;

create or replace function public.finish_cita_security_notification(p_cita_id bigint,p_execution_id text,p_outbound_id text)
returns jsonb language plpgsql set search_path='' as $$
begin
  if p_outbound_id is null or p_outbound_id !~ '^[A-Za-z0-9_-]{1,200}$' then raise exception 'MISSING_CITA_DELIVERY_ID'; end if;
  update public.cita_security_notifications set state='accepted',outbound_id=p_outbound_id,accepted_at=clock_timestamp()
    where cita_id=p_cita_id and execution_id=p_execution_id and state='claimed';
  if not found then raise exception 'CITA_NOTIFICATION_STATE_CONFLICT'; end if;
  return jsonb_build_object('accepted',true);
end $$;
revoke all on function public.claim_cita_security_notification(bigint,text),public.finish_cita_security_notification(bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.claim_cita_security_notification(bigint,text),public.finish_cita_security_notification(bigint,text,text)
  to service_role;
notify pgrst,'reload schema';
commit;
