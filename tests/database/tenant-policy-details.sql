begin read only;
select 'columns' as kind,n.nspname as schema_name,c.relname as resource,
 jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
 'not_null',a.attnotnull,'authenticated_select',has_column_privilege('authenticated',c.oid,a.attnum,'SELECT'),
 'authenticated_insert',has_column_privilege('authenticated',c.oid,a.attnum,'INSERT'),
 'authenticated_update',has_column_privilege('authenticated',c.oid,a.attnum,'UPDATE')) order by a.attnum)::text as details
from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
where n.nspname='public' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
group by n.nspname,c.relname
union all
select 'helper',n.nspname,p.proname,jsonb_build_object('definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'config',p.proconfig,
 'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'))::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname='auth_lote_id') or (n.nspname='storage' and p.proname='foldername')
union all
select 'view',n.nspname,c.relname,jsonb_build_object('definition',pg_get_viewdef(c.oid,true),'owner',pg_get_userbyid(c.relowner))::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'
order by kind,schema_name,resource;
rollback;
