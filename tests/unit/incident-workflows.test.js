const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../..',name),'utf8'));
test('los flujos auxiliares conservan alertas sin almacenar cargas completas de ejecucion',()=>{
  for(const name of ['VeloDrive-n8n-incidentes.json','VeloDrive-n8n-alertas-correo.json']){
    const w=read(name);
    assert.equal(w.settings.saveDataErrorExecution,'none');
    assert.equal(w.settings.saveDataSuccessExecution,'none');
    assert.equal(w.settings.saveManualExecutions,false);
    assert.equal(w.settings.saveExecutionProgress,false);
  }
});
test('el flujo de incidentes registra fallos y revisa mensajes atascados cada cinco minutos',()=>{
  const w=read('VeloDrive-n8n-incidentes.json');
  assert.ok(w.nodes.some(n=>n.type==='n8n-nodes-base.errorTrigger'));
  const schedule=w.nodes.find(n=>n.type==='n8n-nodes-base.scheduleTrigger');
  assert.equal(schedule?.parameters.rule.interval[0].minutesInterval,5);
  assert.ok(w.nodes.some(n=>n.parameters.url?.endsWith('/collect_stale_whatsapp_events')));
});
test('las alertas usan HTTPS, reclaman su incidente y verifican la aceptación del proveedor',()=>{
  const w=read('VeloDrive-n8n-alertas-correo.json');
  const send=w.nodes.find(n=>n.name==='Enviar alerta de soporte');
  assert.equal(send.type,'n8n-nodes-base.httpRequest');
  assert.equal(send.parameters.url,'https://api.resend.com/emails');
  assert.equal(send.parameters.genericAuthType,'httpHeaderAuth');
  assert.notEqual(send.retryOnFail,true);
  assert.equal(send.onError,'continueErrorOutput');
  assert.ok(send.parameters.jsonBody.includes('rizoa1333@gmail.com'));
  assert.ok(send.parameters.headerParameters.parameters.some(h=>h.name==='Idempotency-Key'));
  const gate=w.connections['¿Alerta adquirida?'].main;
  assert.equal(gate[0][0].node,send.name);
  assert.equal(w.connections[send.name].main[0][0].node,'¿Proveedor aceptó alerta?');
  assert.equal(w.connections['¿Proveedor aceptó alerta?'].main[0][0].node,'Confirmar alerta enviada');
  assert.equal(w.connections['¿Proveedor aceptó alerta?'].main[1][0].node,'Marcar alerta incierta');
  assert.equal(w.connections[send.name].main[1][0].node,'Marcar alerta incierta');
  assert.ok(w.nodes.some(n=>n.parameters.url?.endsWith('/claim_incident_notification')));
  assert.ok(!send.parameters.jsonBody.includes('error.message'));
  assert.ok(!send.parameters.jsonBody.includes('payload'));
  assert.equal(w.nodes.some(n=>n.type==='n8n-nodes-base.emailSend'),false);
});
