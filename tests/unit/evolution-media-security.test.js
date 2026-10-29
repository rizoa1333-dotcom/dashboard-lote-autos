const test = require('node:test');
const assert = require('node:assert/strict');
const { createSecureMediaClient, assertWhatsAppMediaUrl } = require('../../infra/security-lab/evolution/secure-media.cjs');
const publicAddress = { address: '8.8.8.8', family: 4 };

function fixture(reply = () => new Response('fixture')) {
  const calls = [];
  let lookup, destroyed = 0;
  const client = createSecureMediaClient({
    lookup: async () => [publicAddress],
    makeAgent(options) { lookup = options.connect.lookup; return { async destroy() { destroyed++; } }; },
    async fetch(url, options) { calls.push({ url: String(url), options }); return reply(calls.length); },
  });
  return { client, calls, getLookup: () => lookup, getDestroyed: () => destroyed };
}

test('media denies non-HTTPS, credentials, private literals and nonstandard ports before transport', async () => {
  const f = fixture();
  for (const url of ['http://example.com/a', 'https://127.0.0.1/a', 'https://169.254.169.254/a', 'https://[::1]/a', 'https://[::ffff:127.0.0.1]/a', 'https://user:secret@example.com/a', 'https://example.com:8443/a', 'file:///etc/passwd']) {
    await assert.rejects(() => f.client.get(url), /MEDIA_DESTINATION_REJECTED/);
  }
  assert.equal(f.calls.length, 0);
});

test('media preserves public HTTPS bytes and installs a rejecting DNS lookup in the actual dispatcher', async () => {
  const f = fixture();
  const result = await f.client.get('https://example.com/photo');
  assert.equal(result.data.toString(), 'fixture');
  assert.equal(f.calls[0].options.redirect, 'manual');
  assert.equal(typeof f.getLookup(), 'function');
  assert.equal(f.getDestroyed(), 1);
});

test('media bounds URL length and never lets headers override the destination host', async () => {
  const f = fixture();
  await assert.rejects(() => f.client.get('https://example.com/' + 'x'.repeat(8192)), /MEDIA_DESTINATION_REJECTED/);
  await f.client.get('https://example.com/photo', { headers: { Host: 'internal.invalid', 'Proxy-Authorization': 'FAKE_PROXY', Range: 'bytes=0-' } });
  assert.equal(f.calls[0].options.headers.get('host'), null);
  assert.equal(f.calls[0].options.headers.get('proxy-authorization'), null);
  assert.equal(f.calls[0].options.headers.get('range'), 'bytes=0-');
});

test('media rejects private or mixed DNS results at connection time', async () => {
  let connectLookup;
  const client = createSecureMediaClient({
    lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.2', family: 4 }],
    makeAgent(options) { connectLookup = options.connect.lookup; return { async destroy() {} }; },
    fetch: async () => new Response('fixture'),
  });
  await client.get('https://example.com/photo');
  await assert.rejects(() => new Promise((resolve, reject) => connectLookup('example.com', { all: true }, (error, value) => error ? reject(error) : resolve(value))), /MEDIA_DESTINATION_REJECTED/);
});

test('media rejects redirects to private destinations and strips credentials on a public host change', async () => {
  const blocked = fixture(() => new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } }));
  await assert.rejects(() => blocked.client.get('https://example.com/photo'), /MEDIA_DESTINATION_REJECTED/);
  assert.equal(blocked.calls.length, 1);
  const f = fixture(number => number === 1 ? new Response(null, { status: 302, headers: { Location: 'https://other.example/photo' } }) : new Response('ok'));
  await f.client.get('https://example.com/photo', { headers: { Authorization: 'FAKE_FIXTURE', Cookie: 'FAKE_FIXTURE', Origin: 'https://web.whatsapp.com', Range: 'bytes=0-' } });
  assert.equal(f.calls[1].options.headers.get('authorization'), null);
  assert.equal(f.calls[1].options.headers.get('cookie'), null);
  assert.equal(f.calls[1].options.headers.get('range'), 'bytes=0-');
  assert.equal(f.calls[1].options.headers.get('origin'), 'https://web.whatsapp.com');
});

test('media bounds declared and streamed bytes and does not accept an alternate proxy', async () => {
  const declared = fixture(() => new Response('x', { headers: { 'content-length': String(16 * 1024 * 1024 + 1) } }));
  await assert.rejects(() => declared.client.get('https://example.com/photo'), /MEDIA_TOO_LARGE/);
  const streamed = fixture(() => new Response(new Uint8Array(16 * 1024 * 1024 + 1)));
  await assert.rejects(() => streamed.client.get('https://example.com/photo'), /MEDIA_TOO_LARGE/);
  const f = fixture();
  await assert.rejects(() => f.client.get('https://example.com/photo', { httpsAgent: {} }), /MEDIA_PROXY_UNSUPPORTED/);
  assert.equal(f.calls.length, 0);
});

test('incoming encrypted media accepts only WhatsApp CDN origins', () => {
  assert.doesNotThrow(() => assertWhatsAppMediaUrl('https://mmg.whatsapp.net/v/t62/file.enc'));
  assert.throws(() => assertWhatsAppMediaUrl('https://whatsapp.net.attacker.example/file.enc'), /MEDIA_DESTINATION_REJECTED/);
  assert.throws(() => assertWhatsAppMediaUrl('https://example.com/file.enc'), /MEDIA_DESTINATION_REJECTED/);
});

test('live media streams propagate download errors and release capacity after cancellation', async () => {
  const large = fixture(() => new Response(new Uint8Array(16 * 1024 * 1024 + 1)));
  const stream = await large.client.stream('https://example.com/photo');
  await assert.rejects(async () => { for await (const chunk of stream) void chunk; }, /MEDIA_TOO_LARGE/);
  const f = fixture(number => number <= 4 ? new Response(new ReadableStream({ start() {} })) : new Response('recovered'));
  const held = await Promise.all(Array.from({ length: 4 }, () => f.client.stream('https://example.com/photo')));
  await assert.rejects(() => f.client.get('https://example.com/photo'), /MEDIA_DOWNLOAD_CAPACITY/);
  for (const value of held) value.destroy();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.client.get('https://example.com/photo')).data.toString(), 'recovered');
});
