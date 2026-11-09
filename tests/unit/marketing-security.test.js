const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const workflow = require('../../VeloDrive-n8n-intervencion-automatica.json');

const node = name => workflow.nodes.find(item => item.name === name);
const next = (name, output = 0) => workflow.connections[name].main[output].map(edge => edge.node);

test('n8n envía el token de consulta y el de renovación en cuerpos POST con URLs fijas', () => {
  for (const number of [7, 8, 9, 10]) {
    const { parameters } = node(`Verificar Token de Tenant${number}`);
    assert.equal(parameters.method, 'POST');
    assert.match(parameters.url, /\/rpc\/resolve_tenant_webhook$/);
    assert.match(parameters.jsonBody, /p_token/);
  }
  const rotation = node('Actualizar Token en Supabase1').parameters;
  assert.equal(rotation.method, 'POST');
  assert.match(rotation.url, /\/rpc\/rotate_tenant_webhook$/);
  assert.match(rotation.jsonBody, /p_previous/);
});

test('el proveedor solo recibe publicaciones que obtienen una reclamación nueva', () => {
  assert.match(node('Consultar Unidad para Publicar').parameters.url, /\/rpc\/claim_meta_publication$/);
  assert.deepEqual(next('¿Unidad del Lote?'), ['¿Envío Nuevo?']);
  assert.deepEqual(next('¿Envío Nuevo?'), ['Publicar Upload-Post (Fotos)1']);
  assert.deepEqual(next('¿Envío Nuevo?', 1), ['Responder Publicación1']);
  assert.match(node('Publicar Upload-Post (Fotos)1').parameters.bodyParameters.parameters
    .find(field => field.name === 'request_id').value, /Comprobar Unidad del Lote/);
});

test('verificar estado solo confirma el intento cuando el proveedor devuelve el mismo ID', () => {
  const requestId = '10000000-0000-4000-8000-000000000001';
  const expression = node('Actualizar Estado Real1').parameters.jsonBody.slice(3, -3);
  const body = (id, status) => JSON.parse(vm.runInNewContext(expression, {
    $json: { lote_id: 'lot-a', car_id: 1, publicado: false },
    $: name => ({ item: { json: name === 'Validar Consulta de Publicación' ? { requestId } : { request_id: id, status } } }),
  }));
  assert.equal(body(requestId, 'processing').p_observed, true);
  assert.equal(body('other-request', 'completed').p_observed, false);
  assert.equal(body(requestId, 'not_found').p_observed, false);
});
