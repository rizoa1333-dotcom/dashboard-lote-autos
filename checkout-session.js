'use strict';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION = /^cs_[A-Za-z0-9_]{1,200}$/;
const RECONCILIATION_SKEW_SECONDS = 300;

function checkoutUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.port || url.username || url.password) {
    throw Error('CHECKOUT_URL_INVALID');
  }
  return url.toString();
}

/** Create or reuse the same durable attempt across processes and uncertain HTTP responses.
 * @param {{lot:{id:string,profile_id:string,email_admin:string},user:{id:string,email:string},qa:boolean,testMode:boolean,env:Record<string,string|undefined>,fetchImpl:typeof fetch}} input
 * @returns {Promise<{url:string}>}
 */
async function createDurableCheckout({lot, user, qa, testMode, env, fetchImpl}, renewExpired = true) {
  const mode = testMode ? 'test' : qa ? 'qa' : 'production';
  const priceId = mode === 'test' ? env.STRIPE_TEST_PRICE_ID : qa ? env.STRIPE_QA_PRICE_ID : env.STRIPE_PRODUCTION_PRICE_ID;
  const stripeKey = testMode ? env.STRIPE_TEST_SECRET_KEY : env.STRIPE_SECRET_KEY;
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL || !stripeKey || !/^price_[A-Za-z0-9]+$/.test(priceId || '')) {
    throw Error('CHECKOUT_SESSION_NOT_CONFIGURED');
  }
  if (!UUID.test(lot.id) || lot.profile_id !== user.id || lot.email_admin.toLowerCase() !== user.email.toLowerCase()
      || (qa && user.email.toLowerCase() !== env.STRIPE_QA_EMAIL?.toLowerCase())
      || (testMode && env.STRIPE_TEST_ENABLED !== 'true')) throw Error('CHECKOUT_IDENTITY_CONFLICT');
  const app = new URL(env.APP_BASE_URL || '');
  if (app.protocol !== 'https:' || app.username || app.password) throw Error('CHECKOUT_SESSION_NOT_CONFIGURED');
  const serviceHeaders = {apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type':'application/json'};
  if (env.SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ')) serviceHeaders.Authorization = 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY;
  const rpc = async (name, body) => {
    try {
      const response = await fetchImpl(env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + name,
        {method:'POST',headers:serviceHeaders,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw Error('STORE_HTTP_FAILURE');
      return await response.json();
    } catch { throw Error('CHECKOUT_STORE_FAILED'); }
  };
  const attempt = await rpc('claim_lote_checkout', {p_lote_id:lot.id,p_owner_id:user.id,p_price_id:priceId,p_mode:mode,p_email:user.email.toLowerCase()});
  if (attempt?.state === 'subscribed') throw Error('CHECKOUT_ALREADY_COMPLETED');
  if (!attempt || !UUID.test(attempt.id) || attempt.lote_id !== lot.id || attempt.owner_id !== user.id
      || attempt.price_id !== priceId || attempt.mode !== mode || attempt.email !== user.email.toLowerCase()
      || attempt.reference !== 'vd_' + attempt.id || !Number.isSafeInteger(attempt.expires_at)) throw Error('CHECKOUT_IDENTITY_CONFLICT');
  const stripeHeaders = {Authorization:'Basic ' + Buffer.from(stripeKey + ':').toString('base64')};
  if (attempt.state === 'creating' && attempt.expires_at < Math.floor(Date.now()/1000) + 1800) {
    // Fixed Stripe expiration fences delayed workers: do not rotate an uncertain attempt while it can still be paid.
    if (!renewExpired || attempt.expires_at + RECONCILIATION_SKEW_SECONDS >= Math.floor(Date.now()/1000)) throw Error('CHECKOUT_CREATION_RECONCILING');
    let after = '', recovered = null, complete = false;
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({'created[gte]':String(attempt.expires_at-3600-RECONCILIATION_SKEW_SECONDS),
        'created[lte]':String(attempt.expires_at+RECONCILIATION_SKEW_SECONDS),limit:'100'});
      if (after) query.set('starting_after',after);
      const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions?' + query,
        {headers:stripeHeaders,signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw Error('CHECKOUT_STATUS_UNAVAILABLE');
      const listing = await response.json();
      if (!Array.isArray(listing.data) || typeof listing.has_more !== 'boolean') throw Error('CHECKOUT_STATUS_UNAVAILABLE');
      for (const session of listing.data) {
        if (session.client_reference_id !== attempt.reference || session.payment_link) continue;
        if (recovered || !SESSION.test(session.id) || session.expires_at !== attempt.expires_at
            || !['open','complete','expired'].includes(session.status)) throw Error('CHECKOUT_IDENTITY_CONFLICT');
        recovered = session;
      }
      if (!listing.has_more) { complete = true; break; }
      after = listing.data.at(-1)?.id;
      if (!SESSION.test(after || '')) throw Error('CHECKOUT_STATUS_UNAVAILABLE');
    }
    if (!complete) throw Error('CHECKOUT_STATUS_UNAVAILABLE');
    const reconciled = await rpc('reconcile_creating_lote_checkout', {p_attempt_id:attempt.id,p_lote_id:lot.id,p_owner_id:user.id,
      p_session_id:recovered?.id || null,p_status:recovered?.status || 'absent',p_url:recovered?.url ? checkoutUrl(recovered.url) : null});
    if (reconciled?.saved !== true) throw Error('CHECKOUT_STORE_FAILED');
    return createDurableCheckout({lot,user,qa,testMode,env,fetchImpl}, false);
  }
  if (attempt.state === 'open') {
    if (!SESSION.test(attempt.session_id)) throw Error('CHECKOUT_IDENTITY_CONFLICT');
    const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions/' + attempt.session_id,
      {headers:stripeHeaders,signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error('CHECKOUT_STATUS_UNAVAILABLE');
    const session = await response.json();
    if (session.id !== attempt.session_id) throw Error('CHECKOUT_IDENTITY_CONFLICT');
    if (session.status === 'complete') throw Error('CHECKOUT_ALREADY_COMPLETED');
    if (session.status === 'expired' && renewExpired) {
      const closed = await rpc('expire_lote_checkout', {p_attempt_id:attempt.id,p_lote_id:lot.id,p_owner_id:user.id,p_session_id:session.id});
      if (closed?.expired !== true) throw Error('CHECKOUT_STORE_FAILED');
      return createDurableCheckout({lot,user,qa,testMode,env,fetchImpl}, false);
    }
    if (session.status !== 'open') throw Error('CHECKOUT_EXPIRED_REQUIRES_RECONCILIATION');
    return {url:checkoutUrl(session.url)};
  }
  if (attempt.state !== 'creating') throw Error('CHECKOUT_IDENTITY_CONFLICT');
  const priceResponse = await fetchImpl('https://api.stripe.com/v1/prices/' + priceId,
    {headers:stripeHeaders,signal:AbortSignal.timeout(15000)});
  if (!priceResponse.ok) throw Error('CHECKOUT_PRICE_UNAVAILABLE');
  const price = await priceResponse.json();
  if (price.id !== priceId || price.active !== true || price.currency !== 'mxn' || price.unit_amount !== (mode === 'production' ? 1160000 : 1000)
      || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1) throw Error('CHECKOUT_PRICE_MISMATCH');
  const body = new URLSearchParams({mode:'subscription','line_items[0][price]':priceId,'line_items[0][quantity]':'1',
    customer_email:attempt.email,client_reference_id:attempt.reference,expires_at:String(attempt.expires_at),
    success_url:new URL('/?checkout=success',app).toString(),cancel_url:new URL('/?checkout=cancelled',app).toString()});
  const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {method:'POST',
    headers:{...stripeHeaders,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'velodrive-checkout-' + attempt.id},
    body:body.toString(),signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw Error('CHECKOUT_CREATE_UNCONFIRMED');
  const session = await response.json();
  if (!SESSION.test(session.id) || session.client_reference_id !== attempt.reference || session.expires_at !== attempt.expires_at) {
    throw Error('CHECKOUT_IDENTITY_CONFLICT');
  }
  const url = checkoutUrl(session.url);
  const saved = await rpc('complete_lote_checkout', {p_attempt_id:attempt.id,p_lote_id:lot.id,p_owner_id:user.id,p_session_id:session.id,p_url:url});
  if (saved?.saved !== true) throw Error('CHECKOUT_STORE_FAILED');
  return {url};
}

module.exports = {createDurableCheckout};
