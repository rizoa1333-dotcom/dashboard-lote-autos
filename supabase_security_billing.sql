begin;
create table if not exists public.stripe_security_events (
  event_id text primary key,
  subscription_id text not null,
  state text not null check (state in ('processing','completed','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create table if not exists public.stripe_security_locks (
  subscription_id text primary key,
  lease_token uuid,
  lease_until timestamptz
);
alter table public.stripe_security_events enable row level security;
alter table public.stripe_security_locks enable row level security;
revoke all on public.stripe_security_events, public.stripe_security_locks from public, anon, authenticated;
grant select, insert, update on public.stripe_security_events, public.stripe_security_locks to service_role;
create unique index if not exists lotes_unique_stripe_subscription
on public.lotes(stripe_subscription_id) where stripe_subscription_id is not null;

create or replace function public.claim_stripe_security_event(p_event_id text, p_subscription_id text, p_lease_token uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare v_lock public.stripe_security_locks%rowtype; v_event public.stripe_security_events%rowtype;
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]{1,128}$'
    or p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]{1,128}$'
    or p_lease_token is null then raise exception 'INVALID_BILLING_EVENT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing-event:'||p_event_id,0));
  insert into public.stripe_security_locks(subscription_id) values(p_subscription_id) on conflict do nothing;
  select * into v_lock from public.stripe_security_locks where subscription_id=p_subscription_id for update;
  select * into v_event from public.stripe_security_events where event_id=p_event_id;
  if found and v_event.subscription_id <> p_subscription_id then raise exception 'EVENT_RESOURCE_CONFLICT'; end if;
  if v_event.state='completed' then return jsonb_build_object('state','duplicate'); end if;
  if v_lock.lease_until > clock_timestamp() then return jsonb_build_object('state','busy'); end if;
  update public.stripe_security_locks set lease_token=p_lease_token, lease_until=clock_timestamp()+interval '120 seconds'
    where subscription_id=p_subscription_id;
  insert into public.stripe_security_events(event_id,subscription_id,state) values(p_event_id,p_subscription_id,'processing')
    on conflict(event_id) do update set state='processing';
  return jsonb_build_object('state','claimed');
end $$;

create or replace function public.apply_stripe_security_event(
  p_event_id text, p_subscription_id text, p_lease_token uuid,
  p_lote_id uuid, p_owner_id uuid, p_customer_id text, p_plan_status text,
  p_period_end timestamptz, p_cancelled boolean
)
returns jsonb language plpgsql set search_path = '' as $$
declare v_lock public.stripe_security_locks%rowtype; v_count integer;
begin
  select * into v_lock from public.stripe_security_locks where subscription_id=p_subscription_id for update;
  if not found or p_lease_token is null or v_lock.lease_token is distinct from p_lease_token
    or v_lock.lease_until is null or v_lock.lease_until <= clock_timestamp() then raise exception 'BILLING_LEASE_LOST'; end if;
  if not exists (select 1 from public.stripe_security_events
    where event_id=p_event_id and subscription_id=p_subscription_id and state='processing') then
    raise exception 'BILLING_EVENT_NOT_CLAIMED'; end if;
  if p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]{1,128}$'
    or p_plan_status is null or p_plan_status not in ('active','pending','past_due','inactive')
    or p_cancelled is null or (p_cancelled and p_plan_status <> 'inactive')
    or (p_lote_id is not null and p_owner_id is null) then raise exception 'INVALID_BILLING_STATE'; end if;
  update public.lotes set
    stripe_customer_id=p_customer_id,
    stripe_subscription_id=case when p_cancelled then null else p_subscription_id end,
    plan_status=p_plan_status, fecha_vencimiento=p_period_end
  where ((p_lote_id is null and stripe_subscription_id=p_subscription_id)
    or (id=p_lote_id and profile_id=p_owner_id
      and (stripe_subscription_id is null or stripe_subscription_id=p_subscription_id)))
    and (stripe_subscription_id is distinct from p_subscription_id
      or stripe_customer_id is null or stripe_customer_id=p_customer_id);
  get diagnostics v_count = row_count;
  update public.stripe_security_events set state='completed', processed_at=clock_timestamp() where event_id=p_event_id;
  update public.stripe_security_locks set lease_token=null, lease_until=null where subscription_id=p_subscription_id;
  return jsonb_build_object('applied',true,'matched',v_count=1);
end $$;

create or replace function public.fail_stripe_security_event(p_event_id text, p_subscription_id text, p_lease_token uuid)
returns void language plpgsql set search_path = '' as $$
declare v_token uuid;
begin
  select lease_token into v_token from public.stripe_security_locks where subscription_id=p_subscription_id for update;
  if v_token is distinct from p_lease_token then return; end if;
  update public.stripe_security_events set state='failed' where event_id=p_event_id and state='processing';
  update public.stripe_security_locks set lease_token=null, lease_until=null where subscription_id=p_subscription_id;
end $$;

revoke all on function public.claim_stripe_security_event(text,text,uuid),
  public.apply_stripe_security_event(text,text,uuid,uuid,uuid,text,text,timestamptz,boolean),
  public.fail_stripe_security_event(text,text,uuid) from public, anon, authenticated;
grant execute on function public.claim_stripe_security_event(text,text,uuid),
  public.apply_stripe_security_event(text,text,uuid,uuid,uuid,text,text,timestamptz,boolean),
  public.fail_stripe_security_event(text,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
