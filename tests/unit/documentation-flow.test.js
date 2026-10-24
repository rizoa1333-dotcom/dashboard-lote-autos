const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const workflow = require('../../VeloDrive-n8n-intervencion-automatica.json');
const lot = '38fc2094-ce52-4e6a-9c42-69db7725d65f';
const node = name => workflow.nodes.find(item => item.name === name);
function run(name, input, context = {}) {
  return vm.runInNewContext(`(() => { ${node(name).parameters.jsCode} })()`, {
    $json: input,
    $: key => ({ item: { json: context[key] || {} }, first: () => ({ json: context[key] || {} }) }),
    Buffer,
  });
}
function documentInput(id = 18) {
  const lead = { id, lote_id: lot, encuesta_step: 1 };
  const context = {
    'Webhook WhatsApp1': { body: { data: { key: { id: 'QA_DOC_1', remoteJid: '5213121234567@s.whatsapp.net' }, message: { conversation: 'Listo' } } } },
    'Edit Fields1': { tenant_lote_id: lot },
    'Preparar identidad del mensaje': { phone_number: '3121234567' },
  };
  return { lead, context };
}
test('documentación acepta el ID numérico real y conserva el destinatario internacional', () => {
  const { lead, context } = documentInput();
  const result = run('Documentación de fase de validación1', lead, context)[0].json;
  assert.equal(result.lead_id, '18');
  assert.equal(result.phone, '5213121234567');
  assert.equal(result.continuar, false);
  assert.match(result.mensajeFaltante, /INE/);
});
test('documentación rechaza IDs inválidos y leads de otro lote', () => {
  for (const id of [0, -1, '18&lote_id=neq.x', '9223372036854775808', 1.5]) {
    const { lead, context } = documentInput(id);
    assert.throws(() => run('Documentación de fase de validación1', lead, context));
  }
  const { lead, context } = documentInput();
  lead.lote_id = '00000000-0000-4000-8000-000000000001';
  assert.throws(() => run('Documentación de fase de validación1', lead, context));
});
test('una imagen válida conserva el paso y puede continuar al almacenamiento privado', () => {
  const { lead, context } = documentInput();
  lead.encuesta_step = 2;
  context['Webhook WhatsApp1'].body.data.base64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9]).toString('base64');
  context['Webhook WhatsApp1'].body.data.message = { imageMessage: { mimetype: 'image/jpeg' } };
  const result = run('Documentación de fase de validación1', lead, context)[0].json;
  assert.equal(result.continuar, true);
  assert.equal(result.step, 2);
  assert.equal(result.ext, 'jpg');
  assert.match(result.mensajeFaltante, /domicilio/);
});
test('un PDF sin base64 solicita descarga y los pasos fuera de rango se rechazan', () => {
  const { lead, context } = documentInput();
  context['Webhook WhatsApp1'].body.data.message = { documentMessage: { mimetype: 'application/pdf' } };
  assert.equal(run('Documentación de fase de validación1', lead, context)[0].json.necesitaDescarga, true);
  for (const step of [0, 4, 1.5, null]) {
    lead.encuesta_step = step;
    assert.throws(() => run('Documentación de fase de validación1', lead, context));
  }
});
test('actualizar documentos limita la escritura al lead y lote correctos', () => {
  const url = node('Líder de Actualizar1').parameters.url;
  assert.match(url, /id=eq\.\{\{ \$json.lead_id \}\}/);
  assert.match(url, /lote_id=eq\.\{\{ \$json.lote_id \}\}/);
  assert.match(node('Enviar Respuesta WhatsApp1').parameters.jsonBody, /mensaje_cliente/);
});
test('al confirmar una cita nueva solicita la primera identificación en la misma respuesta', () => {
  const result = run('Fusionar Datos del Lead1', {}, {
    'Buscar Lead Existente1': { nombre: 'QA', fecha_cita: null },
    'AI Agent Vendedor1': { output: 'Tu cita quedó registrada.\n<<<DATOS_INTERNOS>>>\nNombre: QA\nCita: 2026-10-17 17:00:00' },
  })[0].json;
  assert.match(result.mensaje_cliente, /INE/);
  assert.doesNotMatch(result.mensaje_cliente, /DATOS_INTERNOS/);
});
test('una cita previa no vuelve a iniciar la solicitud de documentos', () => {
  const result = run('Fusionar Datos del Lead1', {}, {
    'Buscar Lead Existente1': { fecha_cita: '2026-10-17 17:00:00' },
    'AI Agent Vendedor1': { output: 'Te esperamos.\n<<<DATOS_INTERNOS>>>\nCita: 2026-10-17 17:00:00' },
  })[0].json;
  assert.equal(result.mensaje_cliente, 'Te esperamos.');
});
test('las respuestas de documentación autorizan el envío y cierran el registro durable', () => {
  for (const [previous, send] of [['Líder de Actualizar1', 'Responder WhatsApp1'], ['Continuar1', 'Responder Sin Adjunto1']]) {
    const names = [];
    let cursor = workflow.connections[previous].main[previous === 'Continuar1' ? 1 : 0][0].node;
    for (let i = 0; i < 8; i++) {
      names.push(cursor);
      const next = workflow.connections[cursor]?.main?.[0]?.[0]?.node;
      if (!next) break;
      cursor = next;
    }
    assert.ok(names.some(name => node(name).parameters.url?.endsWith('/begin_whatsapp_send')));
    assert.ok(names.includes(send));
    assert.ok(names.includes('Completar mensaje durable'));
  }
});


