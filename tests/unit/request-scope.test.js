const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequestScope } = require('../../ui-feedback');

test('invalidar el contexto aborta peticiones y rechaza una respuesta tardia aunque el transporte ignore abort', async () => {
  let resolve;
  let signal;
  const scope = createRequestScope((_url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); });
  const request = scope.fetch('/rest/v1/cars');
  scope.reset();
  assert.equal(signal.aborted, true);
  resolve(new Response('[]'));
  await assert.rejects(request, { name: 'AbortError' });
});

test('invalidar despues de recibir headers tambien rechaza un body tardio', async () => {
  let finish;
  const scope = createRequestScope(async () => ({ ok: true, status: 200, json: () => new Promise(done => { finish = done; }) }));
  const response = await scope.fetch('/rest/v1/leads');
  const body = response.json();
  scope.reset();
  finish([{ name: 'Tenant anterior' }]);
  await assert.rejects(body, { name: 'AbortError' });
});

test('una nueva generacion puede consultar sin reutilizar la señal cancelada', async () => {
  const scope = createRequestScope(async (_url, options) => { assert.equal(options.signal.aborted, false); return new Response('{"ok":true}'); });
  scope.reset();
  assert.deepEqual(await (await scope.fetch('/rest/v1/cars')).json(), { ok: true });
});
