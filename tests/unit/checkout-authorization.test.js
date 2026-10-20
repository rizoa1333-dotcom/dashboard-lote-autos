const test = require('node:test');
const assert = require('node:assert/strict');
let api = {};
try { api = require('../../checkout-authorization'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const lotId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const secret = 'whsec_test_only_123456789012345678901234';
const input = { lotId, ownerId, paymentLinkId: 'plink_live', secret, now: 1800000000 };

test('referencia de Checkout es firmada, limitada a caracteres Stripe y vinculada al dueño/enlace', () => {
  assert.equal(typeof api.createCheckoutReference, 'function');
  const reference = api.createCheckoutReference(input);
  assert.match(reference, /^[A-Za-z0-9_-]{1,200}$/);
  assert.deepEqual(api.verifyCheckoutReference({ reference, secret, paymentLinkId: 'plink_live', created: input.now }), { lotId, ownerId });
  for (const overrides of [
    { reference: reference.replace(lotId, otherId) },
    { reference: reference.replace(ownerId, otherId) },
    { paymentLinkId: 'plink_qa' }, { secret: `${secret}other` },
    { created: input.now + 3601 }, { created: input.now - 1 }, { reference: lotId }
  ]) assert.equal(api.verifyCheckoutReference({ reference, secret, paymentLinkId: 'plink_live', created: input.now, ...overrides }), null);
});

test('dos compras generan referencias distintas sin incluir email ni credenciales', () => {
  assert.equal(typeof api.createCheckoutReference, 'function');
  const a = api.createCheckoutReference(input), b = api.createCheckoutReference(input);
  assert.notEqual(a, b);
  assert.equal(a.includes(secret), false);
  assert.throws(() => api.createCheckoutReference({ ...input, lotId: '%' }), /INVALID_CHECKOUT/);
});

test('endpoint de enlace exige JWT y resuelve propietario antes de construir la URL', async () => {
  assert.equal(typeof api.createCheckoutLinkHandler, 'function');
  const calls = [];
  const env = { SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon', STRIPE_WEBHOOK_SECRET: secret,
    STRIPE_PRODUCTION_PAYMENT_LINK_ID: 'plink_live', STRIPE_QA_PAYMENT_LINK_ID: 'plink_qa', STRIPE_QA_EMAIL: 'qa@example.com' };
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return { ok: true, json: async () => String(url).includes('/auth/v1/user') ? { id: ownerId, email: 'owner@example.com' }
      : [{ id: lotId, profile_id: ownerId, email_admin: 'owner@example.com' }] };
  };
  const handler = api.createCheckoutLinkHandler({ env, fetchImpl });
  function response() { return { code: 200, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; } }; }
  const unauth = response();
  await handler({ body: { lote_id: lotId }, get: () => '' }, unauth);
  assert.equal(unauth.code, 401); assert.equal(calls.length, 0);
  const valid = response();
  await handler({ body: { lote_id: lotId }, get: () => 'Bearer user-jwt' }, valid);
  assert.equal(valid.code, 200);
  assert.equal(calls[1].url.searchParams.get('profile_id'), `eq.${ownerId}`);
  assert.equal(new URL(valid.body.url).origin, 'https://buy.stripe.com');
  const ref = new URL(valid.body.url).searchParams.get('client_reference_id');
  assert.notEqual(ref, lotId);
  const forbidden = response();
  await handler({ body: { lote_id: lotId, qa: true }, get: () => 'Bearer user-jwt' }, forbidden);
  assert.equal(forbidden.code, 403);
});

test('una cuenta con suscripción vinculada debe usar el portal, sin crear otra compra', async () => {
  const env = { SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'anon',STRIPE_WEBHOOK_SECRET:secret,
    STRIPE_PRODUCTION_PAYMENT_LINK_ID:'plink_live' };
  const fetchImpl=async url=>({ok:true,json:async()=>String(url).includes('/auth/v1/user')
    ? {id:ownerId,email:'owner@example.com'}
    : [{id:lotId,profile_id:ownerId,email_admin:'owner@example.com',stripe_subscription_id:'sub_existing'}]});
  const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
  await api.createCheckoutLinkHandler({env,fetchImpl})({body:{lote_id:lotId},get:()=> 'Bearer owner-jwt'},res);
  assert.equal(res.code,409);
  assert.equal(res.body.code,'SUBSCRIPTION_ALREADY_LINKED');
  assert.equal(res.body.url,undefined);
});

test('sesión inválida y respuesta de otro dueño nunca generan un enlace', async () => {
  for(const scenario of ['invalid-session','other-owner']) {
    const env={SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'anon',STRIPE_WEBHOOK_SECRET:secret,
      STRIPE_PRODUCTION_PAYMENT_LINK_ID:'plink_live'};
    const fetchImpl=async url=>String(url).includes('/auth/v1/user')
      ? {ok:scenario!=='invalid-session',json:async()=>({id:ownerId,email:'owner@example.com'})}
      : {ok:true,json:async()=>[{id:lotId,profile_id:otherId,email_admin:'owner@example.com'}]};
    const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
    await api.createCheckoutLinkHandler({env,fetchImpl})({body:{lote_id:lotId},get:()=> 'Bearer invalid'},res);
    assert.equal(res.code,scenario==='invalid-session'?401:403);
    assert.equal(res.body.url,undefined);
  }
});
