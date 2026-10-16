begin;

-- RLS protege filas; los permisos de columna reservan facturación y secretos al servidor.
revoke insert, update, delete on public.lotes from anon, authenticated, public;
revoke all on public.whatsapp_channels from anon, authenticated, public;
do $permissions$
declare c record;
begin
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='lotes' loop
    execute format('revoke insert (%I), update (%I) on public.lotes from anon, authenticated, public',c.column_name,c.column_name);
  end loop;
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='whatsapp_channels' loop
    execute format('revoke select (%I), insert (%I), update (%I), references (%I) on public.whatsapp_channels from anon, authenticated, public',c.column_name,c.column_name,c.column_name,c.column_name);
  end loop;
end $permissions$;

grant update (nombre, whatsapp_number, direccion, ciudad, estado, telefono_notificaciones,
  hora_abre, hora_cierra, dias_atencion, rfc, razon_social, cp_fiscal, regimen_fiscal, uso_cfdi,
  tipo_financiamiento, financieras, plazos_meses, tasa_anual, enganche_minimo_pct, acepta_buro_afectado)
  on public.lotes to authenticated;
grant select (id, lote_id, instance_name, phone_number, status_conexion, created_at, updated_at)
  on public.whatsapp_channels to authenticated;

create unique index if not exists lotes_profile_id_unique
  on public.lotes(profile_id) where profile_id is not null;
create unique index if not exists whatsapp_channels_instance_name_unique
  on public.whatsapp_channels(instance_name);

notify pgrst, 'reload schema';
commit;
