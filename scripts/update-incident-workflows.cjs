const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.join(__dirname,'..');
const mailFile=path.join(root,'VeloDrive-n8n-alertas-correo.json');
const previousMail=fs.existsSync(mailFile)?JSON.parse(fs.readFileSync(mailFile,'utf8')):null;
const uid=name=>createHash('sha256').update('velodrive-incidents:'+name).digest('hex').slice(0,32);
const edge=name=>({node:name,type:'main',index:0});
const link=(w,from,...outputs)=>{w.connections[from]={main:outputs.map(names=>names.map(edge))};};
const headers={parameters:[{name:'apikey',value:'={{ $env.SUPABASE_SERVICE_ROLE_KEY }}'},{name:'Authorization',value:'=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}'}]};
const url='https://deljncdcddfghfihuumd.supabase.co/rest/v1/';
const add=(w,name,type,parameters,position,extra={})=>w.nodes.push({id:uid(name),name,type,typeVersion:type==='n8n-nodes-base.httpRequest'?4.2:type==='n8n-nodes-base.scheduleTrigger'?1.2:type==='n8n-nodes-base.if'?2.2:type==='n8n-nodes-base.emailSend'?2.1:type==='n8n-nodes-base.splitInBatches'?3:2,position,parameters,...extra});
const http=(w,name,endpoint,body,position)=>add(w,name,'n8n-nodes-base.httpRequest',{method:'POST',url:url+'rpc/'+endpoint,sendHeaders:true,headerParameters:headers,sendBody:true,specifyBody:'json',jsonBody:body,options:{timeout:15000}},position);
const schedule={rule:{interval:[{field:'minutes',minutesInterval:5}]}};
const incidents=JSON.parse(fs.readFileSync(path.join(root,'VeloDrive-n8n-incidentes.json'),'utf8'));
incidents.nodes=incidents.nodes.filter(n=>!['Revisar cada cinco minutos','Detectar mensajes atascados'].includes(n.name));
add(incidents,'Revisar cada cinco minutos','n8n-nodes-base.scheduleTrigger',schedule,[0,300]);
http(incidents,'Detectar mensajes atascados','collect_stale_whatsapp_events','={{ {} }}',[240,300]);
link(incidents,'Revisar cada cinco minutos',['Detectar mensajes atascados']);
fs.writeFileSync(path.join(root,'VeloDrive-n8n-incidentes.json'),JSON.stringify(incidents,null,2)+'\n');

const w={name:'VeloDrive - Alertas por correo',nodes:[],connections:{},settings:{executionOrder:'v1'},active:false,pinData:{}};
add(w,'Revisar alertas pendientes','n8n-nodes-base.scheduleTrigger',schedule,[0,0]);
add(w,'Listar incidentes pendientes','n8n-nodes-base.httpRequest',{url:url+'operational_incidents?notification_state=eq.pending&order=created_at.asc&limit=20&select=execution_id,workflow_id,lote_id,node_name,code,created_at',sendHeaders:true,headerParameters:headers,options:{timeout:15000}},[220,0]);
add(w,'Por incidente','n8n-nodes-base.splitInBatches',{batchSize:1,options:{}},[440,0]);
http(w,'Reclamar alerta','claim_incident_notification',"={{ {p_incident_id:$json.execution_id,p_sender_id:String($execution.id)} }}",[660,0]);
add(w,'¿Alerta adquirida?','n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,typeValidation:'strict',version:2},conditions:[{id:uid('gate'),leftValue:'={{ $json.acquired === true }}',rightValue:true,operator:{type:'boolean',operation:'true'}}],combinator:'and'},options:{}},[880,0]);
add(w,'Enviar alerta de soporte','n8n-nodes-base.httpRequest',{
  method:'POST',url:'https://api.resend.com/emails',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',
  sendHeaders:true,headerParameters:{parameters:[{name:'Idempotency-Key',value:"={{ 'velodrive-incident/'+$('Por incidente').item.json.execution_id }}"}]},
  sendBody:true,specifyBody:'json',
  jsonBody:"={{ {from:$env.ALERT_FROM_EMAIL || 'VeloDrive <onboarding@resend.dev>',to:['rizoa1333@gmail.com'],subject:'VeloDrive: incidente operativo',text:'VeloDrive requiere revisión manual.\\nEjecución: '+$('Por incidente').item.json.execution_id+'\\nFlujo: '+$('Por incidente').item.json.workflow_id+'\\nLote: '+($('Por incidente').item.json.lote_id || 'sin identificar')+'\\nNodo: '+$('Por incidente').item.json.node_name+'\\nCódigo: '+$('Por incidente').item.json.code+'\\nNo reenvíes un mensaje con resultado incierto sin comprobar su entrega.'} }}",
  options:{timeout:15000}
},[1100,0],{onError:'continueErrorOutput'});
add(w,'¿Proveedor aceptó alerta?','n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,typeValidation:'strict',version:2},conditions:[{id:uid('provider-accepted'),leftValue:"={{ typeof $json.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test($json.id) }}",rightValue:true,operator:{type:'boolean',operation:'true'}}],combinator:'and'},options:{}},[1300,0]);
const result=sent=>"={{ {p_incident_id:$('Por incidente').item.json.execution_id,p_sender_id:String($execution.id),p_sent:"+sent+"} }}";
http(w,'Confirmar alerta enviada','finish_incident_notification',result(true),[1320,0]);
http(w,'Marcar alerta incierta','finish_incident_notification',result(false),[1320,220]);
link(w,'Revisar alertas pendientes',['Listar incidentes pendientes']);
link(w,'Listar incidentes pendientes',['Por incidente']);
link(w,'Por incidente',[],['Reclamar alerta']);
link(w,'Reclamar alerta',['¿Alerta adquirida?']);
link(w,'¿Alerta adquirida?',['Enviar alerta de soporte'],['Por incidente']);
link(w,'Enviar alerta de soporte',['¿Proveedor aceptó alerta?'],['Marcar alerta incierta']);
link(w,'¿Proveedor aceptó alerta?',['Confirmar alerta enviada'],['Marcar alerta incierta']);
link(w,'Confirmar alerta enviada',['Por incidente']);
link(w,'Marcar alerta incierta',['Por incidente']);
const previousCredentials=previousMail?.nodes.find(n=>n.name==='Enviar alerta de soporte'&&n.type==='n8n-nodes-base.httpRequest')?.credentials;
if(previousCredentials)w.nodes.find(n=>n.name==='Enviar alerta de soporte').credentials=previousCredentials;
if(previousMail?.settings)w.settings=previousMail.settings;
fs.writeFileSync(mailFile,JSON.stringify(w,null,2)+'\n');
