begin;
do $$ begin
  if current_database() <> 'qa_tenants' then raise exception 'ISOLATED_LAB_REQUIRED'; end if;
  if has_function_privilege('authenticated', 'public.resolve_tenant_webhook(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.rotate_tenant_webhook(uuid,uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.claim_meta_publication(uuid,bigint,text[],text[],text)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.meta_publication_dispatches', 'SELECT') then
    raise exception 'PRIVATE_MARKETING_RPC_EXPOSED';
  end if;
end $$;

update public.lotes set webhook_token = '30000000-0000-4000-8000-000000000001' where id = '10000000-0000-4000-8000-000000000001';
update public.cars set upload_post_request_id_meta = 'old-accepted', publicado_meta = true where id = 1;
set local role service_role;
do $$
declare
  lot constant uuid := '10000000-0000-4000-8000-000000000001';
  token constant uuid := '30000000-0000-4000-8000-000000000001';
  replacement constant uuid := '30000000-0000-4000-8000-000000000002';
  photos constant text[] := array['https://example.invalid/fixture.jpg'];
  first_attempt jsonb;
  duplicate jsonb;
  rejected jsonb;
  request uuid;
begin
  if (select id from public.resolve_tenant_webhook(token)) is distinct from lot then raise exception 'TOKEN_LOOKUP'; end if;
  if exists (select 1 from public.resolve_tenant_webhook(null)) then raise exception 'NULL_TOKEN'; end if;
  if (select id from public.rotate_tenant_webhook(lot, token, replacement)) is distinct from lot then raise exception 'TOKEN_ROTATION'; end if;
  if exists (select 1 from public.rotate_tenant_webhook(lot, token, gen_random_uuid()))
    or exists (select 1 from public.resolve_tenant_webhook(token)) then raise exception 'OLD_TOKEN_REUSED'; end if;
  if (select id from public.resolve_tenant_webhook(replacement)) is distinct from lot then raise exception 'NEW_TOKEN_LOOKUP'; end if;
  update public.lotes set plan_status = 'pending' where id = lot;
  if exists (select 1 from public.resolve_tenant_webhook(replacement)) then raise exception 'INACTIVE_TOKEN'; end if;
  update public.lotes set plan_status = 'active' where id = lot;

  if public.claim_meta_publication(lot, 2, array['instagram'], photos, 'fixture')->>'code'
    is distinct from 'UNIT_NOT_FOUND' then raise exception 'CROSS_LOT_PUBLICATION'; end if;
  first_attempt := public.claim_meta_publication(lot, 1, array['instagram','facebook'], photos, 'fixture');
  request := (first_attempt->>'request_id')::uuid;
  if request is null or first_attempt->>'send' is distinct from 'true' then raise exception 'FIRST_CLAIM'; end if;
  if (select upload_post_request_id_meta from public.cars where id = 1) is distinct from request::text then raise exception 'MISSING_STATUS_POINTER'; end if;
  duplicate := public.claim_meta_publication(lot, 1, array['facebook','instagram'], photos, ' fixture ');
  if duplicate->>'send' is distinct from 'false' or duplicate->>'request_id' is distinct from request::text then raise exception 'DUPLICATE_CLAIM'; end if;
  if public.finish_meta_publication(lot, 1, request, 'pending')->>'saved' is distinct from 'true' then raise exception 'UNCERTAIN_ATTEMPT_LOST'; end if;
  if public.claim_meta_publication(lot, 1, array['facebook','instagram'], photos, 'fixture')->>'send'
    is distinct from 'false' then raise exception 'UNCERTAIN_RETRIED'; end if;
  if public.claim_meta_publication(lot, 1, array['facebook','instagram'], photos, 'different copy')->>'code'
    is distinct from 'PUBLICATION_IN_PROGRESS' then raise exception 'OVERLAPPING_PUBLICATION'; end if;
  rejected := public.finish_meta_publication(lot, 1, request, 'rejected');
  if rejected->>'saved' is distinct from 'true' or (select upload_post_request_id_meta from public.cars where id = 1)
    is distinct from 'old-accepted' then raise exception 'PREVIOUS_PUBLICATION_NOT_PRESERVED'; end if;
  first_attempt := public.claim_meta_publication(lot, 1, array['facebook','instagram'], photos, 'fixture');
  if first_attempt->>'send' is distinct from 'true' or first_attempt->>'request_id' = request::text then raise exception 'REJECTED_ATTEMPT_NOT_RETRYABLE'; end if;
  request := (first_attempt->>'request_id')::uuid;
  if public.record_meta_publication_status(lot, 1, request::text, false, false)->>'saved'
    is distinct from 'false' then raise exception 'UNOBSERVED_STATUS_ACCEPTED'; end if;
  if public.record_meta_publication_status(lot, 1, request::text, true, true)->>'saved'
    is distinct from 'true' then raise exception 'OBSERVED_STATUS_NOT_SAVED'; end if;
  if public.claim_meta_publication(lot, 1, array['facebook','instagram'], photos, 'different copy')->>'send'
    is distinct from 'true' then raise exception 'CONFIRMED_STATUS_DID_NOT_RELEASE_UNIT'; end if;
end $$;
rollback;
