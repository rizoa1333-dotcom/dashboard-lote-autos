const test = require('node:test');
const assert = require('node:assert/strict');
const { hardenBaileysMedia, hardenEvolutionMedia, rewriteDirectMediaCalls } = require('../../infra/security-lab/evolution/harden-media.cjs');

test('media integration refuses unreviewed vendor code before changing it', () => {
  for (const patch of [hardenBaileysMedia, hardenEvolutionMedia]) {
    assert.throws(() => patch('unreviewed source'), /UNEXPECTED_MEDIA_SOURCE/);
  }
});

test('business metadata remains JSON while the following media download is protected', () => {
  const source = 'w=await xe.default.get(g,{headers:S}),T=await xe.default.get(w.data.url,{headers:{Authorization:`Bearer ${this.token}`},responseType:"arraybuffer"}),A;';
  const result = rewriteDirectMediaCalls(source);
  assert.equal(result.count, 1);
  assert.ok(result.source.includes('w=await xe.default.get(g,{headers:S})'));
  assert.ok(result.source.includes('T=await VeloDriveMedia.secureMediaGet(w.data.url,'));
  assert.ok(!result.source.includes('xe.default.get(w.data.url,'));
});
