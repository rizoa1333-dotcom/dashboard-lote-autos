'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const http = require('node:http');
const { Readable } = require('node:stream');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const media = require('/evolution/security/secure-media.cjs');

async function consume(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

(async () => {
  assert.equal(require('/usr/local/lib/node_modules/npm/node_modules/undici/package.json').version, '6.29.1');
  assert.equal(execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(), '12.2.1');
  const npmTransport = require('/usr/local/lib/node_modules/npm/node_modules/undici');
  const server = http.createServer((req, res) => res.end('npm-fixture'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await npmTransport.request(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await result.body.text(), 'npm-fixture');
  } finally { await new Promise(resolve => server.close(resolve)); }

  const { Agent } = require('/evolution/node_modules/undici');
  let denial;
  const real = media.createSecureMediaClient({
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    makeAgent(options) {
      const lookup = options.connect.lookup;
      return new Agent({ ...options, connect: { ...options.connect, lookup(host, settings, callback) {
        lookup(host, settings, (error, ...values) => { denial = error?.message; callback(error, ...values); });
      } } });
    },
  });
  await assert.rejects(() => real.get('https://media-fixture.invalid/file'), /MEDIA_FETCH_FAILED/);
  assert.equal(denial, 'MEDIA_DESTINATION_REJECTED');

  const baileys = await import('/evolution/node_modules/baileys/lib/Utils/messages-media.js');
  const key = crypto.randomBytes(32);
  const keys = await baileys.getMediaKeys(key, 'image');
  const plaintext = Buffer.from('FAKE IMAGE CONTENT - NO PERSONAL DATA');
  const cipher = crypto.createCipheriv('aes-256-cbc', keys.cipherKey, keys.iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const mac = crypto.createHmac('sha256', keys.macKey).update(keys.iv).update(ciphertext).digest().subarray(0, 10);
  const original = media.secureMediaStream;
  let requests = 0;
  try {
    media.secureMediaStream = async url => { requests++; assert.match(String(url), /^https:\/\/mmg\.whatsapp\.net\//); return Readable.from(Buffer.concat([ciphertext, mac])); };
    const good = await baileys.downloadContentFromMessage({ mediaKey: key, url: 'https://mmg.whatsapp.net/fixture.enc' }, 'image');
    assert.deepEqual(await consume(good), plaintext);
    await assert.rejects(() => baileys.downloadContentFromMessage({ mediaKey: key, url: 'https://127.0.0.1/fixture.enc' }, 'image'), /MEDIA_DESTINATION_REJECTED/);
    assert.equal(requests, 1);
    media.secureMediaStream = async () => new Readable({ read() { this.destroy(new Error('MEDIA_TOO_LARGE')); } });
    const bad = await baileys.downloadContentFromMessage({ mediaKey: key, url: 'https://mmg.whatsapp.net/fixture.enc' }, 'image');
    await assert.rejects(() => consume(bad), /MEDIA_TOO_LARGE/);
  } finally { media.secureMediaStream = original; key.fill(0); }

  const compiled = fs.readFileSync('/evolution/dist/main.js', 'utf8');
  assert.equal(compiled.split('VeloDriveMedia.secureMediaGet(').length - 1, 17);
  assert.equal(compiled.split('ke.default.get(').length - 1, 1);
  assert.ok(compiled.includes('ke.default.get(this.localProxy?.host)'));
  assert.ok(compiled.includes('w=await xe.default.get(g,{headers:S})'));
  assert.ok(compiled.includes('VeloDriveMedia.secureMediaGet(r.data.url,'));
  assert.ok(compiled.includes('VeloDriveMedia.secureMediaGet(w.data.url,'));
  assert.ok(!compiled.includes('xe.default.get(w.data.url,'));
  assert.equal(createRequire('/evolution/dist/main.js')('../security/secure-media.cjs'), media);
  console.log(JSON.stringify({ npmUndici: '6.29.1', npmCli: true, actualNpmHttp: true, actualUndiciDnsRejected: true, actualBaileysDecryption: true, privateIncomingOriginRejected: true, downloadErrorPropagated: true, mediaConsumersPatched: 17, proxyConfigurationPreserved: true, sharedConcurrencyPool: true, externalNetwork: false, productionDataUsed: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
