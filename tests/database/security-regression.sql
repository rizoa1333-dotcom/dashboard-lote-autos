-- Fixtures exclusivos de QA. Todo se revierte; no envía mensajes ni cobra.
-- Las solicitudes pg_net de triggers quedan en la transacción revertida.
begin;
do $$ begin
  if to_regprocedure('public.claim_stripe_security_event(text,text,uuid)') is null
    or to_regclass('public.agent_inventory') is null then raise exception 'SECURITY_MIGRATIONS_REQUIRED'; end if;
  if exists(select 1 from auth.users where id in ('aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-1000-4000-8000-000000000002'))
    or exists(select 1 from public.lotes where id in ('bbbbbbbb-1000-4000-8000-000000000001','bbbbbbbb-1000-4000-8000-000000000002'))
    or exists(select 1 from public.cars where id between 8000000000000101 and 8000000000000103)
    or exists(select 1 from public.citas where id=8000000000000001) then raise exception 'QA_FIXTURE_COLLISION'; end if;
end $$;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into auth.users(id) values('aaaaaaaa-1000-4000-8000-000000000001'),('aaaaaaaa-1000-4000-8000-000000000002');
insert into public.lotes(id,profile_id,nombre,email_admin,plan_status) values
 ('bbbbbbbb-1000-4000-8000-000000000001','aaaaaaaa-1000-4000-8000-000000000001','SECURITY QA A','a@invalid.example','active'),
 ('bbbbbbbb-1000-4000-8000-000000000002','aaaaaaaa-1000-4000-8000-000000000002','SECURITY QA B','b@invalid.example','pending');
insert into public.cars(id,lote_id,brand,model,year,price,purchase_cost) overriding system value values
 (8000000000000101,'bbbbbbbb-1000-4000-8000-000000000001','QA','A',2026,100,55),
 (8000000000000102,'bbbbbbbb-1000-4000-8000-000000000002','QA','B',2026,100,22),
 (8000000000000103,'bbbbbbbb-1000-4000-8000-000000000001','QA','DELETE',2026,100,55);

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"aaaaaaaa-1000-4000-8000-000000000001"}',true);
do $$ declare n integer; rejected boolean:=false; begin
  select count(*) into n from public.cars where id between 8000000000000101 and 8000000000000103;
  if n<>2 then raise exception 'CROSS_TENANT_SELECT'; end if;
  update public.cars set model='ATTACK' where id=8000000000000102;
  get diagnostics n=row_count; if n<>0 then raise exception 'CROSS_TENANT_UPDATE'; end if;
  delete from public.cars where id=8000000000000102;
  get diagnostics n=row_count; if n<>0 then raise exception 'CROSS_TENANT_DELETE'; end if;
  delete from public.cars where id=8000000000000103;
  get diagnostics n=row_count; if n<>1 then raise exception 'OWN_DELETE_FAILED'; end if;
  begin
    insert into public.cars(lote_id,brand,model,year,price) values('bbbbbbbb-1000-4000-8000-000000000002','QA','ATTACK',2026,1);
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'CROSS_TENANT_INSERT'; end if;
  rejected:=false;
  begin update public.cars set lote_id='bbbbbbbb-1000-4000-8000-000000000002' where id=8000000000000101;
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'CROSS_TENANT_MOVE'; end if;
  rejected:=false;
  begin insert into public.chat_history(lote_id,phone_number,role,content) values('bbbbbbbb-1000-4000-8000-000000000001','3120000001','model','forged');
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'CLIENT_HISTORY_WRITE'; end if;
  if has_table_privilege(current_user,'public.cars','TRUNCATE') then raise exception 'CLIENT_TRUNCATE'; end if;
  if has_function_privilege(current_user,'public.claim_stripe_security_event(text,text,uuid)','EXECUTE') then raise exception 'CLIENT_BILLING_RPC'; end if;
  if has_table_privilege(current_user,'public.agent_inventory','SELECT') then raise exception 'CLIENT_AGENT_VIEW'; end if;
end $$;

-- El dueño B tiene datos históricos, pero un plan pendiente no permite escrituras premium.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"aaaaaaaa-1000-4000-8000-000000000002"}',true);
do $$ declare n integer; rejected boolean:=false; begin
  update public.cars set model='UNPAID' where id=8000000000000102;
  get diagnostics n=row_count; if n<>0 then raise exception 'UNPAID_UPDATE'; end if;
  delete from public.cars where id=8000000000000102;
  get diagnostics n=row_count; if n<>0 then raise exception 'UNPAID_DELETE'; end if;
  begin insert into public.cars(lote_id,brand,model,year,price) values('bbbbbbbb-1000-4000-8000-000000000002','QA','UNPAID',2026,1);
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'UNPAID_INSERT'; end if;
  if not exists(select 1 from public.cars where id=8000000000000102) then raise exception 'OWN_HISTORY_READ_FAILED'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ declare n integer; begin
  select count(*) into n from public.agent_inventory where lote_id in ('bbbbbbbb-1000-4000-8000-000000000001','bbbbbbbb-1000-4000-8000-000000000002');
  if n<>1 then raise exception 'AGENT_PLAN_PROJECTION'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='agent_inventory'
    and column_name in ('purchase_cost','sold_price')) then raise exception 'AGENT_PRIVATE_COLUMNS'; end if;
  perform public.append_conversation_message('bbbbbbbb-1000-4000-8000-000000000001','3120000001','human','QA HUMAN','SECURITYQA_HUMAN','human');
