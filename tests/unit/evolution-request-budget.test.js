const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createRequestBudget, parserErrorHandler, health } = require('../../infra/security-lab/evolution/request-budget.cjs');
const { hardenHttpParsing, hardenHealthRoute } = require('../../infra/security-lab/evolution/harden-media.cjs');

async function fixture(t, options = {}) {
  const app = express();
  app.use(createRequestBudget(options), express.json({ limit: '1mb' }), express.urlencoded({ extended: true, limit: '64kb', parameterLimit: 1000, depth: 8 }));
  if (parserErrorHandler) app.use(parserErrorHandler);
  app.get('/health', (_, res) => res.json({ ok: true }));
  app.post('/echo', (req, res) => res.json({ accepted: true, fields: Object.keys(req.body || {}).length }));
  const held = [];
  app.post('/hold', (_, res) => held.push(res));
  app.use((error, _req, res, _next) => { if (res.headersSent) res.destroy(); else res.status(error.status || 500).json({ error: 'REQUEST_REJECTED' }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { for (const res of held) if (!res.writableEnded) res.end(); server.closeAllConnections(); server.close(); });
  return { held, url: 'http://127.0.0.1:' + server.address().port };
}

test('Evolution body budget rejects excess concurrent parsing while health and subsequent requests work', async t => {
  const f = await fixture(t, { maxActive: 1, timeoutMs: 3000 });
  const first = fetch(f.url + '/hold', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  while (!f.held.length) await new Promise(resolve => setTimeout(resolve, 5));
  const busy = await fetch(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(busy.status, 503);
  assert.equal((await busy.json()).error, 'REQUEST_CAPACITY');
  assert.equal((await fetch(f.url + '/health')).status, 200);
  f.held[0].json({ done: true });
  assert.equal((await first).status, 200);
  assert.equal((await fetch(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
});

test('Evolution rejects oversized JSON before body parsing and preserves normal metadata', async t => {
  const f = await fixture(t);
  const oversized = await fetch(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ media: 'x'.repeat(1024 * 1024) }) });
  assert.equal(oversized.status, 413);
  const accepted = await fetch(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { key: 'fake', mediaUrl: 'https://example.com/fake.jpg' } }) });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { accepted: true, fields: 1 });
});

test('Evolution terminates an unfinished JSON body and releases its budget', async t => {
  const f = await fixture(t, { maxActive: 1, timeoutMs: 80 });
  const status = await new Promise((resolve, reject) => {
    const request = http.request(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '20' } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
    request.once('error', reject);
    request.write('{');
  });
  assert.equal(status, 408);
  assert.equal((await fetch(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
});

test('HTTP integration replaces only the reviewed oversized parser anchor and rejects drift', () => {
  const original = ',(0,at.urlencoded)({extended:!0,limit:"136mb"}),(0,at.json)({limit:"136mb"}),';
  const result = hardenHttpParsing(original);
  assert.ok(result.includes('VeloDriveRequestBudget.middleware'));
  assert.ok(result.includes('limit:"1mb"'));
  assert.ok(result.includes('limit:"64kb",parameterLimit:1000,depth:8'));
  assert.ok(!result.includes('136mb'));
  assert.throws(() => hardenHttpParsing('changed source'), /MEDIA_CONSUMER_DRIFT/);
});

test('completed JSON bodies do not time out while an authorized response is pending', async t => {
  const f = await fixture(t, { maxActive: 1, timeoutMs: 30 });
  const pending = fetch(f.url + '/hold', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  while (!f.held.length) await new Promise(resolve => setTimeout(resolve, 5));
  await new Promise(resolve => setTimeout(resolve, 80));
  f.held[0].json({ done: true });
  assert.equal((await pending).status, 200);
});

test('an aborted body frees the request budget without waiting for the deadline', async t => {
  const f = await fixture(t, { maxActive: 1, timeoutMs: 3000 });
  await new Promise(resolve => {
    const request = http.request(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '50' } });
    request.on('error', () => {}); request.once('close', resolve);
    request.write('{'); setTimeout(() => request.destroy(), 30);
  });
  let status;
  for (let i = 0; i < 10; i++) {
    const response = await fetch(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    status = response.status; await response.text(); if (status === 200) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(status, 200);
});

test('chunked JSON and oversized or deeply nested forms respect parser limits', async t => {
  const f = await fixture(t);
  const status = await new Promise((resolve, reject) => {
    const request = http.request(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
    request.once('error', reject);
    request.write('{"data":"'); request.write('x'.repeat(1024 * 1024)); request.end('"}');
  });
  assert.equal(status, 413);
  const oversized = await fetch(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + 'x'.repeat(64 * 1024) });
  assert.equal(oversized.status, 413);
  const nested = await fetch(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data' + '[x]'.repeat(12) + '=1' });
  assert.equal(nested.status, 400);
});

test('invalid JSON has a neutral error without reflecting the submitted content', async t => {
  const f = await fixture(t);
  const response = await fetch(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"secret":"DO_NOT_REFLECT",oops' });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'INVALID_REQUEST_BODY' });
});

test('health remains accessible without Origin while business CORS stays strict', async t => {
  const app = express();
  if (health) app.get('/health', health);
  app.use((req, _res, next) => next(req.headers.origin === 'https://allowed.example' ? undefined : new Error('CORS_BLOCK')));
  app.get('/business', (_req, res) => res.sendStatus(401));
  app.use((_error, _req, res, _next) => res.status(500).json({ error: 'CORS_BLOCK' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(base + '/health'); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal((await fetch(base + '/business')).status, 500);
  assert.equal((await fetch(base + '/business', { headers: { Origin: 'https://allowed.example' } })).status, 401);
});

test('native health route is registered before the unchanged CORS middleware', () => {
  assert.equal(typeof hardenHealthRoute, 'function');
  const source = 'await new yt(E).onModuleInit(),s.use((0,Ll.default)({origin(r,a){ORIGINAL_CORS}})';
  const result = hardenHealthRoute(source);
  assert.ok(result.includes('s.get("/health",VeloDriveRequestBudget.health),s.use((0,Ll.default)'));
  assert.ok(result.includes('ORIGINAL_CORS'));
  assert.throws(() => hardenHealthRoute('changed source'), /MEDIA_CONSUMER_DRIFT/);
});
