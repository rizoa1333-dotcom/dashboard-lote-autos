const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEvolutionEvent, normalizeClaimResult, sanitizeIncident } = require('../../whatsapp-reliability');
const workflow = require('../../VeloDrive-n8n-intervencion-automatica.json');

function reachable(start,target,skip) {
  const seen=new Set();const queue=[start];
  while(queue.length){const n=queue.pop();if(n===skip||seen.has(n))continue;if(n===target)return true;seen.add(n);
    for(const edges of Object.values(workflow.connections[n]||{}))for(const output of edges)for(const e of output)queue.push(e.node);
  }return false;
}
test('ningún ACK exitoso de un mensaje válido ocurre antes de persistir su reclamación',()=>{
  assert.equal(reachable('Canal Configurado?1','Responder OK Inmediato'),true);
  assert.equal(reachable('Canal Configurado?1','Responder OK Inmediato','Reclamar mensaje durable'),false);
});
test('ninguna respuesta normal o de contingencia evita la autorización atómica de envío',()=>{
  assert.equal(reachable('Upsert Lead','Enviar Respuesta WhatsApp1'),true);
  assert.equal(reachable('Upsert Lead','Enviar Respuesta WhatsApp1','Autorizar envío único'),false);
  assert.equal(reachable('AI Agent Vendedor1','responder error IA1','Autorizar contingencia única'),false);
});
test('el canal se busca por igualdad exacta, sin comodines',()=>{
  const condition=workflow.nodes.find(n=>n.name==='Get many rows1').parameters.filters.conditions[0];
  assert.equal(condition.condition,'eq');
});

const payload = () => ({event:'messages.upsert',instance:'instancia_lot-a',data:{key:{id:'ABC123',fromMe:false,remoteJid:'5213121234567@s.whatsapp.net'},message:{conversation:'Hola'}}});

test('prepara una reclamación durable con instancia exacta, ID y ejecución', () => {
  assert.deepEqual(normalizeEvolutionEvent(payload(),'exec-1'), {valid:true,instance:'instancia_lot-a',message_id:'ABC123',phone_number:'3121234567',execution_id:'exec-1',from_me:false});
});
test('rechaza comodines, ausencia de ID, grupos y fromMe mal tipado antes de consultar datos', () => {
  for (const mutate of [p=>p.instance='%',p=>p.instance='lote_*',p=>delete p.data.key.id,p=>p.data.key.fromMe='false',p=>p.data.key.remoteJid='123@g.us']) {
    const p=payload(); mutate(p); assert.equal(normalizeEvolutionEvent(p,'exec-1').valid,false);
  }
});
test('un evento ajeno a mensajes no se procesa', () => {
  assert.equal(normalizeEvolutionEvent({...payload(),event:'connection.update'},'exec-1').valid,false);
});
test('un resultado vacío o ambiguo de reclamación nunca autoriza al agente', () => {
  for(const value of [null,{},[],{acquired:'true'},{acquired:true}]) assert.equal(normalizeClaimResult(value).process,false);
  assert.equal(normalizeClaimResult({acquired:false,lote_id:'lot-a',state:'processing'}).process,false);
  assert.equal(normalizeClaimResult({acquired:true,lote_id:'lot-a',state:'processing'}).process,true);
});
test('las alertas conservan referencias y eliminan payload, tokens y mensaje de error original', () => {
  const result=sanitizeIncident({workflow:{id:'wf-1',name:'VeloDrive'},execution:{id:'123',error:{lastNodeExecuted:'Get many rows1',message:'Credentials could not be decrypted Bearer SECRET',stack:'secret-stack'},data:{customer:'private'}}});
  assert.deepEqual(result,{execution_id:'123',workflow_id:'wf-1',node_name:'Get many rows1',code:'CREDENTIALS_UNAVAILABLE'});
  assert.equal(JSON.stringify(result).includes('SECRET'),false);
});

test('un fallo de activación sin execution.id conserva una referencia del manejador y no pierde la alerta',()=>{
  const result=sanitizeIncident({workflow:{id:'wf-1'},trigger:{error:{message:'Connection timeout SECRET',node:{name:'Webhook WhatsApp1'}}}},'handler-7');
  assert.deepEqual(result,{execution_id:'trigger_handler-7',workflow_id:'wf-1',node_name:'Webhook WhatsApp1',code:'DEPENDENCY_TIMEOUT'});
  assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