end $$;

do $$
declare
  token1 uuid:=gen_random_uuid(); token2 uuid:=gen_random_uuid(); r jsonb; rejected boolean;
  event1 text:='evt_'||replace(gen_random_uuid()::text,'-','');
  event2 text:='evt_'||replace(gen_random_uuid()::text,'-','');
  event3 text:='evt_'||replace(gen_random_uuid()::text,'-','');
  event4 text:='evt_'||replace(gen_random_uuid()::text,'-','');
  event5 text:='evt_'||replace(gen_random_uuid()::text,'-','');
  event6 text:='evt_'||replace(gen_random_uuid()::text,'-','');
  sub text:='sub_'||replace(gen_random_uuid()::text,'-','');
begin
  r:=public.claim_stripe_security_event(event1,sub,token1);
  if r->>'state'<>'claimed' then raise exception 'BILLING_CLAIM_FAILED'; end if;
  r:=public.claim_stripe_security_event(event2,sub,token2);
  if r->>'state'<>'busy' then raise exception 'BILLING_CONCURRENT_CLAIM'; end if;
  rejected:=false;
  begin perform public.apply_stripe_security_event(event1,sub,token2,'bbbbbbbb-1000-4000-8000-000000000001','aaaaaaaa-1000-4000-8000-000000000001','cus_securityqa','active',now()+interval '1 month',false);
  exception when others then if sqlerrm='BILLING_LEASE_LOST' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'BILLING_WRONG_FENCE_ACCEPTED'; end if;
  r:=public.apply_stripe_security_event(event1,sub,token1,'bbbbbbbb-1000-4000-8000-000000000001','aaaaaaaa-1000-4000-8000-000000000001','cus_securityqa','active',now()+interval '1 month',false);
  if r->>'matched'<>'true' then raise exception 'BILLING_COMMIT_FAILED'; end if;
  r:=public.claim_stripe_security_event(event1,sub,token2);
  if r->>'state'<>'duplicate' then raise exception 'BILLING_REPLAY_ACCEPTED'; end if;
  r:=public.claim_stripe_security_event(event3,sub,token1);
  update public.stripe_security_locks set lease_until=clock_timestamp()-interval '1 second' where subscription_id=sub;
  r:=public.claim_stripe_security_event(event4,sub,token2);
  if r->>'state'<>'claimed' then raise exception 'BILLING_LEASE_RECOVERY_FAILED'; end if;
  rejected:=false;
  begin perform public.apply_stripe_security_event(event3,sub,token1,null,null,'cus_securityqa','active',now()+interval '1 month',false);
  exception when others then if sqlerrm='BILLING_LEASE_LOST' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'BILLING_STALE_WORKER_ACCEPTED'; end if;
  perform public.apply_stripe_security_event(event4,sub,token2,null,null,'cus_securityqa','past_due',now()+interval '1 month',false);
  perform public.claim_stripe_security_event(event5,sub,token1);
  perform public.apply_stripe_security_event(event5,sub,token1,null,null,'cus_securityqa','inactive',now(),true);
  perform public.claim_stripe_security_event(event6,sub,token2);
  r:=public.apply_stripe_security_event(event6,sub,token2,null,null,'cus_securityqa','active',now()+interval '1 month',false);
  if r->>'matched'<>'false' then raise exception 'CANCELLED_PLAN_REATTACHED'; end if;
  if not exists(select 1 from public.lotes where id='bbbbbbbb-1000-4000-8000-000000000001' and plan_status='inactive' and stripe_subscription_id is null) then raise exception 'CANCELLATION_STATE_LOST'; end if;
end $$;

reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.lotes set plan_status='active' where id='bbbbbbbb-1000-4000-8000-000000000001';
insert into public.citas(id,lote_id,nombre_cliente,telefono) overriding system value
values(8000000000000001,'bbbbbbbb-1000-4000-8000-000000000001','QA ONLY','3120000001');
set local role service_role;
do $$ declare r jsonb; begin
  r:=public.claim_cita_security_notification(8000000000000001,'SECURITYQA1');
  if r->>'acquired'<>'true' or r->'record'->>'lote_id'<>'bbbbbbbb-1000-4000-8000-000000000001' then raise exception 'CITA_CLAIM_FAILED'; end if;
  r:=public.claim_cita_security_notification(8000000000000001,'SECURITYQA2');
  if r->>'acquired'<>'false' then raise exception 'CITA_DUPLICATE_ACCEPTED'; end if;
  perform public.finish_cita_security_notification(8000000000000001,'SECURITYQA1','OUTBOUND_QA_ONLY');
end $$;
reset role;
rollback;
select 'PASS: tenant isolation, unpaid writes, public projection, human memory, billing lease/replay/cancellation and cita dedup; fixtures rolled back' as result;
