const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../../server');

const envKeys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_BASE_URL'];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;
const registrationHandler = app._router.stack
  .find((layer) => layer.route?.path === '/api/register-lote')
  .route.stack.at(-1).handle;

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function postRegister(body) {
  const response = {
    statusCode: 200,
    result: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.result = value; return this; }
  };
  await registrationHandler({ body }, response);
  return { status: response.statusCode, body: response.result };
}

function validPayload() {
  return {
    email: 'qa@example.com',
    password: 'correct-horse-123',
    datosLote: { nombre: 'Lote de prueba', whatsapp_number: '523121234567' },
    legalConsent: { version: 'qa-v1', accepted_at: '2026-10-07T00:00:00.000Z', terms: true, privacy: true }
  };
}

test.before(async () => {
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.APP_BASE_URL = 'https://velodrive.test';
});

test.after(async () => {
  global.fetch = originalFetch;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test('si falta email_admin en el esquema, revierte la cuenta Auth e informa cómo corregirlo', async () => {
  const calls = [];
  let authUserExists = false;
  let lotExists = false;
  global.fetch = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url.pathname.endsWith('/auth/v1/signup')) {
      authUserExists = true;
      return jsonResponse(200, { user: { id: 'user-123', email: 'qa@example.com' }, session: { access_token: 'access', refresh_token: 'refresh' } });
    }
    if (url.pathname === '/rest/v1/lotes' && options.method === 'POST') {
      const inserted = JSON.parse(options.body);
      assert.equal(inserted.email_admin, 'qa@example.com');
      return jsonResponse(400, { code: 'PGRST204', message: "Could not find the 'email_admin' column of 'lotes' in the schema cache" });
    }
    if (url.pathname === '/rest/v1/lotes' && options.method === 'DELETE') {
      lotExists = false;
      return jsonResponse(204, null);
    }
    if (url.pathname === '/auth/v1/admin/users/user-123' && options.method === 'DELETE') {
      authUserExists = false;
      return jsonResponse(200, { user: { id: 'user-123' } });
    }
    throw new Error(`Unexpected mocked request ${options.method} ${url}`);
  };

  const response = await postRegister(validPayload());
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'EMAIL_ADMIN_COLUMN_MISSING');
  assert.equal(response.body.rollbackOk, true);
  assert.match(response.body.message, /email_admin/);
  assert.equal(authUserExists, false);
  assert.equal(lotExists, false);
  assert.equal(calls.some((call) => call.url.pathname.endsWith('/auth/v1/admin/users/user-123')), true);
});

test('un correo duplicado devuelve 422 sin insertar lote ni borrar la cuenta existente', async () => {
  const calls = [];
  global.fetch = async (input, options = {}) => {
    const url = new URL(input);
    calls.push(url.pathname);
    if (url.pathname.endsWith('/auth/v1/signup')) return jsonResponse(422, { msg: 'User already registered' });
    throw new Error(`No debe llamarse: ${url.pathname}`);
  };
  const response = await postRegister(validPayload());
  assert.equal(response.status, 422);
  assert.equal(response.body.code, 'EMAIL_ALREADY_REGISTERED');
  assert.match(response.body.message, /Inicia sesión/);
  assert.deepEqual(calls, ['/auth/v1/signup']);
});

test('si Auth devuelve un error 422 distinto a duplicado, no confunde el mensaje', async () => {
  global.fetch = async () => jsonResponse(422, { msg: 'Password does not meet requirements' });
  const response = await postRegister(validPayload());
  assert.equal(response.status, 422);
  assert.equal(response.body.code, 'AUTH_SIGNUP_FAILED');
  assert.match(response.body.message, /Password/);
});

test('crea cuenta y lote, incluyendo sesión para continuar al checkout', async () => {
  global.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/signup')) return jsonResponse(200, {
      user: { id: 'user-123', email: 'qa@example.com' },
      session: { access_token: 'access', refresh_token: 'refresh' }
    });
    if (url.pathname === '/rest/v1/lotes' && options.method === 'POST') {
      const inserted = JSON.parse(options.body);
      assert.equal(inserted.profile_id, 'user-123');
      assert.equal(inserted.email_admin, 'qa@example.com');
      return jsonResponse(201, [{ id: 'lot-123', ...inserted }]);
    }
    throw new Error(`Unexpected mocked request ${url.pathname}`);
  };
  const response = await postRegister(validPayload());
  assert.equal(response.status, 201);
  assert.equal(response.body.lote.id, 'lot-123');
  assert.equal(response.body.requiresEmailConfirmation, false);
  assert.equal(response.body.session.access_token, 'access');
});

test('rechaza el consentimiento legal incompleto antes de contactar Supabase', async () => {
  let called = false;
  global.fetch = async () => { called = true; throw new Error('No debe llamarse'); };
  const payload = validPayload();
  payload.legalConsent.privacy = false;
  const response = await postRegister(payload);
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'LEGAL_CONSENT_REQUIRED');
  assert.equal(called, false);
});

test('signup REST conserva tokens en raíz para continuar al pago', async () => {
  global.fetch = async (input, options = {}) => {
    if (new URL(input).pathname === '/auth/v1/signup') return jsonResponse(200, {
      access_token: 'rest-access', refresh_token: 'rest-refresh', expires_in: 3600,
      token_type: 'bearer', user: { id: 'user-123', email: 'qa@example.com', identities: [{ id: 'new-identity' }] }
    });
    if (options.method === 'POST') return jsonResponse(201, [{ id: 'lot-123' }]);
    throw new Error('Unexpected cleanup');
  };
  const result = await postRegister(validPayload());
  assert.equal(result.status, 201);
  assert.equal(result.body.session?.access_token, 'rest-access');
  assert.equal(result.body.requiresEmailConfirmation, false);
});

test('signup REST con confirmación crea el lote usando usuario en raíz', async () => {
  let inserted;
  global.fetch = async (input, options = {}) => {
    if (new URL(input).pathname === '/auth/v1/signup') return jsonResponse(200, {
      id: 'new-confirmed-later', email: 'qa@example.com', identities: [{ id: 'new-identity' }]
    });
    inserted = JSON.parse(options.body);
    return jsonResponse(201, [{ id: 'lot-123' }]);
  };
  const result = await postRegister(validPayload());
  assert.equal(result.status, 201);
  assert.equal(inserted.profile_id, 'new-confirmed-later');
  assert.equal(result.body.requiresEmailConfirmation, true);
});

test('usuario duplicado ofuscado no autoriza insertar ni borrar una cuenta existente', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return jsonResponse(200, { id: 'existing-obfuscated', email: 'qa@example.com', identities: [] });
  };
  const result = await postRegister(validPayload());
  assert.equal(result.status, 422);
  assert.equal(result.body.code, 'EMAIL_ALREADY_REGISTERED');
  assert.equal(calls, 1);
});

test('respuesta Auth 200 sin usuario válido produce 502 y no un error con HTTP 200', async () => {
  global.fetch = async () => jsonResponse(200, {});
  assert.equal((await postRegister(validPayload())).status, 502);
});
