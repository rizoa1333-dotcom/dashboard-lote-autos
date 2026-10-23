begin;
do $$
declare v_user uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid(); v_op uuid:=gen_random_uuid();
  v_failed boolean:=false; v_lot public.lotes%rowtype;
begin
  if not coalesce((public.registration_atomic_ready()->>'ready')::boolean,false) then raise exception 'ATOMIC_TRIGGER_NOT_READY'; end if;
  begin
    insert into auth.users(id,email,raw_user_meta_data) values(v_user,'atomic-invalid-'||v_user||'@example.invalid',
      jsonb_build_object('legal_consent',jsonb_build_object('terms',true,'privacy',true,'version','qa'),
        'velodrive_registration',jsonb_build_object('version',1,'operation_id',gen_random_uuid(),'lote',jsonb_build_object('nombre',''))));
  exception when others then v_failed:=true; end;
  if not v_failed or exists(select 1 from auth.users where id=v_user) or exists(select 1 from public.lotes where profile_id=v_user) then
    raise exception 'ORPHAN_USER_AFTER_FAILED_REGISTRATION'; end if;
  insert into auth.users(id,email,raw_user_meta_data) values(v_user,'atomic-valid-'||v_user||'@example.invalid',
    jsonb_build_object('legal_consent',jsonb_build_object('terms',true,'privacy',true,'version','qa'),
      'velodrive_registration',jsonb_build_object('version',1,'operation_id',v_op,'lote',
        jsonb_build_object('nombre','QA ATOMIC ROLLBACK','profile_id',gen_random_uuid(),'plan_status','active',
          'stripe_subscription_id','sub_forged','webhook_token','forged'))));
  select * into strict v_lot from public.lotes where profile_id=v_user;
  if v_lot.plan_status is distinct from 'past_due' or v_lot.stripe_subscription_id is not null or v_lot.webhook_token::text='forged'
    or v_lot.email_admin is distinct from 'atomic-valid-'||v_user||'@example.invalid' then raise exception 'PRIVILEGED_METADATA_ACCEPTED'; end if;
  v_failed:=false;
  begin
    insert into auth.users(id,email,raw_user_meta_data) values(v_other,'atomic-duplicate-'||v_other||'@example.invalid',
      jsonb_build_object('legal_consent',jsonb_build_object('terms',true,'privacy',true,'version','qa'),
        'velodrive_registration',jsonb_build_object('version',1,'operation_id',v_op,'lote',jsonb_build_object('nombre','QA DUPLICATE ROLLBACK'))));
  exception when unique_violation then v_failed:=true; end;
  if not v_failed or exists(select 1 from auth.users where id=v_other) or exists(select 1 from public.lotes where profile_id=v_other) then
    raise exception 'DUPLICATE_OPERATION_NOT_ATOMIC'; end if;
  if has_function_privilege('authenticated','public.registration_atomic_ready()','EXECUTE')
    or has_function_privilege('anon','public.registration_atomic_ready()','EXECUTE') then raise exception 'READINESS_RPC_EXPOSED'; end if;
end $$;
select 'ATOMIC_REGISTRATION_PASS_ROLLBACK' as result;
rollback;
