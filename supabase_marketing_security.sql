begin;

create or replace function public.resolve_tenant_webhook(p_token uuid)
returns table(id uuid) language sql stable security invoker set search_path = ''
as $$
  with matches as (
    select l.id from public.lotes l
    where l.webhook_token = p_token and l.plan_status = 'active'
      and p_token <> '00000000-0000-0000-0000-000000000000'::uuid
    limit 2
  )
  select matches.id from matches where (select count(*) from matches) = 1
$$;

create or replace function public.rotate_tenant_webhook(p_lote_id uuid, p_previous uuid, p_replacement uuid)
returns table(id uuid) language sql security invoker set search_path = ''
as $$
  update public.lotes l set webhook_token = p_replacement, token_rotado_at = now()
  where l.id = p_lote_id and l.plan_status = 'active' and l.webhook_token = p_previous
    and p_replacement <> p_previous and p_replacement <> '00000000-0000-0000-0000-000000000000'::uuid
  returning l.id
$$;

create table if not exists public.meta_publication_dispatches (
  lote_id uuid not null references public.lotes(id) on delete cascade,
  car_id bigint not null references public.cars(id) on delete cascade,
  fingerprint bytea not null,
  request_id uuid not null unique,
  previous_request_id text,
  previous_published boolean,
  state text not null check (state in ('pending', 'accepted', 'rejected')),
  primary key (lote_id, car_id, fingerprint)
);
create index if not exists meta_publication_dispatches_car_idx on public.meta_publication_dispatches(car_id);
create unique index if not exists meta_publication_dispatches_one_pending
  on public.meta_publication_dispatches(lote_id, car_id) where state = 'pending';
alter table public.meta_publication_dispatches enable row level security;
revoke all on public.meta_publication_dispatches from public, anon, authenticated;
grant select, insert, update on public.meta_publication_dispatches to service_role;

create or replace function public.claim_meta_publication(
  p_lote_id uuid, p_car_id bigint, p_platforms text[], p_urls text[], p_copy text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_request text;
  current_published boolean;
  payload_hash bytea;
  attempt public.meta_publication_dispatches%rowtype;
  new_request uuid;
begin
  if coalesce(cardinality(p_platforms), 0) not between 1 and 2
    or exists (select 1 from unnest(p_platforms) p where p is null or p not in ('facebook', 'instagram'))
    or coalesce(cardinality(p_urls), 0) not between 1 and 10
    or exists (select 1 from unnest(p_urls) u where u is null or length(u) > 2048 or u !~ '^https://[^[:space:]]+$')
    or coalesce(length(btrim(p_copy)), 0) not between 1 and 2200 then
    return jsonb_build_object('code', 'INVALID_PUBLICATION');
  end if;

  -- Serialize the decision and the inventory pointer for this vehicle.
  select c.upload_post_request_id_meta, c.publicado_meta into current_request, current_published
  from public.cars c join public.lotes l on l.id = c.lote_id
  where c.id = p_car_id and c.lote_id = p_lote_id and l.plan_status = 'active'
  for update of c;
  if not found then return jsonb_build_object('code', 'UNIT_NOT_FOUND'); end if;

  payload_hash := sha256(convert_to(jsonb_build_array(
    array(select distinct p from unnest(p_platforms) p order by p), p_urls, btrim(p_copy)
  )::text, 'UTF8'));
  select * into attempt from public.meta_publication_dispatches d
  where d.lote_id = p_lote_id and d.car_id = p_car_id and d.fingerprint = payload_hash;

  if found and attempt.state <> 'rejected' then
    if current_request is distinct from attempt.request_id::text then
      return jsonb_build_object('code', 'PUBLICATION_SUPERSEDED');
    end if;
    return jsonb_build_object('send', false, 'request_id', attempt.request_id);
  end if;
  if exists (select 1 from public.meta_publication_dispatches d
    where d.lote_id = p_lote_id and d.car_id = p_car_id and d.state = 'pending') then
    return jsonb_build_object('code', 'PUBLICATION_IN_PROGRESS');
  end if;

  new_request := gen_random_uuid();
  insert into public.meta_publication_dispatches(
    lote_id, car_id, fingerprint, request_id, state, previous_request_id, previous_published
  ) values (p_lote_id, p_car_id, payload_hash, new_request, 'pending', current_request, current_published)
  on conflict (lote_id, car_id, fingerprint) do update
  set request_id = excluded.request_id, state = excluded.state,
    previous_request_id = excluded.previous_request_id, previous_published = excluded.previous_published;
  update public.cars set upload_post_request_id_meta = new_request::text, publicado_meta = false
  where id = p_car_id and lote_id = p_lote_id;
  return jsonb_build_object('send', true, 'request_id', new_request);
end $$;

create or replace function public.record_meta_publication_status(
  p_lote_id uuid, p_car_id bigint, p_request_id text, p_published boolean, p_observed boolean
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_observed is distinct from true or p_published is null then return jsonb_build_object('saved', false); end if;
  update public.cars set publicado_meta = p_published
  where id = p_car_id and lote_id = p_lote_id and upload_post_request_id_meta = p_request_id;
  if not found then return jsonb_build_object('saved', false); end if;
  if p_request_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    update public.meta_publication_dispatches set state = 'accepted'
    where lote_id = p_lote_id and car_id = p_car_id and request_id = p_request_id::uuid and state = 'pending';
  end if;
  return jsonb_build_object('saved', true);
end $$;

create or replace function public.finish_meta_publication(
  p_lote_id uuid, p_car_id bigint, p_request_id uuid, p_result text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  previous_request text;
  was_published boolean;
begin
  if p_result is null or p_result not in ('accepted', 'rejected', 'pending') then
    return jsonb_build_object('saved', false);
  end if;
  -- Use the same lock order as claim_meta_publication.
  perform 1 from public.cars where id = p_car_id and lote_id = p_lote_id for update;
  if not found then return jsonb_build_object('saved', false); end if;
  update public.meta_publication_dispatches set state = p_result
  where lote_id = p_lote_id and car_id = p_car_id and request_id = p_request_id and state = 'pending'
  returning previous_request_id, previous_published into previous_request, was_published;
  if not found then return jsonb_build_object('saved', false); end if;
  if p_result = 'rejected' then
    update public.cars set upload_post_request_id_meta = previous_request, publicado_meta = was_published
    where id = p_car_id and lote_id = p_lote_id and upload_post_request_id_meta = p_request_id::text;
  end if;
  return jsonb_build_object('saved', true);
end $$;

revoke all on function public.resolve_tenant_webhook(uuid), public.rotate_tenant_webhook(uuid,uuid,uuid),
  public.claim_meta_publication(uuid,bigint,text[],text[],text), public.finish_meta_publication(uuid,bigint,uuid,text),
  public.record_meta_publication_status(uuid,bigint,text,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.resolve_tenant_webhook(uuid), public.rotate_tenant_webhook(uuid,uuid,uuid),
  public.claim_meta_publication(uuid,bigint,text[],text[],text), public.finish_meta_publication(uuid,bigint,uuid,text),
  public.record_meta_publication_status(uuid,bigint,text,boolean,boolean)
  to service_role;
notify pgrst, 'reload schema';
commit;
