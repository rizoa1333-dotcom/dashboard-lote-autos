-- Probar antes y despues de supabase_security_expense_integrity.sql.
-- Fixtures aislados; ROLLBACK revierte datos y cualquier pg_net de triggers.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
  if exists(select 1 from auth.users where id in ('aaaaaaaa-2000-4000-8000-000000000001','aaaaaaaa-2000-4000-8000-000000000002'))
    or exists(select 1 from public.cars where id=8000000000000201) then raise exception 'QA_FIXTURE_COLLISION'; end if;
end $$;
insert into auth.users(id) values('aaaaaaaa-2000-4000-8000-000000000001'),('aaaaaaaa-2000-4000-8000-000000000002');
insert into public.lotes(id,profile_id,nombre,email_admin,plan_status) values
 ('bbbbbbbb-2000-4000-8000-000000000001','aaaaaaaa-2000-4000-8000-000000000001','EXPENSE QA A','a@invalid.example','active'),
 ('bbbbbbbb-2000-4000-8000-000000000002','aaaaaaaa-2000-4000-8000-000000000002','EXPENSE QA B','b@invalid.example','active');
insert into public.cars(id,lote_id,brand,model,year,price) overriding system value values
 (8000000000000201,'bbbbbbbb-2000-4000-8000-000000000001','QA','EXPENSE',2026,100);
set local role service_role;
do $$ declare rejected boolean:=false; expense_id uuid; begin
  begin
    insert into public.car_expenses(lote_id,car_id,category,amount) values('bbbbbbbb-2000-4000-8000-000000000002',8000000000000201,'otro',1);
  exception when foreign_key_violation then rejected:=true; end;
  if not rejected then raise exception 'CROSS_TENANT_EXPENSE_ACCEPTED'; end if;
  insert into public.car_expenses(lote_id,car_id,category,amount) values('bbbbbbbb-2000-4000-8000-000000000001',8000000000000201,'otro',1) returning id into expense_id;
  rejected:=false;
  begin update public.cars set lote_id='bbbbbbbb-2000-4000-8000-000000000002' where id=8000000000000201;
  exception when foreign_key_violation then rejected:=true; end;
  if not rejected then raise exception 'CAR_MOVED_WITH_WRONG_TENANT_EXPENSE'; end if;
  delete from public.cars where id=8000000000000201;
  if exists(select 1 from public.car_expenses where id=expense_id) then raise exception 'EXISTING_DELETE_CASCADE_CHANGED'; end if;
end $$;
reset role;
select 'EXPENSE_INTEGRITY_PASS_ROLLBACK' as result;
rollback;
