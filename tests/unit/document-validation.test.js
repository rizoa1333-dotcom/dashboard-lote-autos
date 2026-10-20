const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDocument } = require('../../document-validation');

test('rechaza un cuerpo de mas de 10 MiB sin intentar reservar bytes decodificados', () => {
  const input = 'A'.repeat(4 * Math.ceil((10 * 1024 * 1024 + 1) / 3));
  const result = validateDocument(input, 'image/jpeg');
  assert.equal(result.ok, false); assert.match(result.message, /10 MB/);
  assert.equal(result.buffer, undefined);
});

test('el limite incluye padding: acepta exactamente 10 MiB y rechaza un byte adicional', () => {
  const bytes = Buffer.alloc(10 * 1024 * 1024); bytes.set([255,216,255]);
  const result = validateDocument(bytes.toString('base64'), 'image/jpeg');
  assert.equal(result.ok, true); assert.equal(result.buffer.length, 10485760);
  assert.equal(validateDocument(Buffer.concat([bytes,Buffer.from([0])]).toString('base64'), 'image/jpeg').ok, false);
});

test('tipos no admitidos, longitudes falsas y bits base64 no canonicos se rechazan', () => {
  assert.equal(validateDocument('YWJ=', 'image/jpeg').ok, false);
  assert.equal(validateDocument(null, 'text/html').ok, false);
  assert.equal(validateDocument(null, 'application/pdf', -1).ok, false);
  assert.equal(validateDocument(null, 'application/pdf', { low: 0, high: 1 }).ok, false);
});
