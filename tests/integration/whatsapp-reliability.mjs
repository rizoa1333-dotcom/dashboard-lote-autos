import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
if(!process.argv.includes('--live-qa'))throw new Error('Requiere --live-qa; solo prueba RPC, nunca envía WhatsApp.');
const cfg=Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).filter(x=>/^[A-Z_0-9]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const base=new URL(cfg.SUPABASE_URL).origin;
const headers={apikey:cfg.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json','User-Agent':'VeloDrive-QA/1.0'};
const id='QA_'+randomUUID().replaceAll('-','');
const instance='instancia_38fc2094-ce52-4e6a-9c42-69db7725d65f';
async function rpc(name,body){const r=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:r.status,data:await r.json().catch(()=>null)};}
const key={p_instance:instance,p_message_id:id};
try {
  const claims=await Promise.all(Array.from({length:8},(_,i)=>rpc('claim_whatsapp_event',{...key,p_phone:'9000000001',p_execution_id:`${id}_${i}`})));
  assert.ok(claims.every(x=>x.status===200),'RPC claim debe existir y responder 200');
  assert.equal(claims.filter(x=>x.data.acquired===true).length,1,'solo una ejecución puede reclamar');
  const winner=claims.findIndex(x=>x.data.acquired===true);
  const execution=`${id}_${winner}`;
  const sends=await Promise.all(Array.from({length:8},()=>rpc('begin_whatsapp_send',{...key,p_execution_id:execution})));
  assert.equal(sends.filter(x=>x.data?.send===true).length,1,'solo se autoriza un intento de envío');
  const wrong=await rpc('finish_whatsapp_event',{...key,p_execution_id:'wrong-execution',p_state:'accepted',p_outbound_id:'QAOUT'});
  assert.equal(wrong.data.updated,false,'otra ejecución no puede confirmar el envío');
  const accepted=await rpc('finish_whatsapp_event',{...key,p_execution_id:execution,p_state:'accepted',p_outbound_id:id+'_OUT'});
  assert.equal(accepted.data.updated,true);
  const done=await rpc('finish_whatsapp_event',{...key,p_execution_id:execution,p_state:'completed'});assert.equal(done.data.updated,true);
  const repeat=await rpc('claim_whatsapp_event',{...key,p_phone:'9000000001',p_execution_id:id+'_retry'});assert.equal(repeat.data.acquired,false);
  const echo=await rpc('claim_whatsapp_event',{p_instance:instance,p_message_id:id+'_OUT',p_phone:'9000000001',p_execution_id:id+'_echo'});
  assert.equal(echo.data.acquired,false,'el eco del mensaje saliente no inicia otra conversación');
  assert.equal(echo.data.state,'ignored');
  for(const state of ['processing','sending']) {
    const failureKey={p_instance:instance,p_message_id:id+'_'+state};
    const failureExecution=id+'_'+state;
    await rpc('claim_whatsapp_event',{...failureKey,p_phone:'9000000001',p_execution_id:failureExecution});
    if(state==='sending')await rpc('begin_whatsapp_send',{...failureKey,p_execution_id:failureExecution});
    const fail=await rpc('record_whatsapp_failure',{p_execution_id:failureExecution,p_workflow_id:'qa',p_node_name:'qa_failure',p_code:'DEPENDENCY_TIMEOUT'});
    assert.equal(fail.status,200);
    const retry=await rpc('claim_whatsapp_event',{...failureKey,p_phone:'9000000001',p_execution_id:id+'_retry'});
    assert.equal(retry.data.acquired,false,'un fallo nunca se reenvía automáticamente');
    assert.equal(retry.data.state,state==='sending'?'uncertain':'failed');
    const resend=await rpc('begin_whatsapp_send',{...failureKey,p_execution_id:failureExecution});
    assert.equal(resend.data.send,false);
    await rpc('record_whatsapp_failure',{p_execution_id:failureExecution,p_workflow_id:'qa',p_node_name:'qa_failure',p_code:'DEPENDENCY_TIMEOUT'});
  }
  const unmapped=await rpc('claim_whatsapp_event',{p_instance:'qa_unmapped',p_message_id:id,p_phone:'9000000001',p_execution_id:id});assert.equal(unmapped.status,400);
  const publicKey=/const SUPABASE_ANON_KEY = '([^']+)'/.exec(readFileSync('dashboard.js','utf8'))[1];
  const anon=await fetch(`${base}/rest/v1/rpc/claim_whatsapp_event`,{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({...key,p_phone:'9000000001',p_execution_id:id})});
  assert.ok([401,403,404].includes(anon.status),'anon no puede ejecutar RPC del servidor');
  console.log('PASS: 8 reclamaciones concurrentes -> 1 propietario; 8 autorizaciones -> 1 envío; repetición, fencing y permisos correctos.');
} finally {
  for(const suffix of ['', '_processing', '_sending']) {
    const r=await fetch(`${base}/rest/v1/whatsapp_inbox?instance_name=eq.${instance}&message_id=eq.${id+suffix}`,{method:'DELETE',headers});
    if(!r.ok&&r.status!==404){console.error('No se confirmó limpieza del ID QA:',id+suffix);process.exitCode=1;}
  }
  for(const suffix of ['_processing','_sending']) {
    const r=await fetch(`${base}/rest/v1/operational_incidents?execution_id=eq.${id+suffix}`,{method:'DELETE',headers});
    if(!r.ok&&r.status!==404){console.error('No se confirmó limpieza del incidente QA:',id+suffix);process.exitCode=1;}
  }
}
