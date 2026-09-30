-- Intervención humana por conversación (30 minutos renovables por actividad).
-- Ejecuta una sola vez en Supabase > SQL Editor.
create table if not exists public.chat_handoffs (
  lote_id uuid not null references public.lotes(id) on delete cascade,
  phone_number text not null check (phone_number ~ '^[0-9]{10,15}$'),
  manual_until timestamptz not null,
  last_activity timestamptz not null default now(),
  pause_reason text not null default 'human_outbound' check (pause_reason in ('human_outbound', 'manual_dashboard')),
  updated_at timestamptz not null default now(),
  primary key (lote_id, phone_number)
);

create index if not exists chat_handoffs_manual_until_idx
  on public.chat_handoffs (manual_until);

alter table public.chat_handoffs enable row level security;

drop policy if exists chat_handoffs_tenant_access on public.chat_handoffs;
create policy chat_handoffs_tenant_access
  on public.chat_handoffs
  for all
  to authenticated
  using (lote_id = (select public.auth_lote_id()))
  with check (lote_id = (select public.auth_lote_id()));

grant select, insert, update, delete on public.chat_handoffs to authenticated;
