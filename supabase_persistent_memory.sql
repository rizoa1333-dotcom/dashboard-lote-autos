begin;
alter table public.chat_history add column if not exists provider_message_id text;
alter table public.chat_history add column if not exists source text not null default 'legacy';
create unique index if not exists chat_history_provider_unique
  on public.chat_history(lote_id,phone_number,role,provider_message_id) where provider_message_id is not null;
create index if not exists chat_history_conversation_recent_idx
  on public.chat_history(lote_id,phone_number,created_at desc,id desc);

create or replace function public.append_conversation_message(
  p_lote_id uuid,p_phone_number text,p_role text,p_content text,p_provider_message_id text,p_source text
) returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
  if p_lote_id is null or p_phone_number is null or p_phone_number !~ '^[0-9]{10,15}$'
    or p_provider_message_id is null or p_provider_message_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_content is null or length(p_content) not between 1 and 16000
    or p_role is null or p_source is null
    or not ((p_role='user' and p_source='customer') or (p_role='human' and p_source='human')
      or (p_role='model' and p_source in ('agent','documents','fallback'))) then
    raise exception using errcode='22023',message='INVALID_CONVERSATION_MESSAGE';
  end if;
  insert into public.chat_history(lote_id,phone_number,role,content,provider_message_id,source)
  values(p_lote_id,p_phone_number,p_role,p_content,p_provider_message_id,p_source)
  on conflict(lote_id,phone_number,role,provider_message_id) where provider_message_id is not null do nothing;
  return jsonb_build_object('recorded',found);
end $fn$;

create or replace function public.get_conversation_context(
  p_lote_id uuid,p_phone_number text,p_current_message_id text,p_limit integer default 24
) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare anchor public.chat_history%rowtype; history jsonb;
begin
  if p_lote_id is null or p_phone_number is null or p_phone_number !~ '^[0-9]{10,15}$'
    or p_current_message_id is null or p_current_message_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode='22023',message='INVALID_CONVERSATION_IDENTITY';
  end if;
  select * into anchor from public.chat_history where lote_id=p_lote_id and phone_number=p_phone_number
    and role='user' and provider_message_id=p_current_message_id;
  if not found then raise exception using errcode='22023',message='CURRENT_MESSAGE_NOT_RECORDED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id::text,'lote_id',h.lote_id,
    'phone_number',h.phone_number,'role',h.role,'content',h.content,'created_at',h.created_at,
    'provider_message_id',h.provider_message_id,'source',h.source) order by h.created_at,h.id),'[]'::jsonb)
    into history from (
      select * from public.chat_history where lote_id=p_lote_id and phone_number=p_phone_number
        and (created_at,id)<(anchor.created_at,anchor.id)
      order by created_at desc,id desc limit p_limit
    ) h;
  return jsonb_build_object('lote_id',p_lote_id,'phone_number',p_phone_number,'messages',history);
end $fn$;
revoke all on function public.append_conversation_message(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.get_conversation_context(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.append_conversation_message(uuid,text,text,text,text,text) to service_role;
grant execute on function public.get_conversation_context(uuid,text,text,integer) to service_role;
create or replace function public.accept_conversation_reply(
  p_instance text,p_message_id text,p_execution_id text,p_outbound_id text,p_content text,p_source text
) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare event public.whatsapp_inbox%rowtype;
begin
  if p_outbound_id is null or p_outbound_id !~ '^[A-Za-z0-9_-]{1,128}$' then
    raise exception using errcode='22023',message='OUTBOUND_ID_REQUIRED';
  end if;
  select * into event from public.whatsapp_inbox where instance_name=p_instance
    and message_id=p_message_id and execution_id=p_execution_id for update;
  if not found or event.state not in ('sending','accepted','completed') then
    return jsonb_build_object('updated',false);
  end if;
  if event.outbound_id is not null and event.outbound_id<>p_outbound_id then
    raise exception using errcode='22023',message='OUTBOUND_ID_MISMATCH';
  end if;
  perform public.append_conversation_message(event.lote_id,event.phone_number,'model',p_content,p_message_id,p_source);
  if event.state='sending' then
    update public.whatsapp_inbox set state='accepted',outbound_id=p_outbound_id,updated_at=now()
      where instance_name=p_instance and message_id=p_message_id;
  end if;
  return jsonb_build_object('updated',true);
end $fn$;
revoke all on function public.accept_conversation_reply(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.accept_conversation_reply(text,text,text,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
