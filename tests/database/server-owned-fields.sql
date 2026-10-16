begin;
do $test$
declare column_name text;
begin
  foreach column_name in array array['plan_status','es_cuenta_interna','profile_id','webhook_token','stripe_customer_id','stripe_subscription_id','fecha_vencimiento'] loop
    if has_column_privilege('authenticated','public.lotes',column_name,'UPDATE') then
      raise exception 'FAIL: authenticated puede modificar lotes.%',column_name;
    end if;
  end loop;
  if has_column_privilege('authenticated','public.whatsapp_channels','api_key','SELECT') then
    raise exception 'FAIL: api_key del canal es legible desde el navegador';
  end if;
  if has_table_privilege('authenticated','public.whatsapp_channels','INSERT,UPDATE,DELETE') then
    raise exception 'FAIL: el navegador puede modificar el canal';
  end if;
  if not has_column_privilege('authenticated','public.lotes','nombre','UPDATE') then
    raise exception 'FAIL: el propietario no puede editar el nombre del negocio';
  end if;
end $test$;
select 'PASS: campos del servidor protegidos; configuración del negocio editable' as result;
rollback;
