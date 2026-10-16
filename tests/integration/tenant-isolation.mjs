import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

if (!process.argv.includes('--live-qa')) throw new Error('Requiere --live-qa: crea y limpia únicamente fixtures efímeros.');
const config = Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).filter(s=>/^[A-Z_0-9]+=/.test(s)).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const base = new URL(config.SUPABASE_URL).origin;
const publicKey = /const SUPABASE_ANON_KEY = '([^']+)'/.exec(readFileSync('dashboard.js','utf8'))?.[1];
assert.ok(publicKey && config.SUPABASE_SERVICE_ROLE_KEY);
const fixtures=[];
const runId=randomUUID();
const journal=`.qa/tenant-${runId}.json`;
mkdirSync('.qa',{recursive:true});
const save=()=>writeFileSync(journal,JSON.stringify(fixtures.map(({userId,lotId})=>({userId,lotId})),null,2));
async function request(path,{method='GET',body,token,admin=false}={}) {
  const key=admin?config.SUPABASE_SERVICE_ROLE_KEY:publicKey;
  const res=await fetch(base+path,{method,headers:{apikey:key,Authorization:`Bearer ${token||key}`,'Content-Type':'application/json','User-Agent':'VeloDrive-QA/1.0',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=null;}
  return {status:res.status,ok:res.ok,data};
}
async function insert(table,body) {
  const res=await request(`/rest/v1/${table}`,{method:'POST',body,admin:true});
  assert.ok(res.ok,`Fixture ${table}: HTTP ${res.status}, ${res.data?.code||'unknown'}`);
  return res.data[0];
}
async function createFixture(index) {
  const email=`velodrive-qa-${runId}-${index}@example.com`;
  const password=randomUUID()+randomUUID();
  const result=await request('/auth/v1/admin/users',{method:'POST',admin:true,body:{email,password,email_confirm:true}});
  assert.ok(result.ok,`Crear identidad QA: HTTP ${result.status}`);
  const item={userId:result.data.id,lotId:randomUUID()};fixtures.push(item);save();
  await insert('lotes',{id:item.lotId,profile_id:item.userId,nombre:`QA aislamiento ${runId}`,plan_status:'inactive'});
  const login=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  assert.ok(login.data?.access_token,`Sesión QA: HTTP ${login.status}`); item.token=login.data.access_token;
  item.car=await insert('cars',{lote_id:item.lotId,brand:'QA',model:'Aislamiento',year:2026,price:1,purchase_cost:0,status:'Disponible'});
  await insert('leads',{lote_id:item.lotId,phone_number:`900000000${index}`});
  await insert('chat_history',{lote_id:item.lotId,phone_number:`900000000${index}`,role:'user',content:'Fixture QA sin datos personales'});
  await insert('chat_handoffs',{lote_id:item.lotId,phone_number:`900000000${index}`,manual_until:new Date().toISOString()});
  await insert('car_expenses',{lote_id:item.lotId,car_id:item.car.id,category:'otro',amount:1});
  await insert('citas',{lote_id:item.lotId,nombre_cliente:'QA aislamiento',telefono:`900000000${index}`,estado_lead:'Cancelada',recordatorio_enviado:true});
  item.documentPath=`${item.lotId}/qa-${runId}.txt`;
  const upload=await fetch(`${base}/storage/v1/object/documentos-leads/${item.documentPath}`,{method:'POST',headers:{apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'text/plain','User-Agent':'VeloDrive-QA/1.0'},body:'Fixture QA sin datos personales',signal:AbortSignal.timeout(15000)});
  assert.ok(upload.ok,`Fixture Storage: HTTP ${upload.status}`);
  await insert('whatsapp_channels',{lote_id:item.lotId,instance_name:`qa_${item.lotId}`,api_key:'fixture-not-a-real-key',phone_number:`900000000${index}`});
  return item;
}
let failures=0;
async function check(name,fn){try{await fn();console.log('PASS:',name);}catch(e){failures++;console.error('FAIL:',name,'—',e.message);}}
try {
  const a=await createFixture(1), b=await createFixture(2);
  for(const [owner,other] of [[a,b],[b,a]]) {
    for(const table of ['cars','leads','chat_history','chat_handoffs','car_expenses','citas']) {
      await check(`${table}: propietario lee; intruso no lee ni modifica`,async()=>{
        const own=await request(`/rest/v1/${table}?lote_id=eq.${owner.lotId}&select=*`,{token:owner.token});assert.equal(own.status,200);assert.ok(own.data.length>0);
        const foreign=await request(`/rest/v1/${table}?lote_id=eq.${other.lotId}&select=*`,{token:owner.token});assert.equal(foreign.status,200);assert.deepEqual(foreign.data,[]);
        const patch=await request(`/rest/v1/${table}?lote_id=eq.${other.lotId}`,{method:'PATCH',body:{lote_id:owner.lotId},token:owner.token});assert.ok(patch.status===403||(patch.status===200&&patch.data.length===0));
        const deletion=await request(`/rest/v1/${table}?lote_id=eq.${other.lotId}`,{method:'DELETE',token:owner.token});assert.ok(deletion.status===403||(deletion.status===200&&deletion.data.length===0));
      });
    }
    await check('documentos privados: solo el propietario genera enlaces de su carpeta',async()=>{
      const own=await request(`/storage/v1/object/sign/documentos-leads/${owner.documentPath}`,{method:'POST',body:{expiresIn:60},token:owner.token});assert.equal(own.status,200);
      const foreign=await request(`/storage/v1/object/sign/documentos-leads/${other.documentPath}`,{method:'POST',body:{expiresIn:60},token:owner.token});assert.ok([400,403,404].includes(foreign.status));
      const anon=await fetch(`${base}/storage/v1/object/public/documentos-leads/${owner.documentPath}`,{signal:AbortSignal.timeout(10000)});assert.ok([400,403,404].includes(anon.status));
    });
    await check('un usuario no inserta autos en otro lote',async()=>{
      const r=await request('/rest/v1/cars',{method:'POST',body:{lote_id:other.lotId,brand:'QA',model:'Intruso',year:2026,price:1,status:'Disponible'},token:owner.token});assert.equal(r.status,403);
    });
  }
  await check('el propietario puede editar nombre sin activar su plan',async()=>{
    const r=await request(`/rest/v1/lotes?id=eq.${a.lotId}`,{method:'PATCH',body:{nombre:'QA nombre editado'},token:a.token});assert.equal(r.status,200);assert.equal(r.data[0].plan_status,'inactive');
  });
  for(const [column,value] of [['plan_status','active'],['es_cuenta_interna',true],['webhook_token',randomUUID()],['profile_id',b.userId]]) {
    await check(`el navegador no modifica ${column}`,async()=>{
      const r=await request(`/rest/v1/lotes?id=eq.${a.lotId}`,{method:'PATCH',body:{[column]:value},token:a.token});assert.equal(r.status,403);
    });
  }
  await check('el navegador no lee api_key ni modifica instancias',async()=>{
    const read=await request(`/rest/v1/whatsapp_channels?lote_id=eq.${b.lotId}&select=api_key`,{token:b.token});assert.equal(read.status,403);
    const patch=await request(`/rest/v1/whatsapp_channels?lote_id=eq.${b.lotId}`,{method:'PATCH',body:{instance_name:'qa_unauthorized'},token:b.token});assert.equal(patch.status,403);
    const safe=await request(`/rest/v1/whatsapp_channels?lote_id=eq.${b.lotId}&select=instance_name,phone_number`,{token:b.token});assert.equal(safe.status,200);assert.equal(safe.data.length,1);
  });
} finally {
  let cleanupFailed=false;
  for(const f of fixtures) {
    if(f.documentPath){const storage=await request('/storage/v1/object/documentos-leads',{method:'DELETE',body:{prefixes:[f.documentPath]},admin:true});if(!storage.ok)cleanupFailed=true;}
    for(const table of ['car_expenses','chat_handoffs','chat_history','citas','leads','cars','whatsapp_channels']) {
      const r=await request(`/rest/v1/${table}?lote_id=eq.${f.lotId}`,{method:'DELETE',admin:true});if(!r.ok)cleanupFailed=true;
    }
    const lot=await request(`/rest/v1/lotes?id=eq.${f.lotId}`,{method:'DELETE',admin:true});if(!lot.ok)cleanupFailed=true;
    const user=await request(`/auth/v1/admin/users/${f.userId}`,{method:'DELETE',admin:true});if(!user.ok)cleanupFailed=true;
  }
  if(cleanupFailed){console.error('Limpieza incompleta: conservar journal local para recuperar los IDs de fixtures.');failures++;}
  else {unlinkSync(journal);console.log('PASS: fixtures eliminados; lote QA original intacto');}
}
if(failures)process.exitCode=1;
