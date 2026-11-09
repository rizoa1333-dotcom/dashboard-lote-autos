const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dashboard = fs.readFileSync(path.join(__dirname, '../../dashboard.js'), 'utf8');
const start = dashboard.indexOf('async function crearUrlDocumentoPrivado(');
const end = dashboard.indexOf('\nfunction renderDocPreview(', start);
assert.ok(start >= 0 && end > start, 'Debe existir la función de firma del panel');
const signDocument = new vm.Script(dashboard.slice(start, end));
const project = 'https://storage.test';
const legacyPrefix = `${project}/storage/v1/object/public/documentos-leads/`;

function fixture() {
  const requests = [];
  const context = vm.createContext({
    URL,
    SUPABASE_URL: project,
    currentLote: { id: 'lot-a' },
    sanitizeUrl: value => value,
    supabaseClient: {
      storage: {
        from: bucket => ({
          createSignedUrl: async (key, ttl) => {
            requests.push({ bucket, key, ttl });
            return { data: { signedUrl: `${project}/signed-fixture` }, error: null };
          },
        }),
      },
    },
  });
  signDocument.runInContext(context);
  return { requests, sign: context.crearUrlDocumentoPrivado };
}

test('el panel firma documentos propios en rutas actuales y URL antiguas del mismo proyecto', async () => {
  const { sign, requests } = fixture();
  assert.equal(await sign('lot-a/lead-7/identificacion.pdf'), `${project}/signed-fixture`);
  assert.equal(await sign(`${legacyPrefix}lot-a/comprobante%20legado.pdf`), `${project}/signed-fixture`);
  assert.deepEqual(requests, [
    { bucket: 'documentos-leads', key: 'lot-a/lead-7/identificacion.pdf', ttl: 300 },
    { bucket: 'documentos-leads', key: 'lot-a/comprobante legado.pdf', ttl: 300 },
  ]);
});

test('el panel rechaza rutas ambiguas o ajenas antes de pedir una firma', async () => {
  const { sign, requests } = fixture();
  for (const key of [
    'lot-a/../lot-b/identificacion.pdf',
    'lot-a/./identificacion.pdf',
    'lot-a/%2e%2e/lot-b/identificacion.pdf',
    'lot-a/%252e%252e/lot-b/identificacion.pdf',
    'lot-a/lead%2F..%2Fidentificacion.pdf',
    'lot-a/lead%5C..%5Cidentificacion.pdf',
    'lot-a//identificacion.pdf',
    'lot-a/',
    'lot-a/a%00.pdf',
    '/lot-a/identificacion.pdf',
    'lot-b/identificacion.pdf',
    `${legacyPrefix}lot-a/%2e%2e/lot-a/identificacion.pdf`,
    'https://other.test/storage/v1/object/public/documentos-leads/lot-a/identificacion.pdf',
  ]) {
    assert.equal(await sign(key), '', key);
  }
  assert.deepEqual(requests, []);
});
