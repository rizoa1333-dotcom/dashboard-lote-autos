'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const file = process.argv[2] || path.join(__dirname, '../VeloDrive-n8n-intervencion-automatica.json');
const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
function node(name) {
  const found = workflow.nodes.find(item => item.name === name);
  if (!found) throw new Error(`Missing workflow node: ${name}`);
  return found;
}
function connect(name, ...outputs) {
  workflow.connections[name] = { main: outputs.map(names => names.map(target => ({ node: target, type: 'main', index: 0 }))) };
}
function rpc(name, procedure, expression, alwaysOutputData = false) {
  const item = node(name);
  const base = item.parameters.url.match(/https:\/\/[^/]+\/rest\/v1\//)?.[0];
  if (!base) throw new Error(`Supabase URL missing: ${name}`);
  Object.assign(item.parameters, {
    url: `${base}rpc/${procedure}`, method: 'POST', sendBody: true, specifyBody: 'json',
    jsonBody: `={{ JSON.stringify(${expression}) }}`,
  });
  item.parameters.headerParameters.parameters = item.parameters.headerParameters.parameters
    .filter(header => !['Prefer', 'Content-Type'].includes(header.name));
  item.parameters.headerParameters.parameters.push({ name: 'Content-Type', value: 'application/json' });
  item.alwaysOutputData = alwaysOutputData;
  item.retryOnFail = false;
}

const token = `(/^Bearer\\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(String($json.headers?.authorization || ''))?.[1] || null)`;
for (const number of [7, 8, 9, 10]) {
  rpc(`Verificar Token de Tenant${number}`, 'resolve_tenant_webhook', `{p_token:${token}}`, true);
}
rpc('Actualizar Token en Supabase1', 'rotate_tenant_webhook',
  '{p_lote_id:$json.lote_id,p_previous:$json.token_anterior,p_replacement:$json.token_nuevo}');

const validated = "$('Validar Datos de Publicación').item.json";
const tenant = "$('Normalizar Verificación Token2').item.json.loteId";
const claim = "$('Comprobar Unidad del Lote').item.json";
const evaluation = "$('Evaluar Envío de Publicación').item.json";
rpc('Consultar Unidad para Publicar', 'claim_meta_publication',
  `{p_lote_id:${tenant},p_car_id:${validated}.carId,p_platforms:${validated}.platforms,p_urls:${validated}.urls,p_copy:${validated}.copy}`);
node('Comprobar Unidad del Lote').parameters.jsCode = `
const valid = typeof $json.send === 'boolean' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String($json.request_id || ''));
const superseded = $json.code === 'PUBLICATION_SUPERSEDED';
const busy = $json.code === 'PUBLICATION_IN_PROGRESS';
const invalid = $json.code === 'INVALID_PUBLICATION';
return [{json:{unitValid:valid,send:valid && $json.send,requestId:valid ? $json.request_id : null,
  httpStatus:superseded || busy ? 409 : invalid ? 400 : 404,code:$json.code,
  error:superseded ? 'Este contenido ya se envió. Consulta el estado de la publicación más reciente.' :
    busy ? 'Hay un intento pendiente para esta unidad. Consulta Verificar Meta antes de enviar otro contenido.' :
    invalid ? 'Revisa las fotos y el texto de la publicación.' : 'La unidad no pertenece a este lote o ya fue eliminada.'}}];`.trim();

const sendGate = '¿Envío Nuevo?';
if (!workflow.nodes.some(item => item.name === sendGate)) {
  const template = node('¿Unidad del Lote?');
  const gate = structuredClone(template);
  gate.id = randomUUID();
  gate.name = sendGate;
  gate.position = [template.position[0] + 190, template.position[1]];
  gate.parameters.conditions.conditions[0].id = randomUUID();
  workflow.nodes.push(gate);
}
node(sendGate).parameters.conditions.conditions[0].leftValue = '={{ $json.send === true }}';
connect('¿Unidad del Lote?', [sendGate], ['Responder Error de Publicación']);
connect(sendGate, ['Publicar Upload-Post (Fotos)1'], ['Responder Publicación1']);

const provider = node('Publicar Upload-Post (Fotos)1');
provider.retryOnFail = false;
provider.parameters.bodyParameters.parameters.find(field => field.name === 'request_id').value = `={{ ${claim}.requestId }}`;
const idempotency = provider.parameters.headerParameters.parameters.find(header => header.name.toLowerCase() === 'idempotency-key');
if (idempotency) idempotency.value = `={{ ${tenant} + ':' + ${claim}.requestId }}`;

const evaluator = node('Evaluar Envío de Publicación');
evaluator.parameters.jsCode = evaluator.parameters.jsCode.replace(`${validated}.requestId`, `${claim}.requestId`);
rpc('Guardar Estado Meta1', 'finish_meta_publication',
  `{p_lote_id:${tenant},p_car_id:${validated}.carId,p_request_id:${claim}.requestId,` +
  `p_result:$json.accepted ? 'accepted' : [400,401,403,404,429].includes($json.providerHttpStatus) ? 'rejected' : 'pending'}`);
connect('Evaluar Envío de Publicación', ['Guardar Estado Meta1']);
connect('Guardar Estado Meta1', ['¿Envío Aceptado?']);
node('¿Envío Aceptado?').parameters.conditions.conditions[0].leftValue = `={{ $json.saved === true && ${evaluation}.accepted === true }}`;
connect('¿Envío Aceptado?', ['Responder Publicación1'], ['Responder Error de Publicación']);

node('Responder Publicación1').parameters.responseBody =
  `={{ {success:true,status:${claim}.send ? 'processing' : 'existing',request_id:${claim}.requestId} }}`;
const errorResponse = node('Responder Error de Publicación');
errorResponse.parameters.responseBody =
  `={{ (() => { const failure = $json.saved === true ? ${evaluation} : $json; return {success:false,error:failure.error || 'No se pudo confirmar el envío. Verifica el estado antes de reintentar.',code:failure.code || 'PUBLICATION_FAILED'}; })() }}`;
errorResponse.parameters.options.responseCode = `={{ ($json.saved === true ? ${evaluation}.httpStatus : $json.httpStatus) || 502 }}`;

const statusRequest = "$('Validar Consulta de Publicación').item.json.requestId";
const statusResponse = "$('Consultar Status Upload-Post1').item.json";
rpc('Actualizar Estado Real1', 'record_meta_publication_status',
  `{p_lote_id:$json.lote_id,p_car_id:$json.car_id,p_request_id:${statusRequest},p_published:$json.publicado,` +
  `p_observed:${statusResponse}.request_id === ${statusRequest} && ` +
  `['pending','queued','processing','in_progress','completed','failed'].includes(${statusResponse}.status)}`);
node('Responder Estado1').parameters.responseBody =
  "={{ $json.saved === true ? $('Evaluar Resultado1').item.json : {fallo:true,mensaje:'No se pudo confirmar el estado de este envío.'} }}";
node('Responder Estado1').parameters.options.responseCode = '={{ $json.saved === true ? 200 : 502 }}';

fs.writeFileSync(file, JSON.stringify(workflow, null, 2) + '\n');
