-- Aplicar después de aprovisionar Vault y el mismo secreto en n8n, sin publicarlo.
begin;
do $$ begin
  if not exists(select 1 from vault.decrypted_secrets where name='velodrive_cita_webhook') then
    raise exception 'CITA_SECRET_NOT_PROVISIONED';
  end if;
end $$;
create or replace function public.notify_nueva_cita()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='velodrive_cita_webhook';
  if v_secret is null or length(v_secret)<32 then raise exception 'CITA_WEBHOOK_NOT_CONFIGURED'; end if;
  perform net.http_post(
    url := 'https://n8n-production-97a4.up.railway.app/webhook/nueva-cita-notificacion',
    headers := jsonb_build_object('Content-Type','application/json','x-cita-secret',v_secret),
    body := jsonb_build_object('cita_id',new.id::text), timeout_milliseconds := 10000
  );
  return new;
end $$;
revoke execute on function public.notify_nueva_cita() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
