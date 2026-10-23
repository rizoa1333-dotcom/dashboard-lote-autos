begin;
do $$
declare l public.lotes%rowtype; a jsonb; b jsonb; denied boolean; lease uuid:=gen_random_uuid();
begin
 select * into l from public.lotes where id='38fc2094-ce52-4e6a-9c42-69db7725d65f';
 if not found then raise exception 'QA_LOT_MISSING'; end if;
 update public.lotes set stripe_subscription_id=null where id=l.id;
 a:=public.claim_lote_checkout(l.id,l.profile_id,'price_live','production',l.email_admin);
 b:=public.claim_lote_checkout(l.id,l.profile_id,'price_live','production',l.email_admin);
 if a->>'id' is distinct from b->>'id' then raise exception 'CHECKOUT_ATTEMPT_NOT_REUSED'; end if;
 denied:=false;
 begin perform public.claim_lote_checkout(l.id,gen_random_uuid(),'price_live','production',l.email_admin);
 exception when others then if sqlerrm='CHECKOUT_FORBIDDEN' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'CROSS_TENANT_CHECKOUT_ACCEPTED'; end if;
 denied:=false;
 begin perform public.claim_lote_checkout(l.id,l.profile_id,'price_other','production',l.email_admin);
 exception when others then if sqlerrm='CHECKOUT_ATTEMPT_CONFLICT' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'CONCURRENT_PRICE_CHANGE_ACCEPTED'; end if;
 perform public.complete_lote_checkout((a->>'id')::uuid,l.id,l.profile_id,'cs_live_sqltest','https://checkout.stripe.com/c/pay/cs_live_sqltest');
 denied:=false;
 begin perform public.complete_lote_checkout((a->>'id')::uuid,l.id,l.profile_id,'cs_live_other','https://checkout.stripe.com/c/pay/cs_live_other');
 exception when others then if sqlerrm='CHECKOUT_ATTEMPT_CONFLICT' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'SESSION_REASSIGNMENT_ACCEPTED'; end if;
 perform public.claim_stripe_security_event('evt_checkoutsqltest','sub_checkoutsqltest',lease);
 b:=public.apply_checkout_session_security_event('evt_checkoutsqltest','sub_checkoutsqltest',lease,l.id,l.profile_id,'cus_checkoutsqltest','active',clock_timestamp()+interval '30 days',false,(a->>'id')::uuid,'cs_live_sqltest');
 if b->>'matched' <> 'true' or not exists(select 1 from public.checkout_security_sessions where id=(a->>'id')::uuid and state='paid' and subscription_id='sub_checkoutsqltest') then raise exception 'CHECKOUT_CONSUMPTION_NOT_ATOMIC'; end if;
 b:=public.claim_lote_checkout(l.id,l.profile_id,'price_live','production',l.email_admin);
 if b->>'state' <> 'subscribed' then raise exception 'PAID_CHECKOUT_REOPENED'; end if;
 lease:=gen_random_uuid();
 perform public.claim_stripe_security_event('evt_cancelsqltest','sub_checkoutsqltest',lease);
 perform public.apply_stripe_security_event('evt_cancelsqltest','sub_checkoutsqltest',lease,null,null,'cus_checkoutsqltest','inactive',clock_timestamp(),true);
 b:=public.claim_lote_checkout(l.id,l.profile_id,'price_live','production',l.email_admin);
 if b->>'id'=a->>'id' or b->>'state'<>'creating' then raise exception 'RESUBSCRIBE_AFTER_CANCELLATION_BLOCKED'; end if;
 update public.checkout_security_sessions set expires_at=floor(extract(epoch from clock_timestamp()))::bigint-301 where id=(b->>'id')::uuid;
 perform public.reconcile_creating_lote_checkout((b->>'id')::uuid,l.id,l.profile_id,null,'absent',null);
 a:=public.claim_lote_checkout(l.id,l.profile_id,'price_live','production',l.email_admin);
 if a->>'id'=b->>'id' then raise exception 'ABANDONED_CREATION_NOT_RECOVERED'; end if;
 if has_table_privilege('authenticated','public.checkout_security_sessions','SELECT')
 or has_table_privilege('anon','public.checkout_security_sessions','SELECT')
 or has_function_privilege('authenticated','public.claim_lote_checkout(uuid,uuid,text,text,text)','EXECUTE')
 or has_function_privilege('anon','public.complete_lote_checkout(uuid,uuid,uuid,text,text)','EXECUTE') then raise exception 'CLIENT_CHECKOUT_PRIVILEGE'; end if;
 if not (select relrowsecurity from pg_class where oid='public.checkout_security_sessions'::regclass) then raise exception 'CHECKOUT_RLS_DISABLED'; end if;
end $$;
select 'CHECKOUT_SQL_PASS_ROLLBACK' as result;
rollback;

