const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { normalizeEvolutionEvent, normalizeClaimResult, sanitizeIncident } = require('../whatsapp-reliability');
const file = path.join(__dirname,'../VeloDrive-n8n-intervencion-automatica.json');
const w = JSON.parse(fs.readFileSync(file,'utf8'));
const node = name => w.nodes.find(n=>n.name===name);
const edge = name => ({node:name,type:'main',index:0});
const connect = (name,...outputs) => {w.connections[name]={main:outputs.map(list=>list.map(edge))};};
function put(name,type,parameters,position=[35400,18800],extra={}) {
  const existing=node(name);const value={id:existing?.id||randomUUID(),name,type,typeVersion:type==='n8n-nodes-base.httpRequest'?4.2:type==='n8n-nodes-base.if'?2.2:type==='n8n-nodes-base.code'?2:1,position,parameters,...extra};
  if(existing)Object.assign(existing,value);else w.nodes.push(value);
}
const headers={parameters:[{name:'apikey',value:'={{ $env.SUPABASE_SERVICE_ROLE_KEY }}'},{name:'Authorization',value:'=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}'}]};
const identity="const id = $('Preparar identidad del mensaje').first().json;";
const keyBody="p_instance:id.instance,p_message_id:id.message_id,p_execution_id:id.execution_id";
function rpc(name,rpcName,body,position){put(name,'n8n-nodes-base.httpRequest',{method:'POST',url:'https://deljncdcddfghfihuumd.supabase.co/rest/v1/rpc/'+rpcName,sendHeaders:true,headerParameters:headers,sendBody:true,specifyBody:'json',jsonBody:'={{ (() => { '+identity+' return JSON.stringify({ '+body+' }); })() }}',options:{timeout:15000}},position);}
function condition(name,expression,position){put(name,'n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,typeValidation:'strict',version:2},conditions:[{id:node(name)?.parameters.conditions.conditions[0]?.id||randomUUID(),leftValue:expression,rightValue:true,operator:{type:'boolean',operation:'true'}}],combinator:'and'},options:{}},position);}
put('Preparar identidad del mensaje','n8n-nodes-base.code',{jsCode:normalizeEvolutionEvent.toString()+"\nreturn [{json:normalizeEvolutionEvent($('Webhook WhatsApp1').first().json.body,String($execution.id))}];"},[34900,18500]);
node('Filtro Anti-Bucle (fromMe)1').parameters.conditions.conditions=[{leftValue:'={{ $json.valid === true }}',rightValue:true,operator:{type:'boolean',operation:'true'}}];
node('Get many rows1').parameters.filters.conditions=[{keyName:'instance_name',condition:'eq',keyValue:"={{ $('Preparar identidad del mensaje').first().json.instance }}"}];
node('Get many rows1').alwaysOutputData=true;
put('Responder evento ignorado','n8n-nodes-base.respondToWebhook',{respondWith:'json',responseBody:'={{ {received:true,ignored:true} }}',options:{}},[35100,19100]);
rpc('Reclamar mensaje durable','claim_whatsapp_event',keyBody+',p_phone:id.phone_number',[35400,18500]);
put('Normalizar reclamación durable','n8n-nodes-base.code',{jsCode:normalizeClaimResult.toString()+"\nconst result=normalizeClaimResult($json); result.process = result.process && $json.lote_id === $('Get many rows1').first().json.lote_id; return [{json:result}];"},[35600,18500]);
condition('¿Mensaje adquirido?',"={{ $('Normalizar reclamación durable').first().json.process === true }}",[35800,18500]);
connect('Secret Evolution Válido1',['Preparar identidad del mensaje'],['Responder 401 evolution1']);
connect('Preparar identidad del mensaje',['Filtro Anti-Bucle (fromMe)1']);
connect('Filtro Anti-Bucle (fromMe)1',['Get many rows1'],['Responder evento ignorado']);
connect('Canal Configurado?1',['Reclamar mensaje durable'],['Responder evento ignorado']);
connect('Reclamar mensaje durable',['Normalizar reclamación durable']);
connect('Normalizar reclamación durable',['Responder OK Inmediato']);
connect('Responder OK Inmediato',['¿Mensaje adquirido?']);
connect('¿Mensaje adquirido?',['Buscar Datos Lote'],[]);
rpc('Autorizar envío único','begin_whatsapp_send',keyBody,[36400,18500]);
condition('¿Envío autorizado?','={{ $json.send === true }}',[36600,18500]);
connect('Upsert Lead',['Autorizar envío único']);
connect('Autorizar envío único',['¿Envío autorizado?']);
connect('¿Envío autorizado?',['Enviar Respuesta WhatsApp1'],[]);
rpc('Confirmar envío aceptado','finish_whatsapp_event',keyBody+",p_state:'accepted',p_outbound_id:$('Enviar Respuesta WhatsApp1').first().json.key.id",[37000,18500]);
condition('¿Envío confirmado?','={{ $json.updated === true }}',[37200,18500]);
put('Detener confirmación inconsistente','n8n-nodes-base.stopAndError',{errorMessage:'WHATSAPP_EVENT_STATE_CONFLICT'},[37400,18900]);
connect('Enviar Respuesta WhatsApp1',['Confirmar envío aceptado']);
connect('Confirmar envío aceptado',['¿Envío confirmado?']);
connect('¿Envío confirmado?',['Guardar Respuesta IA1'],['Detener confirmación inconsistente']);
const phoneField=node('Guardar Respuesta IA1').parameters.fieldsUi.fieldValues.find(f=>f.fieldId==='phone_number');
phoneField.fieldValue="={{ $('Preparar identidad del mensaje').first().json.phone_number }}";
rpc('Completar mensaje durable','finish_whatsapp_event',keyBody+",p_state:'completed'",[37700,18500]);
connect('Guardar Respuesta IA1',['Completar mensaje durable']);
connect('Guardar mensaje del encargado',['Completar mensaje durable']);
connect('Guardar mensaje recibido durante pausa',['Completar mensaje durable']);
const apiBranches=w.connections['¿Mensaje enviado por API?'].main;
apiBranches[0]=[edge('Completar mensaje durable')];
rpc('Autorizar contingencia única','begin_whatsapp_send',keyBody,[36500,19100]);
condition('¿Contingencia autorizada?','={{ $json.send === true }}',[36700,19100]);
w.connections['AI Agent Vendedor1'].main[1]=[edge('Autorizar contingencia única')];
connect('Autorizar contingencia única',['¿Contingencia autorizada?']);
connect('¿Contingencia autorizada?',['responder error IA1'],[]);
rpc('Confirmar contingencia aceptada','finish_whatsapp_event',keyBody+",p_state:'accepted',p_outbound_id:$('responder error IA1').first().json.key.id",[37000,19100]);
rpc('Registrar fallo controlado IA','record_whatsapp_failure',"p_execution_id:id.execution_id,p_workflow_id:$workflow.id,p_node_name:'AI Agent Vendedor1',p_code:'WORKFLOW_FAILED'",[37200,19100]);
connect('responder error IA1',['Confirmar contingencia aceptada']);
connect('Confirmar contingencia aceptada',['Registrar fallo controlado IA']);
connect('Registrar fallo controlado IA',['Completar mensaje durable']);
node('Enviar Respuesta WhatsApp1').parameters.options={timeout:15000};
node('responder error IA1').parameters.options={timeout:15000};
fs.writeFileSync(file,JSON.stringify(w,null,2)+'\n');

const errorWorkflow={name:'VeloDrive - Incidentes y alertas',nodes:[
  {id:randomUUID(),name:'Error Trigger',type:'n8n-nodes-base.errorTrigger',typeVersion:1,position:[0,0],parameters:{}},
  {id:randomUUID(),name:'Sanear incidente',type:'n8n-nodes-base.code',typeVersion:2,position:[220,0],parameters:{jsCode:sanitizeIncident.toString()+'\nreturn [{json:sanitizeIncident($json,String($execution.id))}];'}},
  {id:randomUUID(),name:'Registrar incidente',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[440,0],parameters:{method:'POST',url:'https://deljncdcddfghfihuumd.supabase.co/rest/v1/rpc/record_whatsapp_failure',sendHeaders:true,headerParameters:headers,sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify({p_execution_id:$json.execution_id,p_workflow_id:$json.workflow_id,p_node_name:$json.node_name,p_code:$json.code}) }}',options:{timeout:15000}}}
],connections:{'Error Trigger':{main:[[edge('Sanear incidente')]]},'Sanear incidente':{main:[[edge('Registrar incidente')]]}},settings:{executionOrder:'v1'},active:false,pinData:{}};
const errorFile=path.join(__dirname,'../VeloDrive-n8n-incidentes.json');
if(fs.existsSync(errorFile)) {
  const previous=JSON.parse(fs.readFileSync(errorFile,'utf8'));
  for(const n of errorWorkflow.nodes)n.id=previous.nodes.find(p=>p.name===n.name)?.id||n.id;
  errorWorkflow.nodes.push(...previous.nodes.filter(n=>!errorWorkflow.nodes.some(p=>p.name===n.name)));
  errorWorkflow.connections={...previous.connections,...errorWorkflow.connections};
  errorWorkflow.settings=previous.settings;
}
fs.writeFileSync(errorFile,JSON.stringify(errorWorkflow,null,2)+'\n');
