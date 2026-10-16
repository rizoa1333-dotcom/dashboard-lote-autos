import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
if(!process.argv.includes('--live-qa'))throw new Error('Requiere --live-qa. Simula un eco saliente, no envía mensajes.');
const cfg=Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).filter(x=>/^[A-Z_0-9]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const base=new URL(cfg.SUPABASE_URL).origin;
const headers={apikey:cfg.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,'User-Agent':'VeloDrive-QA/1.0'};
const id='QA_'+randomUUID().replaceAll('-','');
const instance='instancia_38fc2094-ce52-4e6a-9c42-69db7725d65f';
const target=new URL('https://n8n-production-97a4.up.railway.app/webhook/whatsapp-lotes');target.searchParams.set('secret',cfg.WEBHOOK_SECRET);
const payload={event:'messages.upsert',instance,data:{key:{id,fromMe:true,remoteJid:'523122007536@s.whatsapp.net'},source:'unknown',message:{conversation:'QA eco saliente sin envío real'}}};
const rowUrl=base+`/rest/v1/whatsapp_inbox?instance_name=eq.${instance}&message_id=eq.${id}`;
try {
  const deliveries=await Promise.all(Array.from({length:5},()=>fetch(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)})));
  assert.ok(deliveries.every(r=>r.ok),'todas las entregas deben recibir ACK');
  let row;
  for(let attempt=0;attempt<15;attempt++) {
    const result=await fetch(rowUrl+'&select=message_id,state,outbound_id',{headers,signal:AbortSignal.timeout(10000)});
    assert.equal(result.status,200);const rows=await result.json();assert.equal(rows.length,1,'un único registro durable');row=rows[0];
    if(row.state==='completed')break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.equal(row.state,'completed','el flujo real debe terminar el eco sin IA ni envío');
  assert.equal(row.outbound_id,null);
  console.log('PASS: webhook publicado recibe 5 duplicados, conserva 1 evento y termina sin enviar WhatsApp.');
} finally {
  const clean=await fetch(rowUrl,{method:'DELETE',headers});if(!clean.ok){console.error('No se confirmó limpieza del evento QA:',id);process.exitCode=1;}
}
