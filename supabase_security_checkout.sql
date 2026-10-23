begin;
create table if not exists public.checkout_security_sessions (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  owner_id uuid not null,
  price_id text not null check (price_id ~ '^price_[A-Za-z0-9]+$'),
  mode text not null check (mode in ('production','qa','test')),
  email text not null,
  reference text not null unique,
  state text not null check (state in ('creating','open','expired','paid')),
  expires_at bigint not null,
  session_id text unique,
  subscription_id text,
  url text,
  created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists checkout_security_one_active_lot
  on public.checkout_security_sessions(lote_id) where state in ('creating','open');
alter table public.checkout_security_sessions enable row level security;
revoke all on public.checkout_security_sessions from public, anon, authenticated;
grant select, insert, update on public.checkout_security_sessions to service_role;

create or replace function public.claim_lote_checkout(p_lote_id uuid,p_owner_id uuid,p_price_id text,p_mode text,p_email text)
returns jsonb language plpgsql set search_path='' as $$
declare v_lot public.lotes%rowtype; v_job public.checkout_security_sessions%rowtype; v_id uuid;
begin
  if p_owner_id is null or p_price_id is null or p_price_id !~ '^price_[A-Za-z0-9]+$'
    or p_mode is null or p_mode not in ('production','qa','test') or p_email is null then raise exception 'INVALID_CHECKOUT'; end if;
  select * into v_lot from public.lotes where id=p_lote_id for update;
  if not found or v_lot.profile_id is distinct from p_owner_id
    or lower(v_lot.email_admin) is distinct from lower(p_email) then raise exception 'CHECKOUT_FORBIDDEN'; end if;
  if v_lot.stripe_subscription_id is not null then return jsonb_build_object('state','subscribed'); end if;
  select * into v_job from public.checkout_security_sessions where lote_id=p_lote_id and state in ('creating','open');
  if found then
    if v_job.owner_id is distinct from p_owner_id or v_job.price_id is distinct from p_price_id
      or v_job.mode is distinct from p_mode or v_job.email is distinct from lower(p_email) then raise exception 'CHECKOUT_ATTEMPT_CONFLICT'; end if;
    return to_jsonb(v_job);
  end if;
  v_id := gen_random_uuid();
  insert into public.checkout_security_sessions(id,lote_id,owner_id,price_id,mode,email,reference,state,expires_at)
    values(v_id,p_lote_id,p_owner_id,p_price_id,p_mode,lower(p_email),'vd_'||v_id::text,'creating',floor(extract(epoch from clock_timestamp()))::bigint+3600)
    returning * into v_job;
  return to_jsonb(v_job);
end $$;

create or replace function public.complete_lote_checkout(p_attempt_id uuid,p_lote_id uuid,p_owner_id uuid,p_session_id text,p_url text)
returns jsonb language plpgsql set search_path='' as $$
declare v_job public.checkout_security_sessions%rowtype;
begin
  if p_session_id is null or p_session_id !~ '^cs_[A-Za-z0-9_]{1,200}$'
    or p_url is null or p_url !~ '^https://checkout\.stripe\.com/' then raise exception 'INVALID_CHECKOUT_SESSION'; end if;
  select * into v_job from public.checkout_security_sessions
    where id=p_attempt_id and lote_id=p_lote_id and owner_id=p_owner_id for update;
  if not found or v_job.state not in ('creating','open')
    or (v_job.session_id is not null and v_job.session_id is distinct from p_session_id) then raise exception 'CHECKOUT_ATTEMPT_CONFLICT'; end if;
  update public.checkout_security_sessions set state='open',session_id=p_session_id,url=p_url where id=p_attempt_id;
  return jsonb_build_object('saved',true);
end $$;

create or replace function public.expire_lote_checkout(p_attempt_id uuid,p_lote_id uuid,p_owner_id uuid,p_session_id text)
returns jsonb language plpgsql set search_path='' as $$
begin
  -- Only the server may call this after Stripe confirms status=expired.
  update public.checkout_security_sessions set state='expired'
    where id=p_attempt_id and lote_id=p_lote_id and owner_id=p_owner_id and session_id=p_session_id and state='open';
  return jsonb_build_object('expired',found);
end $$;
create or replace function public.reconcile_creating_lote_checkout(
  p_attempt_id uuid,p_lote_id uuid,p_owner_id uuid,p_session_id text,p_status text,p_url text
) returns jsonb language plpgsql set search_path='' as $$
declare v_job public.checkout_security_sessions%rowtype;
begin
  perform 1 from public.lotes where id=p_lote_id and profile_id=p_owner_id for update;
  if not found then raise exception 'CHECKOUT_FORBIDDEN'; end if;
  select * into v_job from public.checkout_security_sessions where id=p_attempt_id and lote_id=p_lote_id and owner_id=p_owner_id for update;
  if not found or v_job.state <> 'creating' or v_job.expires_at+300 >= extract(epoch from clock_timestamp()) then raise exception 'CHECKOUT_RECONCILIATION_NOT_READY'; end if;
  if p_status is null or p_status not in ('absent','expired','open','complete')
    or (p_status <> 'absent' and (p_session_id is null or p_session_id !~ '^cs_[A-Za-z0-9_]{1,200}$'))
    or (p_status='open' and (p_url is null or p_url !~ '^https://checkout\.stripe\.com/')) then raise exception 'INVALID_CHECKOUT_RECONCILIATION'; end if;
  update public.checkout_security_sessions set session_id=p_session_id,url=p_url,
    state=case when p_status in ('absent','expired') then 'expired' else 'open' end where id=p_attempt_id;
  return jsonb_build_object('saved',true);
end $$;

create or replace function public.apply_checkout_session_security_event(
  p_event_id text,p_subscription_id text,p_lease_token uuid,p_lote_id uuid,p_owner_id uuid,p_customer_id text,
  p_plan_status text,p_period_end timestamptz,p_cancelled boolean,p_attempt_id uuid,p_session_id text
) returns jsonb language plpgsql set search_path='' as $$
declare v_result jsonb; v_count integer;
begin
  if not exists(select 1 from public.checkout_security_sessions where id=p_attempt_id and lote_id=p_lote_id and owner_id=p_owner_id
    and session_id=p_session_id and state in ('open','paid') and (subscription_id is null or subscription_id=p_subscription_id)) then
    raise exception 'CHECKOUT_SESSION_NOT_REGISTERED'; end if;
  v_result:=public.apply_stripe_security_event(p_event_id,p_subscription_id,p_lease_token,p_lote_id,p_owner_id,p_customer_id,p_plan_status,p_period_end,p_cancelled);
  if (v_result->>'matched')::boolean then
    update public.checkout_security_sessions set state='paid',subscription_id=p_subscription_id
      where id=p_attempt_id and lote_id=p_lote_id and owner_id=p_owner_id and session_id=p_session_id
      and state in ('open','paid') and (subscription_id is null or subscription_id=p_subscription_id);
    get diagnostics v_count=row_count;
    if v_count<>1 then raise exception 'CHECKOUT_SESSION_CONFLICT'; end if;
  end if;
  return v_result;
end $$;
revoke all on function public.claim_lote_checkout(uuid,uuid,text,text,text),
  public.complete_lote_checkout(uuid,uuid,uuid,text,text),public.expire_lote_checkout(uuid,uuid,uuid,text),
  public.reconcile_creating_lote_checkout(uuid,uuid,uuid,text,text,text),
  public.apply_checkout_session_security_event(text,text,uuid,uuid,uuid,text,text,timestamptz,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_lote_checkout(uuid,uuid,text,text,text),
  public.complete_lote_checkout(uuid,uuid,uuid,text,text),public.expire_lote_checkout(uuid,uuid,uuid,text),
  public.reconcile_creating_lote_checkout(uuid,uuid,uuid,text,text,text),
  public.apply_checkout_session_security_event(text,text,uuid,uuid,uuid,text,text,timestamptz,boolean,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
