const test = require('node:test');
const assert = require('node:assert/strict');
const workflow = require('../../VeloDrive-n8n-intervencion-automatica.json');
let api = {};
try { api = require('../../webhook-security'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
const root = 'test-root-only-012345678901234567890123456789';
const instance = 'instancia_11111111-1111-4111-8111-111111111111';

test('token de Evolution está vinculado a una sola instancia y no acepta query secret', () => {
  assert.equal(typeof api.deriveChannelToken, 'function');
  const token = api.deriveChannelToken(instance, root);
  const body = { instance, event: 'messages.upsert' };
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(api.verifyEvolutionWebhook({ body, headers: { 'x-velodrive-channel': token } }, root), true);
  for (const input of [
    { body: { ...body, instance: 'instancia_other' }, headers: { 'x-velodrive-channel': token } },
    { body, query: { secret: root }, headers: {} },
    { body, headers: { 'x-velodrive-channel': root } },
    { body: { ...body, instance: '%' }, headers: { 'x-velodrive-channel': token } },
    { body, headers: { 'x-velodrive-channel': [token] } }
  ]) assert.equal(api.verifyEvolutionWebhook(input, root), false);
});

test('citas requiere un secreto distinto y solo extrae un ID válido del payload', () => {
  assert.equal(typeof api.verifyCitaWebhook, 'function');
  const input = { headers: { 'x-cita-secret': 'cita-only-012345678901234567890123456' }, body: { cita_id: '23', lote_id: 'attacker' } };
  assert.equal(api.verifyCitaWebhook(input, input.headers['x-cita-secret']), true);
  assert.equal(api.verifyCitaWebhook(input, root), false);
  assert.equal(api.normalizeCitaId(input), '23');
  for (const id of ['23&lote_id=neq.0', 0, -1, null, '1.5', {}]) {
    assert.throws(() => api.normalizeCitaId({ body: { cita_id: id } }), /INVALID_CITA/);
  }
});

test('n8n no tiene un escritor Stripe alternativo habilitado', () => {
  for (const name of ['Stripe Trigger1', 'Activar Lote Inicial1', 'Renovar Suscripción1', 'Cancelar Suscripción1']) {
    assert.equal(workflow.nodes.find(n => n.name === name)?.disabled, true, name);
  }
});

test('herramientas del agente solo consultan la proyección pública y conservan el filtro de lote', () => {
  for (const name of ['consultar_inventario_autos1', 'buscar_inventario_autos1']) {
    const node = workflow.nodes.find(n => n.name === name);
    assert.equal(node.parameters.tableId, 'agent_inventory');
    assert.equal(node.parameters.filters.conditions.some(c => c.keyName === 'lote_id' && c.condition === 'eq'), true);
  }
});

test('operaciones premium requieren plan activo antes de IA/publicación/conexión', () => {
  for (const number of [7, 8, 9, 10]) {
    const url = workflow.nodes.find(n => n.name === 'Verificar Token de Tenant' + number).parameters.url;
    assert.ok(url.includes('plan_status=eq.active'));
  }
  assert.ok(workflow.nodes.find(n => n.name === 'Verificar plan del canal').parameters.url.includes('plan_status=eq.active'));
});

test('productor de webhook no incluye secreto en URL y verifica headers configurados', () => {
  const config = workflow.nodes.find(n => n.name === 'Configurar webhook WhatsApp').parameters.jsonBody;
  assert.equal(config.includes('?secret='), false);
  assert.ok(config.includes('headers:'));
  assert.ok(workflow.nodes.find(n => n.name === 'Comprobar webhook WhatsApp').parameters.jsCode.includes('x-velodrive-channel'));
});

test('citas lee el registro real y reclama notificación antes de enviarla', () => {
  assert.ok(workflow.nodes.some(n => n.name === 'Consultar cita real'));
  assert.ok(workflow.nodes.some(n => n.name === 'Reclamar notificación de cita'));
  const lookup = workflow.nodes.find(n => n.name === 'Buscar Instancia para Nueva Cita').parameters.url;
  assert.equal(lookup.includes("$('Webhook Nueva Cita')"), false);
});

test('los recordatorios programados excluyen lotes sin plan activo', () => {
  for (const name of ['Buscar Citas Próximas', 'Buscar Leads Sin Agendar']) {
    const url = workflow.nodes.find(n => n.name === name).parameters.url;
    assert.ok(url.includes('lotes!inner(plan_status)'), name);
    assert.ok(url.includes('lotes.plan_status=eq.active'), name);
  }
});

test('cita canónica conserva bigint sin pérdida y usa crypto compatible con n8n', () => {
  const vm = require('node:vm');
  const code = workflow.nodes.find(n => n.name === 'Cita verificada').parameters.jsCode;
  const record = { id: '9223372036854775807', lote_id: '11111111-1111-4111-8111-111111111111' };
  const run = new Function('$json', code);
  assert.equal(run({ record })[0].json.body.record.id, record.id);
  assert.equal(workflow.nodes.find(n => n.name === 'Preparar conexión QR').parameters.jsCode.includes("require('node:crypto')"), false);
  for (const name of ['Validar origen Evolution', 'Validar origen Cita']) {
    const source = workflow.nodes.find(n => n.name === name).parameters.jsCode;
    const input = name.endsWith('Evolution')
      ? { body: { instance }, headers: { 'x-velodrive-channel': api.deriveChannelToken(instance, root) } }
      : { headers: { 'x-cita-secret': root } };
    const context = { $json: input, $env: { EVOLUTION_WEBHOOK_ROOT_SECRET: root, CITA_WEBHOOK_SECRET: root }, Buffer,
      require: name => { assert.equal(name, 'crypto'); return require('node:crypto'); } };
    assert.equal(vm.runInNewContext('(function(){' + source + '})()', context)[0].json.valid_webhook, true);
  }
});

test('notificación usa filas HTTP normalizadas sin perder canal ni datos del lote', () => {
  const code = workflow.nodes.find(n => n.name === 'Preparar Notificación').parameters.jsCode;
  const cita = {id:'23',lote_id:'11111111-1111-4111-8111-111111111111',telefono:'523120000001',nombre_cliente:'QA'};
  const channel = {instance_name:'instancia_qa',api_key:'test-only',telefono_notificaciones:'523120000002'};
  const lot = {direccion:'QA',ciudad:'Colima',hora_abre:'09:00',hora_cierra:'19:00'};
  for (const array of [false,true]) {
    const rows = {'Cita verificada':{body:{record:cita}},'Buscar Instancia para Nueva Cita':array?[channel]:channel,
      'Buscar Datos Lote para Cita':array?[lot]:lot};
    const result = new Function('$',code)(name=>({item:{json:rows[name]},first:()=>({json:rows[name]})}))[0].json;
    assert.equal(result.debeNotificar,true);
    assert.equal(result.debeConfirmarCliente,true);
    assert.ok(result.mensajeCliente.includes('Colima'));
  }
});
