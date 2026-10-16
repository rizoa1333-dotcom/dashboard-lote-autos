import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
if (!process.argv.includes('--live-qa')) throw new Error('Requiere --live-qa. No envía correos.');
const cfg = Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).filter(x=>/^[A-Z_0-9]+=/.test(x)).map(x=>{const i=x.indexOf('='); return [x.slice(0,i),x.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const base = new URL(cfg.SUPABASE_URL).origin;
const headers = {apikey:cfg.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json','User-Agent':'VeloDrive-QA/1.0'};
const id = 'QA_'+randomUUID().replaceAll('-','');
async function rpc(name, body) {
  const r=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  assert.equal(r.status,200,`RPC ${name} debe responder 200`);
  return r.json();
}
try {
  await rpc('record_whatsapp_failure',{p_execution_id:id,p_workflow_id:'qa',p_node_name:'qa',p_code:'WORKFLOW_FAILED'});
  // Reclamar por ID evita que la prueba se apropie de incidentes reales pendientes.
  const claims=await Promise.all(Array.from({length:8},(_,i)=>rpc('claim_incident_notification',{p_incident_id:id,p_sender_id:id+'_'+i})));
  assert.equal(claims.filter(x=>x.acquired).length,1);
  const winner=claims.findIndex(x=>x.acquired);
  const wrong=await rpc('finish_incident_notification',{p_incident_id:id,p_sender_id:'wrong',p_sent:true});
  assert.equal(wrong.updated,false);
  const finish=await rpc('finish_incident_notification',{p_incident_id:id,p_sender_id:id+'_'+winner,p_sent:true});
  assert.equal(finish.updated,true);
  const repeat=await rpc('claim_incident_notification',{p_incident_id:id,p_sender_id:id+'_retry'});
  assert.equal(repeat.acquired,false);
  console.log('PASS: 8 reclamaciones de alerta -> 1 emisor; fencing y cierre idempotente.');
} finally {
  const r=await fetch(`${base}/rest/v1/operational_incidents?execution_id=eq.${id}`,{method:'DELETE',headers});
  if(!r.ok) {console.error('No se confirmó limpieza del incidente QA:',id);process.exitCode=1;}
}