test('documentos con MIME falso o base64 malformado no avanzan al almacenamiento', () => {
  for (const base64 of ['!!!!', Buffer.from('%PDF-1.7\n%%EOF').toString('base64')]) {
    const { lead, context } = documentInput();
    const data = context['Webhook WhatsApp1'].body.data;
    data.base64 = base64; data.message = { imageMessage: { mimetype: 'image/jpeg' } };
    const result = run('Documentación de fase de validación1', lead, context)[0].json;
    assert.equal(result.continuar, false);
    assert.equal(result.necesitaDescarga, false);
    assert.match(result.mensajeFaltante, /archivo|formato/i);
    assert.equal(result.base64, null);
  }
});

test('metadatos mayores a 10 MiB rechazan el documento antes de solicitar descarga', () => {
  const { lead, context } = documentInput();
  context['Webhook WhatsApp1'].body.data.message = { documentMessage: { mimetype: 'application/pdf', fileLength: { low: 10485761, high: 0, unsigned: true } } };
  const result = run('Documentación de fase de validación1', lead, context)[0].json;
  assert.equal(result.continuar, false);
  assert.equal(result.necesitaDescarga, false);
  assert.match(result.mensajeFaltante, /10 MB/);
});

test('un adjunto descargado tambien debe validar su firma antes de continuar', () => {
  const result = run('Combinar Base64 Descargado', { base64: Buffer.from('<html>no es imagen</html>').toString('base64') }, {
    'Documentación de fase de validación1': { mimetype: 'image/png', ext: 'png', phone: '523121234567', step: 1, necesitaDescarga: true }
  })[0].json;
  assert.equal(result.continuar, false);
  assert.equal(result.base64, null);
});

test('una descarga fallida conserva el paso y pide reintentar sin revelar el error interno',()=>{
 const result=run('Combinar Base64 Descargado',{error:{message:'SECRET_PROVIDER_HEADER'}},{
  'Documentación de fase de validación1':{mimetype:'image/png',phone:'523121234567',step:2,mensajeFaltante:'Solicitud previa'}
 })[0].json;
 assert.equal(result.continuar,false);
 assert.equal(result.necesitaDescarga,false);
 assert.equal(result.step,2);
 assert.match(result.mensajeFaltante,/descargar.*vuelve a enviarlo/i);
 assert.doesNotMatch(JSON.stringify(result),/SECRET_PROVIDER_HEADER/);
});
