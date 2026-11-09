-- Reproduce the permissive tenant policies captured from Supabase on 2026-11-03.
-- Apply after the base schema and existing tenant migrations on a restored project.
begin;

create or replace function public.auth_lote_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.lotes where profile_id = (select auth.uid())
$$;
revoke all on function public.auth_lote_id() from public, anon, authenticated;
grant execute on function public.auth_lote_id() to authenticated;

alter table public.lotes enable row level security;
drop policy if exists select_propio_lote on public.lotes;
create policy select_propio_lote on public.lotes for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists insert_propio_lote on public.lotes;
create policy insert_propio_lote on public.lotes for insert to authenticated
  with check (profile_id = auth.uid());
drop policy if exists update_propio_lote on public.lotes;
create policy update_propio_lote on public.lotes for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

do $policies$
declare item record;
begin
  for item in select * from (values
    ('cars', 'tenant_isolation_cars'),
    ('leads', 'tenant_isolation_leads'),
    ('citas', 'tenant_isolation_citas'),
    ('chat_history', 'tenant_isolation_chat'),
    ('chat_handoffs', 'chat_handoffs_tenant_access'),
    ('whatsapp_channels', 'tenant_isolation_whatsapp')
  ) as policies(table_name, policy_name) loop
    execute format('alter table public.%I enable row level security', item.table_name);
    execute format('drop policy if exists %I on public.%I', item.policy_name, item.table_name);
    execute format('create policy %I on public.%I for all to authenticated
      using (lote_id = (select public.auth_lote_id()))
      with check (lote_id = (select public.auth_lote_id()))', item.policy_name, item.table_name);
  end loop;
end $policies$;

alter table public.car_expenses enable row level security;
drop policy if exists car_expenses_tenant_access on public.car_expenses;
create policy car_expenses_tenant_access on public.car_expenses for all to authenticated
  using (lote_id = (select public.auth_lote_id()) and exists (
    select 1 from public.cars c where c.id = car_expenses.car_id and c.lote_id = car_expenses.lote_id
  ))
  with check (lote_id = (select public.auth_lote_id()) and exists (
    select 1 from public.cars c where c.id = car_expenses.car_id and c.lote_id = car_expenses.lote_id
  ));

alter table public.facturas enable row level security;

do $storage$
begin
  if not exists (select 1 from storage.buckets where id = 'documentos-leads' and public is false)
      or not (select relrowsecurity from pg_catalog.pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'PRIVATE_DOCUMENT_STORAGE_REQUIRED';
  end if;
end $storage$;

drop policy if exists car_images_insert_own_lote on storage.objects;
create policy car_images_insert_own_lote on storage.objects for insert to authenticated
  with check (bucket_id = 'car-images' and (storage.foldername(name))[1] = (select public.auth_lote_id())::text);
drop policy if exists documentos_leads_select_mismo_lote on storage.objects;
create policy documentos_leads_select_mismo_lote on storage.objects for select to authenticated
  using (bucket_id = 'documentos-leads' and (storage.foldername(name))[1] = (select public.auth_lote_id())::text);

notify pgrst, 'reload schema';
commit;
