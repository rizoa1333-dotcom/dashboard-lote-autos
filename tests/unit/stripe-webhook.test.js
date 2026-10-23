const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyStripeSignature, getSubscriptionId, getActiveStatus, createStripeWebhookHandler } = require('../../stripe-webhook');
const { createCheckoutReference } = require('../../checkout-authorization');
const secret = 'whsec_test_only_123456789012345678901234';
const lotId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const now = 1800000000;
const env = { STRIPE_WEBHOOK_SECRET: secret, STRIPE_SECRET_KEY: 'sk_test_only', STRIPE_ALLOWED_PAYMENT_LINK_IDS: 'plink_qa,plink_live',
  STRIPE_QA_PAYMENT_LINK_ID: 'plink_qa', STRIPE_QA_EMAIL: 'qa@example.com', SUPABASE_URL: 'https://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only' };
function signedRequest(event, timestamp = Math.floor(Date.now() / 1000)) {
  const body = Buffer.from(JSON.stringify(event));
  return { body, signature: 't='+timestamp+',v1='+crypto.createHmac('sha256', secret).update(timestamp+'.'+body).digest('hex') };
}
async function invoke(handler, event) {
  const signed = signedRequest(event);
  const res = { statusCode: 200, status(n) { this.statusCode=n; return this; }, json(v) { this.body=v; return this; } };
  await handler({ body: signed.body, get: () => signed.signature },res); return res;
}
function checkout(overrides = {}) {
  return { id:'evt_checkout', type:'checkout.session.completed', data:{ object:{ id:'cs_test', created:now,
    mode:'subscription',payment_link:'plink_qa',client_reference_id:createCheckoutReference({lotId,ownerId,paymentLinkId:'plink_qa',secret,now}),
    subscription:'sub_qa',customer:'cus_qa',customer_email:'qa@example.com',payment_status:'paid', ...overrides } } };
}
function setup({ state='active', amount=1000, claim='claimed', email='qa@example.com', customer='cus_qa', failApply=false, linked=null }={}) {
  const calls=[], writes=[];
  const fetchImpl=async(input,options={})=>{
    const url=new URL(input); calls.push({url,options});
    let body;
    if(url.pathname==='/rest/v1/lotes') body=[{id:lotId,profile_id:ownerId,email_admin:email,stripe_subscription_id:linked}];
    else if(url.hostname==='api.stripe.com') body={id:'sub_qa',customer,status:state,items:{data:[{current_period_end:1800086400,
      price:{id:'price_qa',unit_amount:amount,currency:'mxn',recurring:{interval:'month',interval_count:1}}}]}};
    else if(url.pathname.endsWith('/claim_stripe_security_event')) body={state:claim};
    else if(url.pathname.endsWith('/apply_stripe_security_event')) {
      writes.push(JSON.parse(options.body));
      if(failApply) return {ok:false,status:409,json:async()=>({message:'BILLING_LEASE_LOST'})};
      body={applied:true,matched:true};
    } else if(url.pathname.endsWith('/fail_stripe_security_event')) body=null;
    else throw new Error('Unexpected route '+url.pathname);
    return {ok:true,status:200,json:async()=>body};
  };
  return {calls,writes,handler:createStripeWebhookHandler({fetchImpl,env})};
}
test('valida HMAC y rechaza payload alterado, firma ausente y timestamp antiguo',()=>{
  const event={id:'evt_test'},s=signedRequest(event,now);
  assert.equal(verifyStripeSignature(s.body,s.signature,secret,now),true);
  assert.equal(verifyStripeSignature(Buffer.from('{}'),s.signature,secret,now),false);
  assert.equal(verifyStripeSignature(s.body,s.signature,secret,now+301),false);
  assert.equal(verifyStripeSignature(s.body,'',secret,now),false);
});
test('extrae suscripción con versiones nuevas y viejas de invoice y normaliza estados',()=>{
  assert.equal(getSubscriptionId({subscription:'sub_old'}),'sub_old');
  assert.equal(getSubscriptionId({parent:{subscription_details:{subscription:'sub_new'}}}),'sub_new');
  assert.equal(getActiveStatus('active'),'active'); assert.equal(getActiveStatus('past_due'),'past_due'); assert.equal(getActiveStatus('canceled'),'inactive');
});
test('Checkout autorizado reclama lease, valida dueño/precio y aplica sin PATCH directo',async()=>{
  const s=setup(),r=await invoke(s.handler,checkout());
  assert.equal(r.statusCode,200); assert.equal(s.writes.length,1);
  assert.equal(s.writes[0].p_lote_id,lotId); assert.equal(s.writes[0].p_owner_id,ownerId);
  assert.equal(s.writes[0].p_plan_status,'active');
  assert.equal(s.writes[0].p_period_end,new Date(1800086400*1000).toISOString());
  assert.match(s.writes[0].p_lease_token,/^[0-9a-f-]{36}$/);
  assert.equal(s.calls.some(c=>c.options.method==='PATCH'),false);
  assert.ok(s.calls.findIndex(c=>c.url.pathname.endsWith('/claim_stripe_security_event')) < s.calls.findIndex(c=>c.url.hostname==='api.stripe.com'));
});
test('referencia sin firma y enlace ajeno se ignoran antes de llamar a otros servicios',async()=>{
  for(const fields of [{client_reference_id:lotId},{payment_link:'plink_other'}]) {
    const s=setup(),r=await invoke(s.handler,checkout(fields));
    assert.equal(r.body.ignored,true); assert.equal(s.calls.length,0);
  }
});
test('otro correo QA, precio erróneo, cliente cruzado o suscripción ya vinculada no activan',async()=>{
  for(const config of [{email:'other@example.com'},{amount:10},{customer:'cus_other'},{linked:'sub_other'}]) {
    const s=setup(config),r=await invoke(s.handler,checkout());
    assert.equal(r.body.ignored,true); assert.equal(s.writes.length,0);
  }
});
test('evento repetido no consulta Stripe ni vuelve a actualizar el lote',async()=>{
  const s=setup({claim:'duplicate'}),r=await invoke(s.handler,checkout());
  assert.equal(r.body.duplicate,true); assert.equal(s.writes.length,0);
  assert.equal(s.calls.some(c=>c.url.hostname==='api.stripe.com'),false);
});
test('suscripción ocupada devuelve 503 para que Stripe reintente sin segunda escritura',async()=>{
  const s=setup({claim:'busy'}),r=await invoke(s.handler,checkout());
  assert.equal(r.statusCode,503); assert.equal(s.writes.length,0);
});
test('invoice.payment_failed retrasado conserva el estado actual activo de Stripe',async()=>{
  const s=setup(); await invoke(s.handler,{id:'evt_latefail',type:'invoice.payment_failed',data:{object:{subscription:'sub_qa'}}});
  assert.equal(s.writes[0]?.p_plan_status,'active');
});
test('subscription.updated antiguo no restaura un plan actualmente cancelado',async()=>{
  const s=setup({state:'canceled'}); await invoke(s.handler,{id:'evt_oldactive',type:'customer.subscription.updated',data:{object:{id:'sub_qa',status:'active'}}});
  assert.equal(s.writes[0]?.p_plan_status,'inactive'); assert.equal(s.writes[0]?.p_cancelled,true);
});
test('pérdida del lease falla cerrada y permite reintento sin respuesta de éxito',async()=>{
  const s=setup({failApply:true}),r=await invoke(s.handler,checkout());
  assert.equal(r.statusCode,500);
  assert.equal(s.calls.some(c=>c.url.pathname.endsWith('/fail_stripe_security_event')),true);
});
test('evento sin ID durable y firma inválida no procesan datos',async()=>{
  const s=setup(); const event=checkout(); delete event.id;
  assert.equal((await invoke(s.handler,event)).statusCode,400); assert.equal(s.calls.length,0);
  const r={status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
  await s.handler({body:Buffer.from('{}'),get:()=> 'invalid'},r);
  assert.equal(r.code,400); assert.equal(s.calls.length,0);
});

test('Checkout Session sin Payment Link activa solo la sesion persistida y su dueño',async()=>{
  const calls=[],writes=[];
  const localEnv={...env,STRIPE_QA_PRICE_ID:'price_qa'};
  const fetchImpl=async(input,options={})=>{const url=new URL(input);calls.push(url.pathname);let body;
    if(url.pathname==='/rest/v1/checkout_security_sessions')body=[{id:'33333333-3333-4333-8333-333333333333',session_id:'cs_test',lote_id:lotId,owner_id:ownerId,reference:'vd_33333333-3333-4333-8333-333333333333',mode:'qa',price_id:'price_qa'}];
    else if(url.pathname==='/rest/v1/lotes')body=[{id:lotId,profile_id:ownerId,email_admin:'qa@example.com'}];
    else if(url.hostname==='api.stripe.com')body={id:'sub_qa',customer:'cus_qa',status:'active',items:{data:[{quantity:1,price:{id:'price_qa',unit_amount:1000,currency:'mxn',recurring:{interval:'month',interval_count:1}}}]}};
    else if(url.pathname.endsWith('/claim_stripe_security_event'))body={state:'claimed'};
    else if(url.pathname.endsWith('/apply_checkout_session_security_event')){writes.push(JSON.parse(options.body));body={applied:true,matched:true};}
    else if(url.pathname.endsWith('/fail_stripe_security_event'))body=null;else throw Error('UNEXPECTED_ROUTE');
    return {ok:true,status:200,json:async()=>body};};
  const handler=createStripeWebhookHandler({fetchImpl,env:localEnv});
  const good=await invoke(handler,checkout({payment_link:null,client_reference_id:'vd_33333333-3333-4333-8333-333333333333'}));
  assert.equal(good.body.matched,true);assert.equal(writes.length,1);assert.equal(writes[0].p_lote_id,lotId);
  const bad=await invoke(handler,checkout({payment_link:null,client_reference_id:'vd_foreign'}));
  assert.equal(bad.body.ignored,true);assert.equal(writes.length,1);
});
