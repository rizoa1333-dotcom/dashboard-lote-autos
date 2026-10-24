const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { deriveChannelToken, verifyEvolutionWebhook, verifyCitaWebhook, normalizeCitaId } = require('../webhook-security');
const file = path.join(__dirname, '../VeloDrive-n8n-intervencion-automatica.json');
const w = JSON.parse(fs.readFileSync(file, 'utf8'));
const node = name => { const n = w.nodes.find(n => n.name === name); if (!n) throw new Error('Missing node: ' + name); return n; };
const edge = name => ({ node: name, type: 'main', index: 0 });
const connect = (name, ...outputs) => { w.connections[name] = { main: outputs.map(list => list.map(edge)) }; };
function put(name, type, parameters, position = [39000, 18000]) {
  let existing = w.nodes.find(n => n.name === name);
  const value = { id: existing?.id || randomUUID(), name, type, typeVersion: type === 'n8n-nodes-base.httpRequest' ? 4.2 : type === 'n8n-nodes-base.if' ? 2.2 : 2, position, parameters };
  if (existing) Object.assign(existing, value); else w.nodes.push(value);
  return node(name);
}
function condition(name, expression, position) {
  return put(name, 'n8n-nodes-base.if', { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 },
    conditions: [{ id: w.nodes.find(n => n.name === name)?.parameters.conditions?.conditions?.[0]?.id || randomUUID(),
      leftValue: expression, rightValue: true, operator: { type: 'boolean', operation: 'true' } }], combinator: 'and' }, options: {} }, position);
}
const headers = { parameters: [{ name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
  { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }] };
const base = 'https://deljncdcddfghfihuumd.supabase.co/rest/v1/';

for (const name of ['Stripe Trigger1','Es Activación Inicial1','Activar Lote Inicial1','Es Renovación1','Renovar Suscripción1',
  'Es Cancelación1','Cancelar Suscripción1','Parsear Evento Stripe','Responder OK1']) {
  node(name).disabled = true;
  delete w.connections[name];
}
for (const name of ['consultar_inventario_autos1', 'buscar_inventario_autos1']) node(name).parameters.tableId = 'agent_inventory';
for (const number of [7, 8, 9, 10]) {
  const n = node('Verificar Token de Tenant' + number);
  n.parameters.url = n.parameters.url.replace(/&plan_status=eq\.active/g, '') + '&plan_status=eq.active';
}
for (const name of ['Buscar Citas Próximas', 'Buscar Leads Sin Agendar']) {
  const n = node(name);
  n.parameters.url = n.parameters.url.replace(/select=\*(?!,)/, 'select=*,lotes!inner(plan_status)')
    .replace(/&lotes\.plan_status=eq\.active/g, '') + '&lotes.plan_status=eq.active';
}

put('Validar origen Evolution', 'n8n-nodes-base.code', { jsCode: deriveChannelToken.toString() + '\n' + verifyEvolutionWebhook.toString()
  + '\nreturn [{json:{...$json,valid_webhook:verifyEvolutionWebhook($json,$env.EVOLUTION_WEBHOOK_ROOT_SECRET)}}];' }, [34500, 18000]);
condition('Secret Evolution Válido1', '={{ $json.valid_webhook === true }}', node('Secret Evolution Válido1').position);
connect('Webhook WhatsApp1', ['Validar origen Evolution']);
connect('Validar origen Evolution', ['Secret Evolution Válido1']);

put('Verificar plan del canal', 'n8n-nodes-base.httpRequest', {
  url: "=" + base + "lotes?id=eq.{{ $('Get many rows1').first().json.lote_id }}&plan_status=eq.active&select=id",
  sendHeaders: true, headerParameters: headers, options: { timeout: 15000 }
}, [35200, 18100]).alwaysOutputData = true;
condition('¿Plan del canal activo?', "={{ $json.id === $('Get many rows1').first().json.lote_id }}", [35400, 18100]);
connect('Canal Configurado?1', ['Verificar plan del canal'], ['Responder evento ignorado']);
connect('Verificar plan del canal', ['¿Plan del canal activo?']);
connect('¿Plan del canal activo?', ['Reclamar mensaje durable'], ['Responder evento ignorado']);

const qr = node('Preparar conexión QR');
if (!qr.parameters.jsCode.includes('const webhookToken=')) {
  qr.parameters.jsCode = deriveChannelToken.toString() + '\n' + qr.parameters.jsCode.replace(
    'return [{json:{loteId:', "const webhookToken=deriveChannelToken(channel.instance_name||('instancia_'+auth.loteId),$env.EVOLUTION_WEBHOOK_ROOT_SECRET);\nreturn [{json:{webhookToken,loteId:");
}
qr.parameters.jsCode = qr.parameters.jsCode.replaceAll("require('node:crypto')", "require('crypto')");
node('Configurar webhook WhatsApp').parameters.jsonBody = "={{ JSON.stringify({webhook:{enabled:true,url:'https://n8n-production-97a4.up.railway.app/webhook/whatsapp-lotes',headers:{'x-velodrive-channel':$('Preparar conexión QR').first().json.webhookToken},events:['MESSAGES_UPSERT'],byEvents:false,base64:true,webhookByEvents:false,webhookBase64:true} }) }}";
node('Comprobar webhook WhatsApp').parameters.jsCode = "const b=$json.body?.webhook||$json.body||{};\nconst token=$('Preparar conexión QR').first().json.webhookToken;\nconst valid=Number($json.statusCode)>=200&&Number($json.statusCode)<300&&typeof token==='string'&&token.length===64&&b.enabled===true&&b.url==='https://n8n-production-97a4.up.railway.app/webhook/whatsapp-lotes'&&b.headers?.['x-velodrive-channel']===token&&Array.isArray(b.events)&&b.events.includes('MESSAGES_UPSERT');\nreturn [{json:{valid,httpStatus:502,error:'No se pudo preparar la recepción de mensajes. Intenta de nuevo.'}}];";

put('Validar origen Cita', 'n8n-nodes-base.code', { jsCode: verifyCitaWebhook.toString()
  + '\nreturn [{json:{...$json,valid_webhook:verifyCitaWebhook($json,$env.CITA_WEBHOOK_SECRET)}}];' }, [35000, 21000]);
condition('Secret Cita Válido', '={{ $json.valid_webhook === true }}', node('Secret Cita Válido').position);
connect('Webhook Nueva Cita', ['Validar origen Cita']);
connect('Validar origen Cita', ['Secret Cita Válido']);
put('Validar ID de cita', 'n8n-nodes-base.code', { jsCode: normalizeCitaId.toString()
  + '\nreturn [{json:{cita_id:normalizeCitaId($json)}}];' }, [35400, 21000]);
put('Consultar cita real', 'n8n-nodes-base.httpRequest', { url: '=' + base + "citas?id=eq.{{ $json.cita_id }}&select=id&limit=1",
  sendHeaders: true, headerParameters: headers, options: { timeout: 15000 } }, [35600, 21000]).alwaysOutputData = true;
put('Reclamar notificación de cita', 'n8n-nodes-base.httpRequest', { method: 'POST', url: base + 'rpc/claim_cita_security_notification',
  sendHeaders: true, headerParameters: headers, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({p_cita_id:$('Validar ID de cita').first().json.cita_id,p_execution_id:String($execution.id)}) }}", options: { timeout: 15000 } }, [35800, 21000]);
condition('¿Notificación de cita adquirida?', '={{ $json.acquired === true }}', [36000, 21000]);
put('Cita verificada', 'n8n-nodes-base.code', { jsCode: normalizeCitaId.toString() + "\nconst record=$json.record;\nif(!record||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.lote_id||''))throw new Error('INVALID_VERIFIED_CITA');\nconst id=normalizeCitaId({body:{cita_id:record.id}});\nreturn [{json:{body:{record:{...record,id}}}}];" }, [36200, 21000]);
connect('Secret Cita Válido', ['Validar ID de cita'], ['Responder 401 Cita']);
connect('Validar ID de cita', ['Consultar cita real']);
connect('Consultar cita real', ['Reclamar notificación de cita']);
connect('Reclamar notificación de cita', ['¿Notificación de cita adquirida?']);
connect('¿Notificación de cita adquirida?', ['Cita verificada'], ['Responder OK Cita']);
connect('Cita verificada', ['Buscar Instancia para Nueva Cita']);
for (const name of ['Buscar Instancia para Nueva Cita','Buscar Datos Lote para Cita','Preparar Notificación']) {
  node(name).parameters = JSON.parse(JSON.stringify(node(name).parameters).replaceAll("$('Webhook Nueva Cita')", "$('Cita verificada')"));
}
const notification = node('Preparar Notificación');
notification.parameters.jsCode = notification.parameters.jsCode
  .replace("const loteRow = ($('Buscar Instancia para Nueva Cita').item.json && $('Buscar Instancia para Nueva Cita').item.json[0]) || {};",
    "const channelResult=$('Buscar Instancia para Nueva Cita').first().json;\nconst loteRow=(Array.isArray(channelResult)?channelResult[0]:channelResult)||{};")
  .replace("const datosLote = ($('Buscar Datos Lote para Cita').item.json && $('Buscar Datos Lote para Cita').item.json[0]) || {};",
    "const lotResult=$('Buscar Datos Lote para Cita').first().json;\nconst datosLote=(Array.isArray(lotResult)?lotResult[0]:lotResult)||{};");
put('Confirmar notificación de cita', 'n8n-nodes-base.httpRequest', { method: 'POST', url: base + 'rpc/finish_cita_security_notification',
  sendHeaders: true, headerParameters: headers, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({p_cita_id:$('Validar ID de cita').first().json.cita_id,p_execution_id:String($execution.id),p_outbound_id:$('Enviar Notificación Nueva Cita').first().json.key.id}) }}", options: { timeout: 15000 } }, [37000, 21000]);
connect('Enviar Notificación Nueva Cita', ['Confirmar notificación de cita']);
connect('Confirmar notificación de cita', ['Responder OK Cita']);

// Mantener los incidentes estructurados; no conservar documentos/tokens en ejecuciones completas.
w.settings = { ...w.settings, saveDataErrorExecution: 'none', saveDataSuccessExecution: 'none', saveManualExecutions: false, saveExecutionProgress: false };
// Evolution 2.3.7 rejects requests with no Origin when its CORS allowlist is restricted.
const evolutionOrigin='https://evolution-api-production-3652.up.railway.app';
for(const item of w.nodes){
  if(item.type!=='n8n-nodes-base.httpRequest'
    || !String(item.parameters.url||'').replace(/^=/,'').startsWith(evolutionOrigin+'/'))continue;
  const existing=item.parameters.headerParameters?.parameters||[];
  item.parameters.sendHeaders=true;
  item.parameters.headerParameters={parameters:[...existing.filter(h=>h.name.toLowerCase()!=='origin'),{name:'Origin',value:evolutionOrigin}]};
}
fs.writeFileSync(file, JSON.stringify(w, null, 2) + '\n');
