const test=require('node:test');
const assert=require('node:assert/strict');
let createDurableCheckout;try{({createDurableCheckout}=require('../../checkout-session'))}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const lot={id:'11111111-1111-4111-8111-111111111111',profile_id:'22222222-2222-4222-8222-222222222222',email_admin:'owner@example.test'};
const env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'service-test',STRIPE_SECRET_KEY:'rk_live_test',STRIPE_PRODUCTION_PRICE_ID:'price_live',APP_BASE_URL:'https://app.test'};
const initial={id:'33333333-3333-4333-8333-333333333333',lote_id:lot.id,owner_id:lot.profile_id,price_id:'price_live',mode:'production',email:lot.email_admin,reference:'vd_33333333-3333-4333-8333-333333333333',state:'creating',expires_at:Math.floor(Date.now()/1000)+3600};
function setup({badPrice=false,loseCommit=false,existing=null,unavailable=false,recoverPaid=false,incompleteListing=false}={}){
 const calls=[];let job=structuredClone(existing||initial);let commitLost=loseCommit;const sent=[];
 const fetchImpl=async(url,o={})=>{url=String(url);calls.push({url,o});let body;
 if(url.endsWith('/claim_lote_checkout')) {if(unavailable)return {ok:false,json:async()=>({})};if(job.state==='expired')job={...initial,id:'55555555-5555-4555-8555-555555555555',reference:'vd_55555555-5555-4555-8555-555555555555'};body=job;}
 else if(url.endsWith('/complete_lote_checkout')){if(commitLost){commitLost=false;throw Error('NETWORK_FAILURE')}const x=JSON.parse(o.body);job={...job,state:'open',session_id:x.p_session_id,url:x.p_url};body={saved:true};}
 else if(url.includes('/v1/prices/'))body={id:'price_live',active:true,currency:'mxn',unit_amount:badPrice?1:1160000,recurring:{interval:'month',interval_count:1}};
 else if(url.includes('/v1/checkout/sessions?')){
  const query=new URL(url).searchParams;
  const recovered={id:'cs_live_recovered',client_reference_id:job.reference,expires_at:job.expires_at,created:job.expires_at-3620,payment_link:null,status:'complete'};
  body={has_more:incompleteListing,data:recoverPaid?[recovered].filter(x=>x.created>=Number(query.get('created[gte]'))&&x.created<=Number(query.get('created[lte]'))):incompleteListing?[{id:'cs_live_unrelated',client_reference_id:'other'}]:[]};
 }
 else if(url.endsWith('/reconcile_creating_lote_checkout')){const p=JSON.parse(o.body);job={...job,state:p.p_status==='absent'?'expired':'open',session_id:p.p_session_id,provider_status:p.p_status==='complete'?'complete':'open'};body={saved:true};}
 else if(url==='https://api.stripe.com/v1/checkout/sessions'){sent.push(o);body={id:'cs_live_shared',url:'https://checkout.stripe.com/c/pay/cs_live_shared',expires_at:job.expires_at,client_reference_id:job.reference,status:'open'};}
 else if(url.includes('/v1/checkout/sessions/'))body={id:job.session_id,status:job.provider_status||'open',url:job.url};
 else throw Error('UNEXPECTED_ROUTE');
 return {ok:true,status:200,json:async()=>body};};
 return {calls,sent,run:()=>createDurableCheckout({lot,user:{id:lot.profile_id,email:lot.email_admin},qa:false,testMode:false,env,fetchImpl})};
}
test('dos replicas reutilizan intento durable y clave idempotente sin confiar en precio del navegador',async()=>{
 assert.equal(typeof createDurableCheckout,'function');const s=setup();const results=await Promise.all([s.run(),s.run()]);assert.equal(results[0].url,results[1].url);assert.ok(s.sent.length>=1);assert.equal(new Set(s.sent.map(x=>x.headers['Idempotency-Key'])).size,1);assert.equal(new Set(s.sent.map(x=>x.body)).size,1);const p=new URLSearchParams(s.sent[0].body);assert.equal(p.get('line_items[0][price]'),'price_live');assert.equal(p.get('line_items[0][quantity]'),'1');
});
test('timeout despues de crear Stripe reintenta con exactamente la misma clave y cuerpo',async()=>{const s=setup({loseCommit:true});await assert.rejects(s.run(),/CHECKOUT_STORE_FAILED/);await s.run();assert.equal(s.sent.length,2);assert.equal(s.sent[0].headers['Idempotency-Key'],s.sent[1].headers['Idempotency-Key']);assert.equal(s.sent[0].body,s.sent[1].body);});
test('precio incorrecto falla antes de crear una sesion',async()=>{const s=setup({badPrice:true});await assert.rejects(s.run(),/CHECKOUT_PRICE_MISMATCH/);assert.equal(s.sent.length,0);});
test('sin journal durable no se abre Checkout ni se usa fallback al Payment Link',async()=>{const s=setup({unavailable:true});await assert.rejects(s.run(),/CHECKOUT_STORE_FAILED/);assert.equal(s.sent.length,0);});
test('un intento de otro lote no se usa aunque lo devuelva el almacenamiento',async()=>{const s=setup({existing:{...initial,lote_id:'44444444-4444-4444-8444-444444444444'}});await assert.rejects(s.run(),/CHECKOUT_IDENTITY_CONFLICT/);assert.equal(s.sent.length,0);});
test('sesion ya pagada no crea otra antes de recibir el webhook',async()=>{const s=setup({existing:{...initial,state:'open',session_id:'cs_live_paid',url:'https://checkout.stripe.com/c/pay/cs_live_paid',provider_status:'complete'}});await assert.rejects(s.run(),/CHECKOUT_ALREADY_COMPLETED/);assert.equal(s.sent.length,0);});

