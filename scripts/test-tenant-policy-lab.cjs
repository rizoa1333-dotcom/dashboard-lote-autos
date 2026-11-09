'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const image='postgres@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb';
const prefix=['-d','Ubuntu-24.04','-u','root','--exec','docker'],label='20261103-tenant-policy-lab';let owned;
const [operation,inventoryFile,detailsFile,reportFile]=process.argv.slice(2);
function docker(args,input){return execFileSync('wsl.exe',[...prefix,...args],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],timeout:60000,maxBuffer:8*1024*1024}).trim();}
const qi=s=>'"'+s.replaceAll('"','""')+'"',qs=s=>"'"+s.replaceAll("'","''")+"'";
const tenant=i=>'10000000-0000-4000-8000-'+String(i).padStart(12,'0'),owner=i=>'20000000-0000-4000-8000-'+String(i).padStart(12,'0');
function sql(source){return docker(['exec','-i',owned,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','qa_tenants'],source);}
function requireTrue(expression,code){return `if (${expression}) is distinct from true then raise exception '${code}'; end if;`;}
(async()=>{
 if(operation!=='--execute-local-only'||!inventoryFile||!detailsFile||!reportFile)throw Error('USAGE: node scripts/test-tenant-policy-lab.cjs --execute-local-only INVENTORY.json DETAILS.json NEW_REPORT.json');
 for(const file of [inventoryFile,detailsFile])assert.ok(fs.statSync(file).isFile()&&fs.statSync(file).size<=1024*1024,'METADATA_LIMIT');
 assert.equal(fs.existsSync(reportFile),false,'REPORT_ALREADY_EXISTS');
 const inventory=fs.readFileSync(inventoryFile),details=fs.readFileSync(detailsFile);
 const rows=JSON.parse(inventory).rows.map(r=>({...r,d:JSON.parse(r.details)})),extra=JSON.parse(details).rows.map(r=>({...r,d:JSON.parse(r.details)}));
 assert.equal(rows.length,56);assert.equal(extra.length,19);
 const names=['lotes','cars','leads','chat_history','chat_handoffs','car_expenses','citas','facturas','whatsapp_channels'];
 const resources=rows.filter(r=>r.kind==='resource'&&r.d.kind==='r'&&(r.schema_name==='storage'||names.includes(r.resource)));
 const statements=[`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create schema storage; create schema qa; grant usage on schema public,auth,storage,qa to anon,authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;`];
 for(const r of resources){
  const cols=r.schema_name==='storage'?(r.resource==='objects'?[{name:'id',type:'uuid'},{name:'bucket_id',type:'text'},{name:'name',type:'text'}]:[{name:'id',type:'text'},{name:'public',type:'boolean'}]):extra.find(e=>e.kind==='columns'&&e.resource===r.resource)?.d;
  assert.ok(cols);for(const c of cols)assert.match(c.type,/^(uuid|bigint|integer|text|boolean|jsonb|numeric(?:\(\d+,\d+\))?|date|timestamp with time zone|time without time zone)$/);
  const table=qi(r.schema_name)+'.'+qi(r.resource);statements.push(`create table ${table} (${cols.map(c=>qi(c.name)+' '+c.type).join(',')});`);
  if(r.d.rls)statements.push(`alter table ${table} enable row level security;`);
  if(r.d.forced)statements.push(`alter table ${table} force row level security;`);
  for(const op of ['select','insert','update','delete'])if(r.d['authenticated_'+op])statements.push(`grant ${op} on ${table} to authenticated;`);
  if(r.schema_name==='public')for(const op of ['select','insert','update'])if(!r.d['authenticated_'+op]){
   const granted=cols.filter(c=>c['authenticated_'+op]).map(c=>qi(c.name));if(granted.length)statements.push(`grant ${op} (${granted.join(',')}) on ${table} to authenticated;`);
  }
 }
 statements.push('alter table public.lotes add primary key(id);create unique index on public.lotes(profile_id);create unique index on public.whatsapp_channels(instance_name);');
 for(const e of extra.filter(r=>r.kind==='helper'&&r.resource==='foldername')){statements.push(e.d.definition+';');statements.push(`revoke all on function ${qi(e.schema_name)}.${qi(e.resource)}(text) from public;`);for(const role of ['anon','authenticated'])if(e.d[role+'_execute'])statements.push(`grant execute on function ${qi(e.schema_name)}.${qi(e.resource)}(text) to ${role};`);}
 for(const r of rows.filter(r=>r.kind==='policy'&&resources.some(t=>t.schema_name===r.schema_name&&t.resource===r.resource))){
  const p=r.d;assert.ok(['ALL','SELECT','INSERT','UPDATE','DELETE'].includes(r.operation));assert.ok(['PERMISSIVE','RESTRICTIVE'].includes(p.permissive));
  if(p.permissive==='PERMISSIVE')continue;
  statements.push(`create policy ${qi(p.name)} on ${qi(r.schema_name)}.${qi(r.resource)} as ${p.permissive} for ${r.operation} to ${p.roles.map(qi).join(',')} ${p.using?'using ('+p.using+')':''} ${p.with_check?'with check ('+p.with_check+')':''};`);
 }
 statements.push("insert into storage.buckets(id,public) values ('documentos-leads',false),('car-images',true);");
 statements.push(fs.readFileSync('supabase_tenant_policy_baseline.sql','utf8'));
 for(const view of extra.filter(r=>r.kind==='view')){const r=rows.find(r=>r.kind==='resource'&&r.resource===view.resource);assert.deepEqual(r.d.options,['security_invoker=true','security_barrier=true']);statements.push(`create view public.${qi(view.resource)} with(security_invoker=true,security_barrier=true) as ${view.d.definition}`);}
 for(let i=1;i<=10;i++){
  const lot=qs(tenant(i));statements.push(`insert into public.lotes(id,profile_id,nombre,plan_status) values(${lot},${qs(owner(i))},'SYNTHETIC','active');
 insert into public.cars(id,lote_id,brand) values(${i},${lot},'FIXTURE');
 insert into public.leads(id,lote_id,nombre) values(${i},${lot},'FIXTURE');
 insert into public.citas(id,lote_id,nombre_cliente) values(${i},${lot},'FIXTURE');
 insert into public.chat_handoffs(lote_id,phone_number,pause_reason) values(${lot},'523120000000','FIXTURE');
 insert into public.chat_history(id,lote_id,phone_number,role,content) values(${i},${lot},'523120000000','user','SYNTHETIC');
 insert into public.car_expenses(id,lote_id,car_id,category) values(gen_random_uuid(),${lot},${i},'FIXTURE');
 insert into public.whatsapp_channels(id,lote_id,instance_name,api_key) values(gen_random_uuid(),${lot},'qa_lot_${i}','SYNTHETIC_NOT_A_KEY');
 insert into public.facturas(id,lote_id) values(gen_random_uuid(),${lot});
 insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'documentos-leads',${qs(tenant(i)+'/fixture.txt')});`);
 }
 const tables=[['car_expenses','category'],['leads','nombre'],['citas','nombre_cliente'],['chat_handoffs','pause_reason'],['cars','brand']];let checks=0;
 const matrix=[];
 for(let i=1;i<=10;i++){
  let body='declare n integer; rejected boolean; begin\n';
  const lot=qs(tenant(i)),foreign=qs(tenant(i%10+1));
  for(const [name,col] of tables){
   const table='public.'+qi(name);body+=`select count(*) into n from ${table};${requireTrue('n=1',name+'_SELECT')}
 update ${table} set ${qi(col)}='OWN_OK' where lote_id=${lot};get diagnostics n=row_count;${requireTrue('n=1',name+'_OWN_UPDATE')}
 update ${table} set ${qi(col)}='FOREIGN_ATTACK' where lote_id<>${lot};get diagnostics n=row_count;${requireTrue('n=0',name+'_FOREIGN_UPDATE')}
 delete from ${table} where lote_id<>${lot};get diagnostics n=row_count;${requireTrue('n=0',name+'_FOREIGN_DELETE')}
 rejected:=false;begin update ${table} set lote_id=${foreign} where lote_id=${lot};exception when insufficient_privilege then rejected:=true;end;${requireTrue('rejected',name+'_MOVE')}
 rejected:=false;begin insert into ${table}(lote_id${name==='car_expenses'?',car_id':''}) values(${foreign}${name==='car_expenses'?','+(i%10+1):''});exception when insufficient_privilege then rejected:=true;end;${requireTrue('rejected',name+'_FOREIGN_INSERT')}
 insert into ${table}(lote_id${name==='car_expenses'?',car_id':''}) values(${lot}${name==='car_expenses'?','+i:''});
 delete from ${table} where ${qi(col)}='OWN_OK';get diagnostics n=row_count;${requireTrue('n=1',name+'_OWN_DELETE')}\n`;checks+=8;
  }
  body+=`select count(*) into n from public.lotes;${requireTrue('n=1','LOT_SELECT')}
 select count(*) into n from public.chat_history;${requireTrue('n=1','HISTORY_SELECT')}
 select count(*) into n from public.whatsapp_channels;${requireTrue('n=1','CHANNEL_SELECT')}
 select count(*) into n from public.facturas;${requireTrue('n=0','INVOICES_DEFAULT_DENY')}
 select count(*) into n from storage.objects;${requireTrue('n=1','DOCUMENT_SELECT')}
 insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'car-images',${qs(tenant(i)+'/own.jpg')});
 rejected:=false;begin insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'car-images',${qs(tenant(i%10+1)+'/foreign.jpg')});exception when insufficient_privilege then rejected:=true;end;${requireTrue('rejected','STORAGE_INSERT')}
 update storage.objects set name='changed.jpg';get diagnostics n=row_count;${requireTrue('n=0','STORAGE_UPDATE_DENIED')}
 delete from storage.objects;get diagnostics n=row_count;${requireTrue('n=0','STORAGE_DELETE_DENIED')}
 rejected:=false;begin update public.lotes set plan_status='active';exception when insufficient_privilege then rejected:=true;end;${requireTrue('rejected','PLAN_ESCALATION')}
 rejected:=false;begin perform api_key from public.whatsapp_channels;exception when insufficient_privilege then rejected:=true;end;${requireTrue('rejected','CHANNEL_SECRET')}
 rejected:=false;begin insert into public.chat_history(lote_id,content) values(${lot},'FORGED');exception when insufficient_privilege then rejected:=true;end;${requireTrue('rejected','HISTORY_FORGERY')}
 rejected:=false;begin perform * from public.agent_inventory;exception when insufficient_privilege then rejected:=true;end;${requireTrue('rejected','SERVICE_VIEW')}
 end;`;
  checks+=13;matrix.push(`begin;set local role authenticated;select set_config('request.jwt.claims',${qs(JSON.stringify({sub:owner(i),role:'authenticated'}))},true);do $qa$ ${body} $qa$;rollback;`);
 }
 const name='velodrive-qa-policies-'+crypto.randomUUID();owned=docker(['run','-d','--pull=never','--name',name,'--label','velodrive.qa='+label,'--network','none','--read-only','--user','postgres','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','768m','--cpus','1','--tmpfs','/var/lib/postgresql/data:rw,nosuid,noexec,size=512m,mode=1777','--tmpfs','/var/run/postgresql:rw,nosuid,noexec,size=16m,mode=1777','--tmpfs','/tmp:rw,nosuid,noexec,size=32m,mode=1777','--env','PGDATA=/var/lib/postgresql/data/pgdata','--env','POSTGRES_DB=qa_tenants','--env-file','/dev/stdin',image,'-c',"listen_addresses="],'POSTGRES_PASSWORD='+crypto.randomBytes(24).toString('hex')+'\n');assert.match(owned,/^[a-f0-9]{64}$/);
 const config=JSON.parse(docker(['inspect',owned]))[0];assert.equal(config.HostConfig.NetworkMode,'none');assert.equal(config.HostConfig.ReadonlyRootfs,true);assert.equal(config.Config.User,'postgres');assert.equal(Object.keys(config.HostConfig.PortBindings||{}).length,0);
 let ready=false;for(let i=0;i<30;i++){try{docker(['exec',owned,'pg_isready','-U','postgres','-d','qa_tenants']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,300));}}assert.equal(ready,true);
 sql(statements.join('\n'));sql(matrix.join('\n'));
 let unpaid='declare n integer; rejected boolean;begin select count(*) into n from public.cars;'+requireTrue('n=1','UNPAID_HISTORY_READ');
 for(const [table,col] of tables){unpaid+=`update public.${qi(table)} set ${qi(col)}='UNPAID';get diagnostics n=row_count;${requireTrue('n=0',table+'_UNPAID_UPDATE')}
 delete from public.${qi(table)};get diagnostics n=row_count;${requireTrue('n=0',table+'_UNPAID_DELETE')}
 rejected:=false;begin insert into public.${qi(table)}(lote_id${table==='car_expenses'?',car_id':''}) values(${qs(tenant(10))}${table==='car_expenses'?',10':''});exception when insufficient_privilege then rejected:=true;end;${requireTrue('rejected',table+'_UNPAID_INSERT')}\n`;}
 unpaid+='end;';checks+=16;
 sql(`begin;update public.lotes set plan_status='pending' where id=${qs(tenant(10))};set local role authenticated;select set_config('request.jwt.claims',${qs(JSON.stringify({sub:owner(10),role:'authenticated'}))},true);do $qa$ ${unpaid} $qa$;rollback;`);
 // Prove the oracle detects a permissive SELECT leak, only inside this disposable DB.
 sql('alter policy tenant_isolation_cars on public.cars using(true) with check(true);');
 let detected=false;try{sql(matrix[0]);}catch(e){detected=/cars_SELECT/.test(String(e.stderr||e.message));}assert.equal(detected,true);
 sql('alter policy tenant_isolation_cars on public.cars using(lote_id=auth_lote_id()) with check(lote_id=auth_lote_id());');sql(matrix[0]);
 sql(fs.readFileSync('supabase_whatsapp_reliability.sql','utf8'));
 sql(`grant select on public.whatsapp_channels to service_role;
 create table qa.counter(client integer primary key,n integer not null default 0,accepted integer not null default 0,duplicates integer not null default 0);
 insert into qa.counter(client) select generate_series(1,10);
 create function qa.process(p_client integer) returns void language plpgsql as $bench$
 declare sequence integer; event jsonb; lot uuid; msg text; execution text; begin
 update qa.counter set n=n+1 where client=p_client returning n into sequence;
 lot:=('10000000-0000-4000-8000-'||lpad(p_client::text,12,'0'))::uuid;
 msg:='QA_'||((sequence-1)/2)::text;execution:='EXEC_'||p_client::text||'_'||sequence::text;
 event:=public.claim_whatsapp_event('qa_lot_'||p_client::text,msg,'523120000000',execution);
 if (event->>'lote_id')::uuid is distinct from lot then raise exception 'TENANT_BENCHMARK_LEAK';end if;
 if (event->>'acquired')::boolean then
  if not (public.begin_whatsapp_send('qa_lot_'||p_client::text,msg,execution)->>'send')::boolean then raise exception 'SEND_NOT_CLAIMED';end if;
  if not (public.finish_whatsapp_event('qa_lot_'||p_client::text,msg,execution,'accepted','OUT_'||p_client::text||'_'||sequence::text)->>'updated')::boolean then raise exception 'ACCEPT_NOT_SAVED';end if;
  if not (public.finish_whatsapp_event('qa_lot_'||p_client::text,msg,execution,'completed')->>'updated')::boolean then raise exception 'COMPLETE_NOT_SAVED';end if;
  update qa.counter set accepted=accepted+1 where client=p_client;
 else update qa.counter set duplicates=duplicates+1 where client=p_client;end if;
 end $bench$;
 grant all on qa.counter to service_role;grant execute on function qa.process(integer) to service_role;`);
 docker(['exec','-i',owned,'sh','-c','cat > /tmp/qa.pgbench'],'begin;\nset local role service_role;\nselect qa.process(:client_id + 1);\ncommit;\n');
 const bench=docker(['exec',owned,'pgbench','-n','-U','postgres','-d','qa_tenants','-c','10','-j','2','-t','100','-f','/tmp/qa.pgbench','-l','--log-prefix=/tmp/qa_latency']);
 assert.match(bench,/number of transactions actually processed: 1000\/1000/);assert.match(bench,/number of failed transactions: 0/);
 const stats=JSON.parse(sql(`select json_build_object('calls',sum(n),'accepted',sum(accepted),'duplicates',sum(duplicates),'tenants',(select count(distinct lote_id) from public.whatsapp_inbox),'completed',(select count(*) from public.whatsapp_inbox where state='completed'),'misassigned',(select count(*) from public.whatsapp_inbox w join public.whatsapp_channels c using(instance_name) where w.lote_id<>c.lote_id)) from qa.counter;`));
 assert.deepEqual(stats,{calls:1000,accepted:500,duplicates:500,tenants:10,completed:500,misassigned:0});
 const latency=docker(['exec',owned,'sh','-c','cat /tmp/qa_latency.*']).split('\n').map(l=>Number(l.trim().split(/\s+/)[2])/1000).sort((a,b)=>a-b);assert.equal(latency.length,1000);assert.ok(latency.every(Number.isFinite));
 sql(`create table qa.race(client integer primary key,acquired boolean not null);
 create function qa.race_claim(p_client integer) returns void language plpgsql as $hot$
 declare event jsonb;begin
 event:=public.claim_whatsapp_event('qa_lot_1','SHARED_HOT_MESSAGE','523120000000','HOT_EXEC_'||p_client::text);
 if (event->>'lote_id')::uuid is distinct from ${qs(tenant(1))}::uuid then raise exception 'HOT_TENANT_MISMATCH';end if;
 insert into qa.race values(p_client,(event->>'acquired')::boolean);end $hot$;
 grant all on qa.race to service_role;grant execute on function qa.race_claim(integer) to service_role;`);
 docker(['exec','-i',owned,'sh','-c','cat > /tmp/qa-hot.pgbench'],'begin;\nset local role service_role;\nselect qa.race_claim(:client_id + 1);\ncommit;\n');
 const hot=docker(['exec',owned,'pgbench','-n','-U','postgres','-d','qa_tenants','-c','10','-j','2','-t','1','-f','/tmp/qa-hot.pgbench']);assert.match(hot,/number of transactions actually processed: 10\/10/);assert.match(hot,/number of failed transactions: 0/);
 assert.equal(sql("select count(*)||','||count(*) filter(where acquired) from qa.race;"),'10,1');
 sql('alter table public.cars add primary key(id);');
 sql(fs.readFileSync('supabase_marketing_security.sql','utf8'));
 sql('grant select,update on public.lotes,public.cars to service_role;');
 sql(fs.readFileSync('tests/database/marketing-security-regression.sql','utf8'));
 sql('create table qa.meta_race(client integer primary key, result jsonb not null);grant insert on qa.meta_race to service_role;');
 docker(['exec','-i',owned,'sh','-c','cat > /tmp/qa-meta.pgbench'],`begin;
 set local role service_role;
 insert into qa.meta_race values (:client_id, public.claim_meta_publication(${qs(tenant(1))},1,array['instagram'],array['https://example.invalid/fixture.jpg'],'QA race'));
 commit;\n`);
 const metaRace = docker(['exec',owned,'pgbench','-n','-U','postgres','-d','qa_tenants','-c','10','-j','2','-t','1','-f','/tmp/qa-meta.pgbench']);
 assert.match(metaRace,/number of transactions actually processed: 10\/10/);
 assert.equal(sql(`select count(*)||','||count(*) filter (where result->>'send'='true')||','||count(distinct result->>'request_id') from qa.meta_race;`),'10,1,1');
 const report={at:new Date().toISOString(),tenants:10,checks,negativeControlDetected:true,testedBusinessTables:names,policyRows:rows.filter(r=>r.kind==='policy').length,isolatedPostgresImage:image,network:'none',publishedPorts:0,realCustomerData:false,productionWrites:false,liveJwtValidation:false,fullSchemaRestore:false,queueBenchmark:{...stats,concurrentClients:10,transactions:1000,failedTransactions:0,latencyMs:{p50:latency[499],p95:latency[949],p99:latency[989],max:latency.at(-1)},sameEventContention:{callers:10,acquired:1},syntheticDatabaseOnly:true,externalApiCalls:0,productionCapacityCertified:false},policyInventoryHash:crypto.createHash('sha256').update(inventory).digest('hex'),columnInventoryHash:crypto.createHash('sha256').update(details).digest('hex')};
 report.marketing = { concurrentCalls:10, authorizedProviderDispatches:1, distinctRequestIds:1, regressionPassed:true, externalApiCalls:0 };
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
})().catch(error=>{console.error(JSON.stringify({status:'TENANT_LAB_NOT_VERIFIED',error:error.code||error.message,detail:Buffer.isBuffer(error.stderr)?error.stderr.toString().slice(-1500):undefined}));process.exitCode=1}).finally(()=>{if(owned){try{const c=JSON.parse(docker(['inspect',owned]))[0];assert.equal(c.Id,owned);assert.equal(c.Config.Labels?.['velodrive.qa'],label);docker(['rm','-f',owned]);console.log('OWNED_LAB_REMOVED');}catch{console.error('LAB_CLEANUP_NOT_VERIFIED');process.exitCode=1}}});
