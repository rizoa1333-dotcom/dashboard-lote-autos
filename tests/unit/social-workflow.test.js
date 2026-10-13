const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const workflow = require('../../VeloDrive-n8n-intervencion-automatica.json');

function runNode(name, json, references = {}) {
  const node = workflow.nodes.find((entry) => entry.name === name);
  assert.ok(node, name);
  return vm.runInNewContext(`(function(){${node.parameters.jsCode}})()`, {
    $json: json,
    $: (key) => ({ item: { json: references[key] || { loteId: 'tenant-a', body: {} } } }),
  })[0].json;
}

test('el flujo se puede importar sin identificadores de nodos duplicados', () => {
  assert.equal(new Set(workflow.nodes.map(node => node.id)).size, workflow.nodes.length);
});

test('solo TikTok o cuentas vacías no habilitan Facebook e Instagram', () => {
  const result = runNode('Evaluar Conexión2', {
    profiles: [{ username: 'tenant-a', social_accounts: { tiktok: { username: 'old' }, facebook: {}, instagram: '' } }],
  });
  assert.equal(result.conectado, false);
});

test('la verificación distingue conexión parcial y reautorización por plataforma', () => {
  const result = runNode('Evaluar Conexión2', {
    profiles: [{ username: 'tenant-a', social_accounts: {
      facebook: { username: 'Mi lote', reauth_required: false },
      instagram: { username: 'mi_lote', reauth_required: true },
    } }],
  });
  assert.equal(result.plataformas.facebook, true);
  assert.equal(result.plataformas.instagram, false);
  assert.equal(result.conectado, false);
  assert.equal(result.parcial, true);
});

test('crear simultáneamente un perfil existente (409) permite continuar', () => {
  const result = runNode('Evaluar Creación de Perfil Upload-Post2', {
    statusCode: 409, body: { success: false, error: 'User already exists' },
  });
  assert.equal(result.profileCreated, true);
});

test('una plataforma omitida no se presenta como publicación completa', () => {
  const result = runNode('Evaluar Resultado1', {
    status: 'completed', results: {
      facebook: { success: true }, instagram: { success: false, skipped: true },
    },
  });
  assert.equal(result.fallo, true);
  assert.equal(result.publicado, false);
});

test('estado completed sin resultados verificables no confirma publicación', () => {
  const result = runNode('Evaluar Resultado1', { status: 'completed', results: [] });
  assert.equal(result.publicado, false);
});

test('resultado de ambas redes en formato array confirma la publicación', () => {
  const result = runNode('Evaluar Resultado1', {
    status: 'completed', results: [{ platform: 'facebook', success: true }, { platform: 'instagram', success: true }],
  });
  assert.equal(result.publicado, true);
});

const publication = {
  car: { id: 21 }, platforms: ['facebook'], copy: 'Unidad disponible',
  image_urls: ['https://storage.test/a.jpg', 'https://storage.test/b.jpg'],
  request_id: 'qa-request-1234567890',
};

test('publicación válida conserva únicamente las redes elegidas y cada foto', () => {
  const result = runNode('Validar Datos de Publicación', {}, {
    'Webhook Publicar Redes1': { body: publication },
  });
  assert.equal(result.valid, true);
  assert.deepEqual(Array.from(result.platforms), ['facebook']);
  assert.equal(result.urls.length, 2);
});

test('rechaza plataformas ajenas al servicio e identificadores inyectados', () => {
  for (const change of [{ platforms: ['tiktok'] }, { car: { id: '21&lote_id=neq.x' } }, { image_urls: ['javascript:alert(1)'] }]) {
    const result = runNode('Validar Datos de Publicación', {}, {
      'Webhook Publicar Redes1': { body: { ...publication, ...change } },
    });
    assert.equal(result.valid, false);
  }
});

test('el enlace de conexión rechaza dominios ajenos a Upload-Post', () => {
  const accepted = runNode('Validar Enlace de Conexión Upload-Post2', { body: { access_url: 'https://app.upload-post.com/connect?token=qa' } });
  assert.equal(accepted.linkReady, true);
  const rejected = runNode('Validar Enlace de Conexión Upload-Post2', { body: { access_url: 'https://app.upload-post.com.attacker.test/connect' } });
  assert.equal(rejected.linkReady, false);
});

test('multipart envía dos fotos separadas y solamente Facebook', () => {
  const node = workflow.nodes.find(n => n.name === 'Publicar Upload-Post (Fotos)1');
  const expression = node.parameters.bodyParameters.parameters.slice(3, -2).trim();
  const parts = vm.runInNewContext(expression, {
    $: name => ({ item: { json: name === 'Validar Datos de Publicación'
      ? { platforms: ['facebook'], urls: publication.image_urls, copy: publication.copy, requestId: publication.request_id }
      : { loteId: 'tenant-a' } } }),
  });
  assert.deepEqual(Array.from(parts.filter(p => p.name === 'platform[]'), p => p.value), ['facebook']);
  assert.deepEqual(Array.from(parts.filter(p => p.name === 'photos[]'), p => p.value), publication.image_urls);
});