test('creacion abandonada renueva solo tras vencer y reconciliar listado completo sin sesion',async()=>{const s=setup({existing:{...initial,expires_at:Math.floor(Date.now()/1000)-301}});const result=await s.run();assert.match(result.url,/checkout.stripe.com/);assert.equal(s.sent.length,1);assert.match(s.sent[0].headers['Idempotency-Key'],/55555555/);assert.ok(s.calls.some(c=>c.url.includes('/v1/checkout/sessions?')));});
test('sesion pagada recuperada de creacion incierta impide un segundo cobro',async()=>{const s=setup({recoverPaid:true,existing:{...initial,expires_at:Math.floor(Date.now()/1000)-301}});await assert.rejects(s.run(),/CHECKOUT_ALREADY_COMPLETED/);assert.equal(s.sent.length,0);});
test('listado incompleto o intento aun pagable no autorizan nueva creacion',async()=>{const s=setup({incompleteListing:true,existing:{...initial,expires_at:Math.floor(Date.now()/1000)-301}});await assert.rejects(s.run(),/CHECKOUT_STATUS_UNAVAILABLE/);assert.equal(s.sent.length,0);const pending=setup({existing:{...initial,expires_at:Math.floor(Date.now()/1000)+1200}});await assert.rejects(pending.run(),/CHECKOUT_CREATION_RECONCILING/);assert.equal(pending.sent.length,0);});


test('reconciliacion incluye sesion creada antes del reloj local y conserva coincidencia exacta',async()=>{
 const expires_at=Math.floor(Date.now()/1000)-301;
 const s=setup({recoverPaid:true,existing:{...initial,expires_at}});
 await assert.rejects(s.run(),/CHECKOUT_ALREADY_COMPLETED/);
 const query=new URL(s.calls.find(c=>c.url.includes('/v1/checkout/sessions?')).url).searchParams;
 assert.ok(Number(query.get('created[gte]'))<=expires_at-3600-300);
 assert.ok(Number(query.get('created[lte]'))>=expires_at+300);
 assert.equal(s.sent.length,0);
});
