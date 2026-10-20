const crypto = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_SECONDS = 3600;
const LIVE_URL = 'https://buy.stripe.com/9B614p0ydcVXa3Y1Bb3oA06';
const QA_URL = 'https://buy.stripe.com/fZu8wRbcR09b0to93D3oA07';
const TEST_URL = 'https://buy.stripe.com/test_6oU5kFft7f452Bw0x73oA00';

function signature(payload, paymentLinkId, secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('CHECKOUT_NOT_CONFIGURED');
  const key = crypto.hkdfSync('sha256', secret, '', 'velodrive-checkout-v1', 32);
  return crypto.createHmac('sha256', key).update(`${payload}|${paymentLinkId}`).digest();
}

/** @param {{lotId:string,ownerId:string,paymentLinkId:string,secret:string,now?:number}} input */
function createCheckoutReference({ lotId, ownerId, paymentLinkId, secret, now = Math.floor(Date.now() / 1000) }) {
  if (!UUID.test(lotId) || !UUID.test(ownerId) || !/^plink_[A-Za-z0-9]+$/.test(paymentLinkId) || !Number.isSafeInteger(now)) {
    throw new Error('INVALID_CHECKOUT_IDENTITY');
  }
  const payload = `v1_${lotId}_${ownerId}_${now + TTL_SECONDS}_${crypto.randomBytes(8).toString('hex')}`;
  return `${payload}_${signature(payload, paymentLinkId, secret).toString('hex')}`;
}

/** created procede del evento firmado de Stripe, no del navegador. */
function verifyCheckoutReference({ reference, paymentLinkId, secret, created }) {
  if (typeof reference !== 'string' || reference.length > 200 || !Number.isSafeInteger(created)) return null;
  const match = /^v1_([0-9a-f-]{36})_([0-9a-f-]{36})_(\d{10})_([0-9a-f]{16})_([0-9a-f]{64})$/i.exec(reference);
  if (!match || !UUID.test(match[1]) || !UUID.test(match[2])) return null;
  const expires = Number(match[3]);
  if (created > expires || created < expires - TTL_SECONDS) return null;
  const payload = reference.slice(0, -65);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(match[5], 'hex'), signature(payload, paymentLinkId, secret))) return null;
  } catch { return null; }
  return { lotId: match[1], ownerId: match[2] };
}

function createCheckoutLinkHandler({ env = process.env, fetchImpl = (...args) => fetch(...args) } = {}) {
  return async (req, res) => {
    const token = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '')?.[1];
    if (!token) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Inicia sesión para contratar tu plan.' });
    if (!UUID.test(String(req.body?.lote_id || '')) || (req.body?.qa !== undefined && typeof req.body.qa !== 'boolean')
      || (req.body?.test !== undefined && typeof req.body.test !== 'boolean')) {
      return res.status(400).json({ code: 'INVALID_CHECKOUT', message: 'Revisa la cuenta seleccionada.' });
    }
    const allowed = (env.STRIPE_ALLOWED_PAYMENT_LINK_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const candidates = allowed.filter(id => id !== env.STRIPE_QA_PAYMENT_LINK_ID);
    const productionId = env.STRIPE_PRODUCTION_PAYMENT_LINK_ID || (candidates.length === 1 ? candidates[0] : '');
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.STRIPE_WEBHOOK_SECRET || !productionId) {
      return res.status(503).json({ code: 'CHECKOUT_NOT_CONFIGURED', message: 'El pago no está configurado. Contacta soporte.' });
    }
    const headers = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
    try {
      const origin = env.SUPABASE_URL.replace(/\/$/, '');
      const userResponse = await fetchImpl(`${origin}/auth/v1/user`, { headers, signal: AbortSignal.timeout(15000) });
      if (!userResponse.ok) return res.status(401).json({ code: 'SESSION_EXPIRED', message: 'Vuelve a iniciar sesión.' });
      const user = await userResponse.json();
      if (!UUID.test(user.id) || !user.email) return res.status(401).json({ code: 'INVALID_IDENTITY' });
      const query = new URLSearchParams({ select: 'id,profile_id,email_admin,stripe_subscription_id', id: `eq.${req.body.lote_id}`, profile_id: `eq.${user.id}`, limit: '1' });
      const response = await fetchImpl(`${origin}/rest/v1/lotes?${query}`, { headers, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('LOT_LOOKUP_FAILED');
      const rows = await response.json();
      const lot = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (!lot || lot.id !== req.body.lote_id || lot.profile_id !== user.id) return res.status(403).json({ code: 'LOT_FORBIDDEN' });
      if (lot.stripe_subscription_id) return res.status(409).json({ code: 'SUBSCRIPTION_ALREADY_LINKED', message: 'Ya tienes una suscripción vinculada. Usa «Gestionar o cancelar plan» para actualizarla.' });
      const email = String(user.email).toLowerCase();
      if (email !== String(lot.email_admin).toLowerCase()) return res.status(403).json({ code: 'OWNER_EMAIL_MISMATCH' });
      const qa = req.body.qa === true;
      const testMode = req.body.test === true;
      if (testMode && (env.STRIPE_TEST_ENABLED !== 'true' || !env.STRIPE_TEST_PAYMENT_LINK_ID)) {
        return res.status(503).json({ code: 'SANDBOX_NOT_CONFIGURED', message: 'El entorno Stripe de prueba no está configurado. No se inició ningún cobro real.' });
      }
      if (qa && (!env.STRIPE_QA_EMAIL || email !== env.STRIPE_QA_EMAIL.toLowerCase())) {
        return res.status(403).json({ code: 'QA_FORBIDDEN', message: 'La tarifa de prueba está restringida a la cuenta interna.' });
      }
      const paymentLinkId = testMode ? env.STRIPE_TEST_PAYMENT_LINK_ID : qa ? env.STRIPE_QA_PAYMENT_LINK_ID : productionId;
      const url = new URL(testMode ? TEST_URL : qa ? QA_URL : LIVE_URL);
      url.searchParams.set('client_reference_id', createCheckoutReference({ lotId: lot.id, ownerId: user.id, paymentLinkId, secret: env.STRIPE_WEBHOOK_SECRET }));
      res.setHeader?.('Cache-Control', 'no-store');
      return res.json({ url: url.toString() });
    } catch {
      return res.status(502).json({ code: 'CHECKOUT_UNAVAILABLE', message: 'No se pudo preparar el pago. Intenta de nuevo.' });
    }
  };
}

module.exports = { createCheckoutReference, verifyCheckoutReference, createCheckoutLinkHandler };
