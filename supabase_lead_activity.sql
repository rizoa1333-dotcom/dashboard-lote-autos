begin;

create index if not exists citas_lote_telefono_fecha_idx
  on public.citas (lote_id, telefono, fecha_cita);

create or replace view public.lead_activity
with (security_invoker = true, security_barrier = true)
as
select lead.*,
  greatest(lead.created_at, message.created_at) as last_activity_at,
  exists (
    select 1
    from public.citas appointment
    where appointment.lote_id = lead.lote_id
      and appointment.telefono = any (phones.variants)
      and appointment.fecha_cita >= (now() at time zone 'America/Mexico_City')::date
      and appointment.fecha_cita + coalesce(appointment.hora_cita, time '23:59:59')
        >= (now() at time zone 'America/Mexico_City')
      and lower(btrim(coalesce(appointment.estado_lead, ''))) <> 'cancelada'
  ) as has_upcoming_appointment,
  (
    coalesce(
      lead.seguimiento_enviado is false and lead.fecha_cita is null
        and message.created_at between now() - interval '72 hours' and now() - interval '24 hours',
      false
    )
    or exists (
      select 1
      from public.chat_handoffs handoff
      where handoff.lote_id = lead.lote_id
        and handoff.phone_number = any (phones.variants)
        and handoff.manual_until > now()
    )
  ) as has_pending_followup
from public.leads lead
cross join lateral (
  select regexp_replace(split_part(split_part(lead.phone_number, '@', 1), ':', 1), '[^0-9]', '', 'g') as digits
) phone
cross join lateral (
  select case
    when phone.digits ~ '^(521|52)?[0-9]{10}$' then right(phone.digits, 10)
  end as national
) mexican
cross join lateral (
  select array_remove(array[
    nullif(btrim(lead.phone_number), ''), nullif(phone.digits, ''),
    mexican.national, '52' || mexican.national, '521' || mexican.national
  ], null) as variants
) phones
left join lateral (
  select max(latest.created_at) as created_at
  from (select distinct number from unnest(phones.variants) as variant(number)) candidates
  cross join lateral (
    select history.created_at
    from public.chat_history history
    where history.lote_id = lead.lote_id
      and history.phone_number = candidates.number
      and history.created_at is not null
    order by history.created_at desc
    limit 1
  ) latest
) message on true;

revoke all on public.lead_activity from public, anon, authenticated;
grant select on public.lead_activity to authenticated;

notify pgrst, 'reload schema';
commit;
