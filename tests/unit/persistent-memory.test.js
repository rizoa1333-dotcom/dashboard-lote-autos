const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPersistentContext } = require('../../persistent-memory');
const lot = '38fc2094-ce52-4e6a-9c42-69db7725d65f';
const identity = { lote_id: lot, phone_number: '3121111111', message_id: 'CURRENT' };
const entry = (id, role, content, message = 'OLD') => ({ id: String(id), lote_id: lot, phone_number: identity.phone_number, role, content, provider_message_id: message, created_at: `2026-10-16T12:00:${String(id).padStart(2,'0')}Z` });
const snapshot = messages => ({ lote_id: lot, phone_number: identity.phone_number, messages });
test('recupera historial ordenado y excluye la entrada actual', () => {
  const result = buildPersistentContext(identity, snapshot([entry(3,'user','actual','CURRENT'),entry(2,'model','Mucho gusto'),entry(1,'user','Soy Bruno')]), {}, 'actual');
  assert.deepEqual(result.history.map(row => row.content), ['Soy Bruno','Mucho gusto']);
  assert.equal(result.message_count, 2);
  assert.equal((result.prompt.match(/actual/g)||[]).length, 1);
});
test('una instancia nueva recupera exactamente el mismo contexto sin cache de proceso', () => {
  const data = snapshot([entry(1,'user','Busco un auto azul')]);
  const first = buildPersistentContext(identity, data, {}, '¿Qué color pedí?');
  delete require.cache[require.resolve('../../persistent-memory')];
  const restored = require('../../persistent-memory').buildPersistentContext(identity, JSON.parse(JSON.stringify(data)), {}, '¿Qué color pedí?');
  assert.equal(restored.prompt, first.prompt);
  assert.match(restored.prompt, /azul/);
});
test('rechaza snapshot, filas o lead de otro lote o teléfono', () => {
  for (const data of [null, {error:'offline'}, {...snapshot([]),phone_number:'3122222222'}, snapshot([{...entry(1,'user','Ajeno'),lote_id:'00000000-0000-4000-8000-000000000001'}])]) {
    assert.throws(() => buildPersistentContext(identity,data,{},'Hola'));
  }
  assert.throws(() => buildPersistentContext(identity,snapshot([]),{lote_id:lot,phone_number:'3122222222',nombre:'Ajeno'},'Hola'));
});
test('el contexto incorpora cita y estado documental desde el lead confirmado', () => {
  const lead = { lote_id:lot, phone_number:identity.phone_number, nombre:'Bruno',fecha_cita:'2026-10-17 17:00:00',encuesta_step:4,status:'Documentación Completa' };
  const result=buildPersistentContext(identity,snapshot([]),lead,'¿Cuándo es mi cita?');
  assert.match(result.prompt,/2026-10-17 17:00:00/);
  assert.match(result.prompt,/Documentación Completa/);
});
test('limita mensajes y caracteres y elimina bloques internos y URLs privadas', () => {
  const rows=Array.from({length:40},(_,i)=>({...entry(1,'model','x'.repeat(5000)),id:String(i+1),created_at:new Date(Date.UTC(2026,9,16,12,i)).toISOString()}));
  const result=buildPersistentContext(identity,snapshot(rows),{},'y'.repeat(10000));
  assert.ok(result.prompt.length <= 26000);
  assert.ok(result.history.length<=24);
  const clean=buildPersistentContext(identity,snapshot([entry(1,'model','Hola <<<DATOS_INTERNOS>>> SECRETO'),entry(2,'user','https://x.supabase.co/storage/v1/object/sign/documentos-leads/a?token=SECRETO')]),{},'Hola');
  assert.doesNotMatch(clean.prompt,/SECRETO|DATOS_INTERNOS|token=/);
});
test('el agente no depende de una conexión de memoria volátil y consulta el RPC persistente', () => {
  const workflow=require('../../VeloDrive-n8n-intervencion-automatica.json');
  assert.equal(workflow.connections['Simple Memory1']?.ai_memory,undefined);
  assert.match(workflow.nodes.find(n=>n.name==='Recuperar Historial1').parameters.url,/get_conversation_context$/);
  assert.match(workflow.nodes.find(n=>n.name==='AI Agent Vendedor1').parameters.text,/Preparar contexto persistente/);
});

test('aceptar una respuesta persiste su memoria mediante el mismo RPC atómico',()=>{
 const w=require('../../VeloDrive-n8n-intervencion-automatica.json');
 for(const name of ['Confirmar envío aceptado','Confirmar respuesta documental','Confirmar contingencia aceptada']){const p=w.nodes.find(n=>n.name===name).parameters;assert.match(p.url,/accept_conversation_reply$/);assert.match(p.jsonBody,/p_content/);}
});
