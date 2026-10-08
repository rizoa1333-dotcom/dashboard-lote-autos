const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyStripeSignature, getSubscriptionId, getActiveStatus, createStripeWebhookHandler } = require('../../stripe-webhook');

const secret = 'whsec_test_only';
const env = {
  STRIPE_WEBHOOK_SECRET: secret,
  STRIPE_SECRET_KEY: 'sk_test_only',
  STRIPE_ALLOWED_PAYMENT_LINK_IDS: 'plink_qa, plink_live',
  STRIPE_QA_PAYMENT_LINK_ID: 'plink_qa',
  STRIPE_QA_EMAIL: 'qa@example.com',
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service_role_test_only'
};

function signedRequest(event, timestamp = Math.floor(Date.now() / 1000)) {
  const body = Buffer.from(JSON.stringify(event));
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${body.toString()}`).digest('hex');
  return { body, signature: `t=${timestamp},v1=${digest}` };
}

async function invoke(handler, event, fetchImpl) {
  const signed = signedRequest(event);
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  await handler({ body: signed.body, get: (name) => name.toLowerCase() === 'stripe-signature' ? signed.signature : undefined }, response);
  return response;
}

test('valida la firma HMAC, rechaza cuerpo alterado y timestamps fuera de tolerancia', () => {
  const rawBody = Buffer.from('{"id":"evt_1"}');
  const now = 1_800_000_000;
  const digest = crypto.createHmac('sha256', secret).update(`${now}.${rawBody.toString()}`).digest('hex');
  assert.equal(verifyStripeSignature(rawBody, `t=${now},v1=${digest}`, secret, now), true);
  assert.equal(verifyStripeSignature(Buffer.from('{}'), `t=${now},v1=${digest}`, secret, now), false);
  assert.equal(verifyStripeSignature(rawBody, `t=${now - 301},v1=${digest}`, secret, now), false);
});

test('extrae suscripción con esquemas viejos y nuevos de invoice y normaliza estatus', () => {
  assert.equal(getSubscriptionId({ subscription: 'sub_old' }), 'sub_old');
  assert.equal(getSubscriptionId({ parent: { subscription_details: { subscription: 'sub_new' } } }), 'sub_new');
  assert.equal(getActiveStatus('active'), 'active');
  assert.equal(getActiveStatus('past_due'), 'past_due');
  assert.equal(getActiveStatus('canceled'), 'inactive');
});

test('asocia checkout de $10 al lote solo si coincide el enlace y el correo, luego activa con estado de Stripe', async () => {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.hostname === 'api.stripe.com') {
      assert.equal(url.pathname, '/v1/subscriptions/sub_qa');
      return { ok: true, status: 200, json: async () => ({ id: 'sub_qa', customer: 'cus_qa', status: 'active', current_period_end: 1_800_086_400 }) };
    }
    if (url.pathname === '/rest/v1/lotes' && options.method !== 'PATCH') {
      return { ok: true, status: 200, json: async () => [{ id: 'lot-123', email_admin: 'qa@example.com', plan_status: 'inactive', stripe_subscription_id: null }] };
    }
    if (url.pathname === '/rest/v1/lotes' && options.method === 'PATCH') {
      return { ok: true, status: 200, json: async () => [{ id: 'lot-123' }] };
    }
    throw new Error(`Unexpected mocked request ${options.method} ${url}`);
  };
  const handler = createStripeWebhookHandler({ fetchImpl, env });
  const response = await invoke(handler, {
    id: 'evt_checkout', type: 'checkout.session.completed',
    data: { object: {
      mode: 'subscription', payment_link: 'plink_qa', client_reference_id: 'lot-123',
      subscription: 'sub_qa', customer: 'cus_qa', customer_email: 'QA@example.com', payment_status: 'paid'
    } }
  });

  assert.equal(response.statusCode, 200);
  const update = calls.find(({ options }) => options.method === 'PATCH');
  assert.equal(update.url.searchParams.get('id'), 'eq.lot-123');
  assert.deepEqual(JSON.parse(update.options.body), {
    stripe_customer_id: 'cus_qa', stripe_subscription_id: 'sub_qa', plan_status: 'active',
    fecha_vencimiento: new Date(1_800_086_400 * 1000).toISOString()
  });
});

test('ignora checkout con enlace no autorizado o correo que no pertenece al administrador/allowlist QA', async () => {
  let requests = 0;
  const fetchImpl = async (input, options = {}) => {
    requests += 1;
    const url = new URL(input);
    if (url.hostname === 'api.stripe.com') return { ok: true, status: 200, json: async () => ({ id: 'sub_qa', status: 'active' }) };
    if (options.method === 'PATCH') return { ok: true, status: 200, json: async () => [{ id: 'lot-123' }] };
    return { ok: true, status: 200, json: async () => [{ id: 'lot-123', email_admin: 'owner@example.com', plan_status: 'inactive' }] };
  };
  const handler = createStripeWebhookHandler({ fetchImpl, env });
  const base = {
    mode: 'subscription', client_reference_id: 'lot-123', subscription: 'sub_qa', customer: 'cus_qa',
    customer_email: 'stranger@example.com', payment_status: 'paid'
  };

  const wrongLink = await invoke(handler, { id: 'evt_wrong_link', type: 'checkout.session.completed', data: { object: { ...base, payment_link: 'plink_other' } } });
  assert.equal(wrongLink.body.ignored, true);
  assert.equal(requests, 0);

  const wrongEmail = await invoke(handler, { id: 'evt_wrong_email', type: 'checkout.session.completed', data: { object: { ...base, payment_link: 'plink_live' } } });
  assert.equal(wrongEmail.body.reason, 'customer_email_mismatch');
  assert.equal(requests, 1);

  const wrongQaEmail = await invoke(handler, { id: 'evt_wrong_qa_email', type: 'checkout.session.completed', data: { object: {
    ...base, payment_link: 'plink_qa', customer_email: 'owner@example.com'
  } } });
  assert.equal(wrongQaEmail.body.reason, 'qa_email_not_allowed');
  assert.equal(requests, 2);
});

test('rechaza la petición antes de tocar servicios cuando la firma no es válida', async () => {
  let called = false;
  const handler = createStripeWebhookHandler({ fetchImpl: async () => { called = true; }, env });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ body: Buffer.from('{}'), get: () => 't=1,v1=bad' }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test('cancelar la suscripción desactiva el plan y libera el lote para una futura alta', async () => {
  let update;
  const fetchImpl = async (input, options = {}) => {
    update = { url: new URL(input), options };
    return { ok: true, status: 200, json: async () => [{ id: 'lot-123' }] };
  };
  const handler = createStripeWebhookHandler({ fetchImpl, env });
  const response = await invoke(handler, {
    id: 'evt_deleted', type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_qa', customer: 'cus_qa', status: 'canceled', current_period_end: 1_800_086_400 } }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(update.url.searchParams.get('stripe_subscription_id'), 'eq.sub_qa');
  assert.deepEqual(JSON.parse(update.options.body), {
    stripe_customer_id: 'cus_qa', stripe_subscription_id: null, plan_status: 'inactive',
    fecha_vencimiento: new Date(1_800_086_400 * 1000).toISOString()
  });
});
