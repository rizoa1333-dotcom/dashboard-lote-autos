-- Enforce tenant consistency even for service_role; preserve existing CASCADE semantics.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if exists(select 1 from public.car_expenses e left join public.cars c on c.id=e.car_id where c.id is null or e.lote_id is distinct from c.lote_id)
    then raise exception 'EXPENSE_TENANT_MISMATCH_REQUIRES_MANUAL_REVIEW'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.cars'::regclass and conname='cars_id_lote_unique') then
    alter table public.cars add constraint cars_id_lote_unique unique(id,lote_id);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.car_expenses'::regclass and conname='expenses_car_same_lote_fk') then
    alter table public.car_expenses add constraint expenses_car_same_lote_fk
      foreign key(car_id,lote_id) references public.cars(id,lote_id) on delete cascade not valid;
  end if;
end $$;
alter table public.car_expenses validate constraint expenses_car_same_lote_fk;
notify pgrst,'reload schema';
commit;
