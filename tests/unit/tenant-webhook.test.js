const test = require('node:test');
const assert = require('node:assert/strict');
const { createTenantWebhookClient } = require('../../ui-feedback');

function setup(responses, refresh) {
  let tenant = { id:'lot-a', webhook_token:'old' };
  const requests=[];
  const send = createTenantWebhookClient({
    getTenant:()=>tenant,
    loadToken:async id=>refresh(id),
    fetch:async (url, options)=>{ requests.push({url,...options}); return {status:responses.shift()}; },
  });
  return {send,requests,getTenant:()=>tenant,setTenant:value=>{tenant=value;}};
}

test('una sesión abierta recupera el token rotado y reintenta una sola vez sin cambiar el cuerpo', async()=>{
  assert.equal(typeof createTenantWebhookClient, 'function');
  const s=setup([401,200], async()=> 'new');
  const body=JSON.stringify({request_id:'idempotent-12345'});
  const result=await s.send('https://webhook.test',{method:'POST',body,headers:{'Content-Type':'application/json'}});
  assert.equal(result.status,200);
  assert.equal(s.requests.length,2);
  assert.equal(s.requests[0].headers.get('Authorization'),'Bearer old');
  assert.equal(s.requests[1].headers.get('Authorization'),'Bearer new');
  assert.equal(s.requests[1].body,body);
  assert.equal(s.getTenant().webhook_token,'new');
});

test('un error 500 nunca provoca repetir una publicación', async()=>{
  const s=setup([500],async()=>{throw new Error('no debe refrescar');});
  assert.equal((await s.send('https://webhook.test',{})).status,500);
  assert.equal(s.requests.length,1);
});

test('un segundo 401 se devuelve sin crear un bucle de reintentos',async()=>{
  const s=setup([401,401],async()=> 'new');
  assert.equal((await s.send('https://webhook.test',{})).status,401);
  assert.equal(s.requests.length,2);
});

test('cambiar de lote durante la renovación impide reenviar con otra cuenta',async()=>{
  const s=setup([401],async()=>{s.setTenant({id:'lot-b',webhook_token:'other'});return 'new';});
  await assert.rejects(s.send('https://webhook.test',{}),/sesión/);
  assert.equal(s.requests.length,1);
  assert.equal(s.getTenant().webhook_token,'other');
});

test('si falla consultar el token no reenvía la operación',async()=>{
  const s=setup([401],async()=>{throw new Error('offline');});
  await assert.rejects(s.send('https://webhook.test',{}),/offline/);
  assert.equal(s.requests.length,1);
});
