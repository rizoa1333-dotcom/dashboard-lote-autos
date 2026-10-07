const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const app = require('../../server');

test('la ruta de ui-feedback.js declara MIME JavaScript y apunta al archivo correcto', () => {
  const route = app._router.stack.find((layer) => layer.route?.path === '/ui-feedback.js');
  assert.ok(route, 'debe existir una ruta explícita antes del fallback SPA');

  const handler = route.route.stack.at(-1).handle;
  const headers = {};
  let mimeType = '';
  let sentFile = '';
  const response = {
    setHeader(name, value) { headers[name] = value; return this; },
    type(value) { mimeType = value; return this; },
    sendFile(value) { sentFile = value; return this; }
  };

  handler({}, response);

  assert.equal(mimeType, 'application/javascript');
  assert.equal(headers['Cache-Control'], 'no-cache');
  assert.equal(sentFile, path.join(__dirname, '..', '..', 'ui-feedback.js'));
});
