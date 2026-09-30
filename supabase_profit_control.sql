-- Control interno de costos y utilidad por vehículo para VeloDrive.
-- Ejecutar una sola vez en Supabase > SQL Editor, en el proyecto de producción.

alter table public.cars
  add column if not exists purchase_cost numeric(12, 2) not null default 0
    check (purchase_cost >= 0),
  add column if not exists sold_price numeric(12, 2)
    check (sold_price is null or sold_price >= 0);

create table if not exists public.car_expenses (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  car_id bigint not null references public.cars(id) on delete cascade,
  category text not null check (category in ('reparacion', 'estetica', 'tramites', 'otro')),
  description text check (description is null or char_length(description) <= 160),
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists car_expenses_lote_car_created_idx
  on public.car_expenses (lote_id, car_id, created_at desc);

alter table public.car_expenses enable row level security;

drop policy if exists car_expenses_tenant_access on public.car_expenses;
create policy car_expenses_tenant_access
  on public.car_expenses
  for all
  to authenticated
  using (
    lote_id = public.auth_lote_id()
    and exists (
      select 1 from public.cars c
      where c.id = car_expenses.car_id
        and c.lote_id = public.auth_lote_id()
    )
  )
  with check (
    lote_id = public.auth_lote_id()
    and exists (
      select 1 from public.cars c
      where c.id = car_expenses.car_id
        and c.lote_id = public.auth_lote_id()
    )
  );

grant select, insert, update, delete on public.car_expenses to authenticated;
