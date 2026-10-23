begin;
create table if not exists public.registration_security_operations (
  id uuid primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  lote_id uuid not null unique references public.lotes(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.registration_security_operations enable row level security;
revoke all on public.registration_security_operations from public,anon,authenticated;
grant select on public.registration_security_operations to service_role;

create or replace function public.create_registration_lot_atomic()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_reg jsonb:=new.raw_user_meta_data->'velodrive_registration';
  v_data jsonb; v_lot public.lotes%rowtype; v_id uuid;
begin
  if v_reg is null then return new; end if;
  if jsonb_typeof(v_reg)<>'object' or v_reg->'version' is distinct from '1'::jsonb
    or coalesce(v_reg->>'operation_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or jsonb_typeof(v_reg->'lote') is distinct from 'object'
    or new.email is null
    or new.raw_user_meta_data#>'{legal_consent,terms}' is distinct from 'true'::jsonb
    or new.raw_user_meta_data#>'{legal_consent,privacy}' is distinct from 'true'::jsonb
    or coalesce(new.raw_user_meta_data#>>'{legal_consent,version}','')='' then raise exception 'INVALID_REGISTRATION'; end if;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_data from jsonb_each(v_reg->'lote') where key=any(array[
    'nombre','whatsapp_number','direccion','ciudad','estado','hora_abre','hora_cierra','dias_atencion',
    'rfc','razon_social','cp_fiscal','regimen_fiscal','uso_cfdi','tipo_financiamiento','financieras',
    'plazos_meses','tasa_anual','enganche_minimo_pct','acepta_buro_afectado']);
  if coalesce(trim(v_data->>'nombre'),'')='' then raise exception 'INVALID_REGISTRATION_LOT'; end if;
  v_lot:=jsonb_populate_record(null::public.lotes,v_data);
  insert into public.lotes(profile_id,email_admin,plan_status,nombre,whatsapp_number,direccion,ciudad,estado,
    hora_abre,hora_cierra,dias_atencion,rfc,razon_social,cp_fiscal,regimen_fiscal,uso_cfdi,tipo_financiamiento,
    financieras,plazos_meses,tasa_anual,enganche_minimo_pct,acepta_buro_afectado)
  values(new.id,lower(new.email),'past_due',trim(v_lot.nombre),v_lot.whatsapp_number,v_lot.direccion,v_lot.ciudad,v_lot.estado,
    v_lot.hora_abre,v_lot.hora_cierra,v_lot.dias_atencion,v_lot.rfc,v_lot.razon_social,v_lot.cp_fiscal,v_lot.regimen_fiscal,
    v_lot.uso_cfdi,v_lot.tipo_financiamiento,v_lot.financieras,v_lot.plazos_meses,v_lot.tasa_anual,
    v_lot.enganche_minimo_pct,v_lot.acepta_buro_afectado) returning id into v_id;
  insert into public.registration_security_operations(id,user_id,lote_id) values((v_reg->>'operation_id')::uuid,new.id,v_id);
  return new;
end $$;
revoke all on function public.create_registration_lot_atomic() from public,anon,authenticated;
create or replace trigger velodrive_registration_atomic
  after insert on auth.users for each row execute function public.create_registration_lot_atomic();

create or replace function public.registration_atomic_ready()
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('ready',exists(select 1 from pg_catalog.pg_trigger
    where tgrelid='auth.users'::regclass and tgname='velodrive_registration_atomic'
      and tgfoid='public.create_registration_lot_atomic()'::regprocedure and tgenabled in ('O','A') and not tgisinternal));
$$;
revoke all on function public.registration_atomic_ready() from public,anon,authenticated;
grant execute on function public.registration_atomic_ready() to service_role;
notify pgrst,'reload schema';
commit;
