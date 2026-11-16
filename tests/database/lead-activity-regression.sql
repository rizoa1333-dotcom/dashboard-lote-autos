\set ON_ERROR_STOP on
do $$
begin
  if current_database() <> 'qa_lead_activity' then
    raise exception 'Use a disposable qa_lead_activity database';
  end if;
end $$;

create role anon nologin;
create role authenticated nologin;
create table public.leads (
  id bigint primary key, lote_id uuid, phone_number text, created_at timestamptz,
  seguimiento_enviado boolean, fecha_cita text
);
create table public.chat_history (lote_id uuid, phone_number text, created_at timestamptz);
create table public.citas (
  lote_id uuid, telefono text, fecha_cita date, hora_cita time, estado_lead text
);
create table public.chat_handoffs (lote_id uuid, phone_number text, manual_until timestamptz);
create index on public.chat_history (lote_id, phone_number, created_at desc);

do $$
declare relation text;
begin
  foreach relation in array array['leads', 'chat_history', 'citas', 'chat_handoffs'] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('grant select on public.%I to authenticated', relation);
    execute format('create policy own_lot on public.%I to authenticated using (
      lote_id = current_setting(''qa.lote_id'')::uuid)', relation);
  end loop;
end $$;

\ir ../../supabase_lead_activity.sql

begin;
select set_config('qa.lote_id', '10000000-0000-0000-0000-000000000001', true) as lot_a,
       '10000000-0000-0000-0000-000000000002' as lot_b \gset

insert into public.leads values
  (1, :'lot_a', '+52 (312) 000-0001', now() - interval '61 days', false, null),
  (2, :'lot_a', '3120000002', now() - interval '61 days', false, null),
  (3, :'lot_a', '3120000003', now() - interval '61 days', false, null),
  (4, :'lot_a', '3120000004', now() - interval '61 days', false, null),
  (5, :'lot_a', '3120000005', now() - interval '61 days', false, null),
  (6, :'lot_a', '3120000006', now() - interval '61 days', true, null),
  (7, :'lot_a', '3120000007', now() - interval '61 days', false, null),
  (8, :'lot_b', '3120000002', now() - interval '61 days', false, null);
insert into public.chat_history values
  (:'lot_b', '3120000002', now()),
  (:'lot_a', '3120000005', now() - interval '30 hours'),
  (:'lot_a', '3120000006', now() - interval '30 hours'),
  (:'lot_a', '3120000007', now() - interval '61 days');
insert into public.citas values
  (:'lot_a', '523120000002', (now() at time zone 'America/Mexico_City')::date + 1, '12:00', 'Agendada'),
  (:'lot_a', '3120000003', (now() at time zone 'America/Mexico_City')::date + 1, '12:00', 'Cancelada'),
  (:'lot_b', '3120000003', (now() at time zone 'America/Mexico_City')::date + 1, '12:00', 'Agendada');
insert into public.chat_handoffs values
  (:'lot_a', '5213120000004', now() + interval '1 hour'),
  (:'lot_b', '3120000003', now() + interval '1 hour');

set local role authenticated;
do $$
begin
  if (select count(*) from public.lead_activity) <> 7 then raise exception 'Wrong tenant visibility'; end if;
  if (select last_activity_at from public.lead_activity where id = 1) is distinct from now() - interval '61 days' then
    raise exception 'Missing registration fallback';
  end if;
  if (select last_activity_at from public.lead_activity where id = 2) is distinct from now() - interval '61 days' then
    raise exception 'Another tenant affected activity';
  end if;
  if (select array_agg(id order by id) from public.lead_activity where has_upcoming_appointment) is distinct from array[2::bigint] then
    raise exception 'Appointment identity or cancellation handling failed';
  end if;
  if (select array_agg(id order by id) from public.lead_activity where has_pending_followup) is distinct from array[4::bigint, 5] then
    raise exception 'Follow-up handling failed';
  end if;
  if has_table_privilege('anon', 'public.lead_activity', 'SELECT')
     or has_table_privilege('authenticated', 'public.lead_activity', 'UPDATE,INSERT,DELETE') then
    raise exception 'Unexpected view privileges';
  end if;
end $$;

reset role;
insert into public.chat_history values (:'lot_a', '5213120000001', now());
set local role authenticated;
do $$
begin
  if (select last_activity_at from public.lead_activity where id = 1) is distinct from now() then
    raise exception 'New message did not refresh the existing lead';
  end if;
end $$;
rollback;
select 'Lead activity regression passed' as result;
