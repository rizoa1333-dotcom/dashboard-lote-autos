-- The destination has no registered consumer in the current n8n instance.
-- Disable reversibly; preserve the definition and all inventory records.
begin;
do $$
declare destination text;
begin
  select split_part((string_to_array(encode(t.tgargs,'escape'),E'\\000'))[1],'?',1)
    into destination
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid
  join pg_namespace pn on pn.oid=p.pronamespace
  where n.nspname='public' and c.relname='cars'
    and t.tgname='notificacion_auto_nuevo'
    and pn.nspname='supabase_functions' and p.proname='http_request';
  if destination is null then
    raise exception 'LEGACY_INVENTORY_TRIGGER_NOT_FOUND';
  end if;
  if destination <> 'https://n8n-production-97a4.up.railway.app/webhook/b171893b-1b1c-4ee6-9b92-970a1a849b7c' then
    raise exception 'LEGACY_INVENTORY_DESTINATION_CHANGED';
  end if;
  alter table public.cars disable trigger notificacion_auto_nuevo;
end;
$$;
commit;
select tgname,tgenabled from pg_trigger
where tgrelid='public.cars'::regclass and tgname='notificacion_auto_nuevo';
