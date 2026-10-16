begin;
alter table public.operational_incidents add column if not exists sender_id text;
alter table public.operational_incidents add column if not exists notification_updated_at timestamptz not null default now();
create index if not exists operational_incidents_pending_idx on public.operational_incidents(created_at) where notification_state='pending';

create or replace function public.claim_incident_notification(p_incident_id text,p_sender_id text)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
  if p_sender_id is null or p_sender_id !~ '^[A-Za-z0-9_-]{1,100}$' then
    raise exception using errcode='22023',message='INVALID_NOTIFICATION_SENDER';
  end if;
  update public.operational_incidents
  set notification_state='sending',sender_id=p_sender_id,notification_updated_at=now()
  where execution_id=p_incident_id and notification_state='pending';
  return jsonb_build_object('acquired',found,'execution_id',p_incident_id);
end $fn$;

create or replace function public.finish_incident_notification(p_incident_id text,p_sender_id text,p_sent boolean)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
  if p_sent is null then raise exception using errcode='22023',message='NOTIFICATION_RESULT_REQUIRED'; end if;
  update public.operational_incidents
  set notification_state=case when p_sent then 'sent' else 'uncertain' end,notification_updated_at=now()
  where execution_id=p_incident_id and sender_id=p_sender_id and notification_state='sending';
  return jsonb_build_object('updated',found);
end $fn$;

revoke all on function public.claim_incident_notification(text,text) from public,anon,authenticated;
revoke all on function public.finish_incident_notification(text,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_incident_notification(text,text) to service_role;
grant execute on function public.finish_incident_notification(text,text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
