import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {buildPersistentContext} from '../../persistent-memory.js';
if(!process.argv.includes('--live-qa'))throw new Error('Requiere --live-qa; crea únicamente fixtures efímeros.');
const cfg=Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).filter(s=>/^[A-Z_0-9]+=/.test(s)).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const base=new URL(cfg.SUPABASE_URL).origin;
const anon=/const SUPABASE_ANON_KEY = '([^']+)'/.exec(readFileSync('dashboard.js','utf8'))?.[1];
assert.ok(cfg.SUPABASE_SERVICE_ROLE_KEY&&anon);
const fixtures=[],run=randomUUID(),journal=`.qa/memory-${run}.json`;
mkdirSync('.qa',{recursive:true});
async function request(path,method='POST',body,admin=true){
 const key=admin?cfg.SUPABASE_SERVICE_ROLE_KEY:anon;
 const r=await fetch(base+path,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json','User-Agent':'VeloDrive-QA/1.0',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=null;}
 return{ok:r.ok,status:r.status,data};
}
async function fixture(){
 const u=await request('/auth/v1/admin/users','POST',{email:`qa-memory-${randomUUID()}@example.com`,password:randomUUID()+randomUUID(),email_confirm:true});assert.ok(u.ok,`Auth fixture HTTP ${u.status}`);
 const f={userId:u.data.id,lotId:randomUUID()};fixtures.push(f);writeFileSync(journal,JSON.stringify(fixtures));
 const l=await request('/rest/v1/lotes','POST',{id:f.lotId,profile_id:f.userId,nombre:`QA memoria ${run}`,plan_status:'inactive'});assert.ok(l.ok,`Lot fixture HTTP ${l.status}`);return f;
}
const body=(lot,phone,id,role='user',content=id)=>({p_lote_id:lot,p_phone_number:phone,p_provider_message_id:id,p_role:role,p_content:content,p_source:role==='model'?'agent':'customer'});
async function append(...args){const r=await request('/rest/v1/rpc/append_conversation_message','POST',body(...args));assert.ok(r.ok,`Append HTTP ${r.status}, ${r.data?.code||''}`);return r.data;}
const context=(lot,phone,id)=>request('/rest/v1/rpc/get_conversation_context','POST',{p_lote_id:lot,p_phone_number:phone,p_current_message_id:id,p_limit:24});
try{
 // Falla antes de crear fixtures si todavía no está aplicada la migración.
 const pre=await context(randomUUID(),'9000000001','missing');assert.notEqual(pre.status,404,'Migración RPC aún no aplicada');assert.equal(pre.data?.message,'CURRENT_MESSAGE_NOT_RECORDED');
 const a=await fixture(),b=await fixture(),phone='9000000001';
 await append(a.lotId,phone,'a1','user','Mi color es azul');await append(a.lotId,phone,'a2','model','Recordaré azul');
 await append(a.lotId,'9000000002','other-phone','user','Mi color es violeta');await append(b.lotId,phone,'other-lot','user','Mi color es rojo');
 const duplicates=await Promise.all(Array.from({length:8},()=>append(a.lotId,phone,'current')));assert.equal(duplicates.filter(r=>r.recorded).length,1);
 await append(a.lotId,phone,'future','model','Mensaje posterior');
 const r=await context(a.lotId,phone,'current');assert.ok(r.ok);assert.deepEqual(r.data.messages.map(x=>x.provider_message_id),['a1','a2']);
 const identity={lote_id:a.lotId,phone_number:phone,message_id:'current'};
 const first=buildPersistentContext(identity,r.data,{},'¿Qué color dije?');
 const reload=await context(a.lotId,phone,'current');assert.deepEqual(buildPersistentContext(identity,reload.data,{},'¿Qué color dije?'),first);
 assert.ok(first.prompt.includes('azul'));assert.ok(!first.prompt.includes('violeta'));assert.ok(!first.prompt.includes('rojo'));
 const wrong=await context(a.lotId,'9000000002','current');assert.equal(wrong.data?.message,'CURRENT_MESSAGE_NOT_RECORDED');
 await append(b.lotId,phone,'current');const other=await context(b.lotId,phone,'current');assert.deepEqual(other.data.messages.map(x=>x.provider_message_id),['other-lot']);
 const denied=await request('/rest/v1/rpc/get_conversation_context','POST',{p_lote_id:a.lotId,p_phone_number:phone,p_current_message_id:'current',p_limit:24},false);assert.equal(denied.status,401);
 const invalid=await request('/rest/v1/rpc/append_conversation_message','POST',body(a.lotId,'','bad'));assert.equal(invalid.data?.message,'INVALID_CONVERSATION_MESSAGE');
 const instance=`qa_memory_${run}`,eventId='atomic-reply',execution='qa-atomic';
 const event=await request('/rest/v1/whatsapp_inbox','POST',{instance_name:instance,message_id:eventId,lote_id:a.lotId,phone_number:phone,execution_id:execution,state:'sending'});assert.ok(event.ok);
 const acceptance={p_instance:instance,p_message_id:eventId,p_execution_id:execution,p_outbound_id:'OUT_QA',p_content:'Respuesta persistida atómicamente',p_source:'agent'};
 const rollback=await request('/rest/v1/rpc/accept_conversation_reply','POST',{...acceptance,p_content:''});assert.equal(rollback.data?.message,'INVALID_CONVERSATION_MESSAGE');
 const unchanged=await request(`/rest/v1/whatsapp_inbox?instance_name=eq.${instance}&select=state`,'GET');assert.equal(unchanged.data[0].state,'sending');
 const accepted=await request('/rest/v1/rpc/accept_conversation_reply','POST',acceptance);assert.equal(accepted.data?.updated,true);
 const retry=await request('/rest/v1/rpc/accept_conversation_reply','POST',acceptance);assert.equal(retry.data?.updated,true);
 const wrongOwner=await request('/rest/v1/rpc/accept_conversation_reply','POST',{...acceptance,p_execution_id:'wrong'});assert.equal(wrongOwner.data?.updated,false);
 const saved=await request(`/rest/v1/chat_history?lote_id=eq.${a.lotId}&provider_message_id=eq.${eventId}&select=content`,'GET');assert.equal(saved.data.length,1);assert.equal(saved.data[0].content,acceptance.p_content);
 console.log('PASS: respuesta y aceptación atómicas; rollback, reintento y ejecución propietaria');
 console.log('PASS: persistencia, aislamiento por lote/teléfono, orden temporal, 8 reintentos concurrentes, validación y RPC privado');
}finally{
 let failed=false;
 for(const f of fixtures){
  for(const path of [`/rest/v1/whatsapp_inbox?lote_id=eq.${f.lotId}`,`/rest/v1/chat_history?lote_id=eq.${f.lotId}`,`/rest/v1/lotes?id=eq.${f.lotId}`,`/auth/v1/admin/users/${f.userId}`]){const r=await request(path,'DELETE');if(!r.ok)failed=true;}
 }
 if(failed)throw new Error('Limpieza QA incompleta; IDs conservados en journal local.');
 if(fixtures.length){unlinkSync(journal);console.log('PASS: fixtures eliminados; conversaciones originales intactas');}
}
