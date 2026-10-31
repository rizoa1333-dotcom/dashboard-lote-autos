'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');
const { Worker } = require('node:worker_threads');

async function redirectCheck() {
  let received;
  const target = http.createServer((req, res) => { received = req.headers; res.end('fixture'); });
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  const origin = http.createServer((_req, res) => { res.writeHead(302, { Location: 'http://127.0.0.1:' + target.address().port + '/' }); res.end(); });
  try {
    await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
    const { http: redirects } = require('follow-redirects');
    const result = await new Promise((resolve, reject) => {
      const request = redirects.get('http://127.0.0.1:' + origin.address().port + '/', {
        headers: { 'X-QA-Key': 'FAKE_LOCAL_ONLY', 'X-Harmless': 'fixture' },
        sensitiveHeaders: vm.runInNewContext("['X-QA-Key']"), timeout: 3000,
      }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
      request.once('error', reject); request.once('timeout', () => request.destroy(new Error('FIXTURE_TIMEOUT')));
    });
    assert.equal(result, 200); assert.equal(received['x-qa-key'], undefined); assert.equal(received['x-harmless'], 'fixture');
    return true;
  } finally {
    for (const server of [origin, target]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
}

async function decoderCheck() {
  const filename = require.resolve('query-string');
  const query = require(filename);
  assert.equal(query.parse('name=%C3%81ngel&space=a+b').name, 'Ángel');
  assert.equal(query.parse('name=%C3%81ngel&space=a+b').space, 'a b');
  assert.equal(typeof query.parse('bad=%FF%41').bad, 'string');
  assert.equal(typeof require('minio').Client, 'function');
  const code = `const { parentPort, workerData } = require('node:worker_threads');
    const query = require(workerData.filename);
    const runs = Array.from({length:50000}, (_,i) => '%FF' + [...String(i)].map(c => '%' + c.charCodeAt(0).toString(16)).join('') + '!').join('');
    const output = query.parse('value=' + runs);
    parentPort.postMessage({bytes:runs.length, decoded:typeof output.value === 'string'});`;
  const worker = new Worker(code, { eval: true, workerData: { filename }, resourceLimits: { maxOldGenerationSizeMb: 96 } });
  let timer;
  try {
    const result = await Promise.race([
      new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); worker.once('exit', status => { if (status) reject(new Error('DECODER_WORKER_FAILED')); }); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DECODER_WORK_LIMIT')), 5000); }),
    ]);
    assert.equal(result.decoded, true); assert.ok(result.bytes > 250000);
    return true;
  } finally { clearTimeout(timer); await worker.terminate(); }
}

(async () => {
  const results = { crossRealmProtected: false, decoderBounded: false, minioCjsCompatible: false, productionData: false, externalNetwork: false };
  try { results.crossRealmProtected = await redirectCheck(); } catch (error) { results.redirectFailure = error.code === 'ERR_ASSERTION' ? 'HEADER_NOT_STRIPPED' : 'FIXTURE_FAILED'; }
  try { results.minioCjsCompatible = typeof require('query-string').parse('v=%C3%A1').v === 'string' && typeof require('minio').Client === 'function'; } catch {}
  try { results.decoderBounded = await decoderCheck(); } catch (error) { results.decoderFailure = error.message === 'DECODER_WORK_LIMIT' ? 'DECODER_WORK_LIMIT' : 'DECODER_COMPATIBILITY_FAILED'; }
  console.log(JSON.stringify(results));
  if (!results.crossRealmProtected || !results.decoderBounded) process.exitCode = 1;
})().catch(() => { console.error('URI_COMPATIBILITY_NOT_COMPLETED'); process.exitCode = 1; });
