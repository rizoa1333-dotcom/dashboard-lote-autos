begin read only;

with resources as (
 select c.oid,n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relkind,c.reloptions
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where (n.nspname='public' or (n.nspname='storage' and c.relname in ('objects','buckets')))
 and c.relkind in ('r','p','v')
)
select 'resource' as kind,r.nspname as schema_name,r.relname as resource,'' as operation,
 jsonb_build_object('rls',r.relrowsecurity,'forced',r.relforcerowsecurity,'kind',r.relkind,
 'options',r.reloptions,'authenticated_select',has_table_privilege('authenticated',r.oid,'SELECT'),
 'authenticated_insert',has_table_privilege('authenticated',r.oid,'INSERT'),
 'authenticated_update',has_table_privilege('authenticated',r.oid,'UPDATE'),
 'authenticated_delete',has_table_privilege('authenticated',r.oid,'DELETE'))::text as details
from resources r
union all
select 'policy',p.schemaname,p.tablename,p.cmd,
 jsonb_build_object('name',p.policyname,'roles',p.roles,'permissive',p.permissive,
 'using',p.qual,'with_check',p.with_check)::text
from pg_policies p where p.schemaname='public' or (p.schemaname='storage' and p.tablename in ('objects','buckets'))
union all
select 'trigger',n.nspname,c.relname,t.tgname,
 jsonb_build_object('enabled',t.tgenabled,'function',pn.nspname||'.'||p.proname,
 'language',l.lanname,'security_definer',p.prosecdef,
 'body_fingerprint',md5(regexp_replace(p.prosrc,'[[:space:]]+',' ','g')),
 'transactional_http',p.prosrc ~* 'net[.]http_',
 'other_external_call',p.prosrc ~* '(extensions[.]http_|http[.]|dblink|postgres_fdw|copy[[:space:]].*program)',
 'dynamic_sql',p.prosrc ~* '\mexecute\M')::text
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace join pg_language l on l.oid=p.prolang
where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users'))
union all
select 'role','',rolname,'',jsonb_build_object('superuser',rolsuper,'bypass_rls',rolbypassrls,'inherit',rolinherit)::text
from pg_roles where rolname in ('anon','authenticated','service_role','postgres')
order by kind,schema_name,resource,operation;

rollback;
