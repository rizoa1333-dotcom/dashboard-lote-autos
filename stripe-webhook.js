const crypto = require('node:crypto');
const { verifyCheckoutReference } = require('./checkout-authorization');

const SIGNATURE_TOLERANCE_SECONDS = 300;

function verifyStripeSignature(rawBody, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!Buffer.isBuffer(rawBody) || !signatureHeader || !secret) return false;
  const parts = signatureHeader.split(',').map((part) => part.split('='));
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS || signatures.length === 0) return false;

  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest();
  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

function getSubscriptionId(object) {
  return object?.subscription || object?.parent?.subscription_details?.subscription || null;
}

function getActiveStatus(status) {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') return 'past_due';
  return 'inactive';
}

function createStripeWebhookHandler({ fetchImpl = (...args) => fetch(...args), env = process.env } = {}) {
  return async function stripeWebhookHandler(req, res) {
    const secret = env.STRIPE_WEBHOOK_SECRET;
    const stripeKey = env.STRIPE_SECRET_KEY;
    const origin = (env.SUPABASE_URL || '').replace(/\/$/, '');
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const allowed = new Set((env.STRIPE_ALLOWED_PAYMENT_LINK_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
    if (!secret || !stripeKey || !origin || !serviceKey || !allowed.size || !env.STRIPE_QA_PAYMENT_LINK_ID || !env.STRIPE_QA_EMAIL) {
      return res.status(503).json({ error: 'Stripe webhook is not configured.' });
    }
    if (!verifyStripeSignature(req.body, req.get('stripe-signature'), secret)) {
      return res.status(400).json({ error: 'Invalid Stripe signature.' });
    }
    let event;
    try { event = JSON.parse(req.body.toString('utf8')); }
    catch { return res.status(400).json({ error: 'Invalid event body.' }); }
    if (!event || typeof event.id !== 'string' || !/^evt_[A-Za-z0-9]{1,128}$/.test(event.id)) {
      return res.status(400).json({ error: 'Invalid event ID.' });
    }
    const supported = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated',
      'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'];
    if (!supported.includes(event.type)) return res.json({ received: true, ignored: true });
    const object = event.data?.object || {};
    const checkout = event.type === 'checkout.session.completed';
    const serviceHeaders = { apikey: serviceKey, 'Content-Type': 'application/json' };
    if (serviceKey.startsWith('eyJ')) serviceHeaders.Authorization = 'Bearer ' + serviceKey;
    let identity = null;
    let durableCheckout = null;
    if (checkout) {
      if (object.mode !== 'subscription') {
        return res.json({ received: true, ignored: true, reason: 'payment_link_not_allowed' });
      }
      if (!object.payment_link) {
        const match = /^vd_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(object.client_reference_id || '');
        if (!match || !/^cs_[A-Za-z0-9_]{1,200}$/.test(object.id || '')) {
          return res.json({received:true,ignored:true,reason:'invalid_checkout_reference'});
        }
        try {
          const query = new URLSearchParams({select:'id,session_id,lote_id,owner_id,reference,mode,price_id',id:'eq.'+match[1],limit:'1'});
          const response = await fetchImpl(origin + '/rest/v1/checkout_security_sessions?' + query,
            {headers:serviceHeaders,signal:AbortSignal.timeout(15000)});
          if (!response.ok) throw Error('CHECKOUT_LOOKUP_FAILED');
          const rows = await response.json();
          durableCheckout = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
          if (durableCheckout && !durableCheckout.session_id) return res.status(503).json({error:'Checkout is awaiting durable confirmation. Retry later.'});
          if (!durableCheckout || durableCheckout.reference !== object.client_reference_id || durableCheckout.session_id !== object.id
              || !['production','qa'].includes(durableCheckout.mode)) return res.json({received:true,ignored:true,reason:'checkout_session_not_registered'});
          identity = {lotId:durableCheckout.lote_id,ownerId:durableCheckout.owner_id};
        } catch { return res.status(503).json({error:'Checkout verification is temporarily unavailable.'}); }
      } else {
        if (!allowed.has(object.payment_link)) return res.json({received:true,ignored:true,reason:'payment_link_not_allowed'});
        identity = verifyCheckoutReference({ reference: object.client_reference_id, paymentLinkId: object.payment_link, secret, created: object.created });
      }
      if (!identity) return res.json({ received: true, ignored: true, reason: 'invalid_checkout_reference' });
    }
    const subscriptionId = checkout ? object.subscription : event.type.startsWith('customer.subscription.') ? object.id : getSubscriptionId(object);
    if (typeof subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]{1,128}$/.test(subscriptionId)) {
      return res.json({ received: true, ignored: true, reason: 'subscription_missing' });
    }
    const rpc = async (name, data) => {
      const response = await fetchImpl(origin + '/rest/v1/rpc/' + name, {
        method: 'POST', headers: serviceHeaders, body: JSON.stringify(data), signal: AbortSignal.timeout(15000)
      });
      const value = await response.json().catch(() => null);
      if (!response.ok) throw new Error('BILLING_STORE_FAILED');
      return value;
    };
    const lease = { p_event_id: event.id, p_subscription_id: subscriptionId, p_lease_token: crypto.randomUUID() };
    let acquired = false, applied = false;
    try {
      const claim = await rpc('claim_stripe_security_event', lease);
      if (claim?.state === 'duplicate') return res.json({ received: true, duplicate: true });
      if (claim?.state === 'busy') return res.status(503).json({ error: 'Subscription is being reconciled. Retry later.' });
      if (claim?.state !== 'claimed') throw new Error('INVALID_BILLING_CLAIM');
      acquired = true;
      let lot;
      if (checkout) {
        const query = new URLSearchParams({ select: 'id,profile_id,email_admin,stripe_subscription_id', id: 'eq.' + identity.lotId, limit: '1' });
        const lookup = await fetchImpl(origin + '/rest/v1/lotes?' + query, { headers: serviceHeaders, signal: AbortSignal.timeout(15000) });
        if (!lookup.ok) throw new Error('LOT_LOOKUP_FAILED');
        const rows = await lookup.json();
        lot = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
        const email = String(object.customer_details?.email || object.customer_email || '').trim().toLowerCase();
        const qa = durableCheckout ? durableCheckout.mode === 'qa' : object.payment_link === env.STRIPE_QA_PAYMENT_LINK_ID;
        if (!lot || lot.id !== identity.lotId || lot.profile_id !== identity.ownerId
          || !email || email !== String(lot.email_admin || '').trim().toLowerCase()
          || (qa && email !== env.STRIPE_QA_EMAIL.toLowerCase())
          || (lot.stripe_subscription_id && lot.stripe_subscription_id !== subscriptionId)) {
          return res.json({ received: true, ignored: true, reason: 'checkout_owner_conflict' });
        }
      }
      // El lease por suscripción se obtiene ANTES de leer Stripe; el RPC de commit comprueba el fencing token.
      const stripeResponse = await fetchImpl('https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(subscriptionId), {
        headers: { Authorization: 'Basic ' + Buffer.from(stripeKey + ':').toString('base64') }, signal: AbortSignal.timeout(15000)
      });
      if (!stripeResponse.ok) throw new Error('STRIPE_LOOKUP_FAILED');
      const current = await stripeResponse.json();
      if (current.id !== subscriptionId || typeof current.customer !== 'string' || !/^cus_[A-Za-z0-9]{1,128}$/.test(current.customer)) {
        throw new Error('SUBSCRIPTION_IDENTITY_MISMATCH');
      }
      if (checkout) {
        const items = current.items?.data;
        const price = Array.isArray(items) && items.length === 1 ? items[0].price : null;
        const qa = durableCheckout ? durableCheckout.mode === 'qa' : object.payment_link === env.STRIPE_QA_PAYMENT_LINK_ID;
        const expectedAmount = qa ? 1000 : 1160000;
        const expectedPrice = qa ? env.STRIPE_QA_PRICE_ID : env.STRIPE_PRODUCTION_PRICE_ID;
        if (current.customer !== object.customer || !price || price.currency !== 'mxn'
          || price.unit_amount !== expectedAmount || price.recurring?.interval !== 'month'
          || price.recurring.interval_count !== 1 || (expectedPrice && price.id !== expectedPrice)
          || (durableCheckout && (items[0].quantity !== 1 || !expectedPrice || price.id !== durableCheckout.price_id))) {
          return res.json({ received: true, ignored: true, reason: 'checkout_price_or_customer_conflict' });
        }
      }
      let planStatus = getActiveStatus(current.status);
      if (checkout && object.payment_status !== 'paid' && object.payment_status !== 'no_payment_required' && planStatus === 'active') {
        planStatus = 'pending';
      }
      const periodEnd = current.current_period_end ?? current.items?.data?.[0]?.current_period_end;
      if (periodEnd != null && (!Number.isSafeInteger(periodEnd) || periodEnd <= 0)) throw new Error('INVALID_PERIOD');
      const result = await rpc(durableCheckout ? 'apply_checkout_session_security_event' : 'apply_stripe_security_event', {
        ...lease, p_lote_id: identity?.lotId || null, p_owner_id: identity?.ownerId || null,
        p_customer_id: current.customer, p_plan_status: planStatus,
        p_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        p_cancelled: current.status === 'canceled',
        ...(durableCheckout ? {p_attempt_id:durableCheckout.id,p_session_id:object.id} : {})
      });
      if (result?.applied !== true) throw new Error('BILLING_COMMIT_NOT_CONFIRMED');
      applied = true;
      return res.json({ received: true, matched: result.matched === true });
    } catch {
      console.error('[Stripe Webhook] Reconciliation failed:', event.id);
      return res.status(500).json({ error: 'Stripe event processing failed.' });
    } finally {
      if (acquired && !applied) {
        try { await rpc('fail_stripe_security_event', lease); }
        catch { console.error('[Stripe Webhook] Lease cleanup deferred:', event.id); }
      }
    }
  };
}

module.exports = { verifyStripeSignature, getSubscriptionId, getActiveStatus, createStripeWebhookHandler };
