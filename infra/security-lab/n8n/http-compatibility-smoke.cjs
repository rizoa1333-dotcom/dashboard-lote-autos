const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const zlib = require('node:zlib');
const { planPackageSlots } = require('/opt/velodrive-security/harden-runtime.cjs');
const store = '/usr/local/lib/node_modules/n8n/node_modules/.pnpm';
const slots = planPackageSlots(fs.readdirSync(store));
const load = slot => require(`${store}/${slot.directory}/node_modules/${slot.packageName}`);

function send(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: 'POST', headers, timeout: 4000 }, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; if (text.length > 8192) response.destroy(Error('RESPONSE_LIMIT')); });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, text }));
    });
    request.on('timeout', () => request.destroy(Error('REQUEST_TIMEOUT')));
    request.on('error', reject);
    request.end(body);
  });
}

async function main() {
  const parser = load(slots.find(slot => slot.packageName === 'body-parser'));
  const multer = load(slots.find(slot => slot.packageName === 'multer'));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024, files: 1, fields: 2 } }).single('photo');
  const json = parser.json({ limit: '1kb' });
  const received = [];
  const server = http.createServer((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { location: `http://localhost:${server.address().port}/destination` }).end();
      return;
    }
    if (request.url === '/destination') {
      received.push(request.headers);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    const done = error => {
      response.setHeader('Content-Type', 'application/json');
      if (error) { response.writeHead(error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status || 400).end('{"error":"fixture rejected"}'); return; }
      response.end(JSON.stringify(request.url === '/upload'
        ? { bytes: request.file?.size, title: request.body?.title }
        : { ok: request.body?.ok === true }));
    };
    if (request.url === '/upload') upload(request, response, done);
    else json(request, response, done);
  });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const agents = [];
  try {
    const headers = { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' };
    const valid = zlib.gzipSync('{"ok":true}');
    assert.equal((await send(base, valid, headers)).status, 200);
    assert.equal((await send(base, Buffer.concat([valid, Buffer.from('trailing data')]), headers)).status, 400);
    assert.equal((await send(base, zlib.gzipSync(JSON.stringify({ text: 'x'.repeat(8192) })), headers)).status, 413);
    const multipart = size => Buffer.from('--qa-boundary\r\nContent-Disposition: form-data; name="title"\r\n\r\nQA\r\n--qa-boundary\r\nContent-Disposition: form-data; name="photo"; filename="qa.jpg"\r\nContent-Type: image/jpeg\r\n\r\n' + 'x'.repeat(size) + '\r\n--qa-boundary--\r\n');
    const multipartHeaders = { 'Content-Type': 'multipart/form-data; boundary=qa-boundary' };
    const uploaded = await send(base+'/upload', multipart(64), multipartHeaders);
    assert.equal(uploaded.status, 200);
    assert.deepEqual(JSON.parse(uploaded.text), { bytes: 64, title: 'QA' });
    assert.equal((await send(base+'/upload', multipart(2048), multipartHeaders)).status, 413);

    for (const slot of slots.filter(slot => slot.packageName === 'follow-redirects')) {
      const redirects = load(slot);
      await new Promise((resolve, reject) => {
        const request = redirects.http.get(base+'/redirect', {
          headers: { authorization: 'QA-NOT-A-REAL-SECRET', 'x.auth|private': 'QA-PRIVATE-FIXTURE', 'x-preserved': 'QA' },
          sensitiveHeaders: ['x.auth|private'], timeout: 4000,
        }, response => { response.resume(); response.on('end', resolve); response.on('error', reject); });
        request.on('error', reject);
        request.on('timeout', () => request.destroy(Error('REDIRECT_TIMEOUT')));
      });
      const last = received.at(-1);
      assert.equal(last.authorization, undefined);
      assert.equal(last['x.auth|private'], undefined);
      assert.equal(last['x-preserved'], 'QA');
    }
    for (const slot of slots.filter(slot => slot.packageName === 'undici')) {
      const client = load(slot), agent = new client.Agent({ connections: 1 });
      agents.push(agent);
      const response = await client.request(base, { dispatcher: agent, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ok":true}', headersTimeout: 4000, bodyTimeout: 4000 });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(await response.body.json(), { ok: true });
    }
    const packages = fs.readFileSync('/lib/apk/db/installed', 'utf8');
    assert.match(packages, /P:brotli-libs\nV:1\.2\.1-r0\n/);
    assert.match(packages, /P:libcurl\nV:8\.23\.0-r0\n/);
    assert.equal(fs.existsSync('/opt/velodrive-apk'), false);
    console.log(JSON.stringify({ compressedJson: true, corruptGzipRejected: true, decodedLimitEnforced: true,
      multipartUpload: true, fileSizeLimit: true, sensitiveHeadersStripped: received.length,
      undiciBranches: 2, systemVersions: true, temporaryPackageManagerRemoved: true, network: 'loopback-only in network-none container' }));
  } finally {
    await Promise.allSettled(agents.map(agent => agent.close()));
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
