const crypto = require('node:crypto');

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
    const stripeSecretKey = env.STRIPE_SECRET_KEY;
    const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const allowedPaymentLinks = new Set((env.STRIPE_ALLOWED_PAYMENT_LINK_IDS || '').split(',').map((id) => id.trim()).filter(Boolean));
    const qaPaymentLinkId = String(env.STRIPE_QA_PAYMENT_LINK_ID || '').trim();
    const qaEmail = String(env.STRIPE_QA_EMAIL || '').trim().toLowerCase();

    if (!secret || !stripeSecretKey || !supabaseUrl || !serviceRoleKey || allowedPaymentLinks.size === 0 || !qaPaymentLinkId || !qaEmail) {
      return res.status(503).json({ error: 'Stripe webhook is not configured.' });
    }
    if (!verifyStripeSignature(req.body, req.get('stripe-signature'), secret)) {
      return res.status(400).json({ error: 'Invalid Stripe signature.' });
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch (_) {
      return res.status(400).json({ error: 'Invalid event body.' });
    }

    const stripeGet = async (resource) => {
      const response = await fetchImpl(`https://api.stripe.com/v1/${resource}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${stripeSecretKey}:`).toString('base64')}` }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Stripe API error (${response.status}).`);
      return result;
    };

    const updateLot = async (filter, patch) => {
      const response = await fetchImpl(`${supabaseUrl}/rest/v1/lotes?${filter}`, {
        method: 'PATCH',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(patch)
      });
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error(`Supabase update error (${response.status}).`);
      return rows;
    };

    const findLot = async (lotId) => {
      const query = new URLSearchParams({
        select: 'id,email_admin,stripe_subscription_id,plan_status',
        id: `eq.${lotId}`,
        limit: '1'
      });
      const response = await fetchImpl(`${supabaseUrl}/rest/v1/lotes?${query}`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
      });
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error(`Supabase lookup error (${response.status}).`);
      return rows[0] || null;
    };

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data?.object || {};
        if (session.mode !== 'subscription' || !allowedPaymentLinks.has(session.payment_link)) {
          return res.status(200).json({ received: true, ignored: true });
        }
        if (!session.client_reference_id || !session.subscription || !session.customer) {
          return res.status(400).json({ error: 'Checkout session is missing its lot or subscription reference.' });
        }

        const lot = await findLot(session.client_reference_id);
        if (!lot) return res.status(404).json({ error: 'Lot not found for Stripe checkout.' });
        const checkoutEmail = String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase();
        if (session.payment_link === qaPaymentLinkId && checkoutEmail !== qaEmail) {
          console.error('[Stripe Webhook] Correo fuera de la lista de prueba de $10 MXN:', lot.id);
          return res.status(200).json({ received: true, ignored: true, reason: 'qa_email_not_allowed' });
        }
        if (!checkoutEmail || checkoutEmail !== String(lot.email_admin || '').trim().toLowerCase()) {
          console.error('[Stripe Webhook] El correo de Checkout no coincide con el administrador del lote:', lot.id);
          return res.status(200).json({ received: true, ignored: true, reason: 'customer_email_mismatch' });
        }
        if (lot.stripe_subscription_id && lot.stripe_subscription_id !== session.subscription) {
          console.error('[Stripe Webhook] Lote ya vinculado a otra suscripción activa:', lot.id);
          return res.status(200).json({ received: true, ignored: true, reason: 'lot_already_subscribed' });
        }

        const subscription = await stripeGet(`subscriptions/${encodeURIComponent(session.subscription)}`);
        if (getActiveStatus(subscription.status) === 'inactive') {
          return res.status(200).json({ received: true, ignored: true, reason: 'subscription_inactive' });
        }
        const isPaid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
        const status = isPaid ? getActiveStatus(subscription.status) : 'pending';
        const patch = {
          stripe_customer_id: session.customer,
          stripe_subscription_id: subscription.id,
          plan_status: status,
          fecha_vencimiento: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null
        };
        // El filtro compare-and-set evita que dos checkouts concurrentes
        // sobrescriban la suscripción de un mismo lote.
        const lotFilter = new URLSearchParams({
          id: `eq.${session.client_reference_id}`,
          or: `(stripe_subscription_id.is.null,stripe_subscription_id.eq.${session.subscription})`
        });
        const rows = await updateLot(lotFilter.toString(), patch);
        if (!rows.length) return res.status(200).json({ received: true, ignored: true, reason: 'lot_subscription_conflict' });
        return res.status(200).json({ received: true });
      }

      if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data?.object || {};
        if (!subscription.id) return res.status(400).json({ error: 'Subscription event is missing its ID.' });
        const isCancelled = event.type === 'customer.subscription.deleted' || subscription.status === 'canceled';
        const rows = await updateLot(`stripe_subscription_id=eq.${encodeURIComponent(subscription.id)}`, {
          stripe_customer_id: subscription.customer,
          stripe_subscription_id: isCancelled ? null : subscription.id,
          plan_status: isCancelled ? 'inactive' : getActiveStatus(subscription.status),
          fecha_vencimiento: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null
        });
        return res.status(200).json({ received: true, matched: rows.length > 0 });
      }

      if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
        const invoice = event.data?.object || {};
        const subscriptionId = getSubscriptionId(invoice);
        if (!subscriptionId) return res.status(200).json({ received: true, ignored: true });
        const subscription = await stripeGet(`subscriptions/${encodeURIComponent(subscriptionId)}`);
        const rows = await updateLot(`stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`, {
          stripe_customer_id: invoice.customer || subscription.customer,
          plan_status: event.type === 'invoice.paid' ? getActiveStatus(subscription.status) : 'past_due',
          fecha_vencimiento: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null
        });
        return res.status(200).json({ received: true, matched: rows.length > 0 });
      }

      return res.status(200).json({ received: true, ignored: true });
    } catch (error) {
      console.error('[Stripe Webhook] Error procesando evento:', event.id, error.message);
      return res.status(500).json({ error: 'Stripe event processing failed.' });
    }
  };
}

module.exports = { verifyStripeSignature, getSubscriptionId, getActiveStatus, createStripeWebhookHandler };
