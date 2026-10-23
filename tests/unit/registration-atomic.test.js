'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createAtomicRegistration} = require('../../registration-atomic');
const userId='11111111-1111-4111-8111-111111111111';
const lotId='22222222-2222-4222-8222-222222222222';
const env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',APP_BASE_URL:'https://app.test'};
const input={email:'qa@example.com',password:'not-persisted-password',lote:{nombre:'QA',email_admin:'qa@example.com'},legalConsent:{terms:true,privacy:true,version:'v1'},env};
const response=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('registro atomico exige trigger activo antes de crear Auth',async()=>{
 let calls=0;
 const result=await createAtomicRegistration({...input,fetchImpl:async()=>{calls++;return response(200,{ready:false});}});
 assert.equal(result.status,503);assert.equal(result.body.code,'ATOMIC_REGISTRATION_NOT_READY');assert.equal(calls,1);
});
test('registro atomico crea Auth y solo lee el lote creado en la misma transaccion',async()=>{
 const calls=[];
 const result=await createAtomicRegistration({...input,fetchImpl:async(url,options)=>{
   calls.push({url:String(url),method:options.method||'GET'});
   if(String(url).endsWith('/rpc/registration_atomic_ready'))return response(200,{ready:true});
   if(String(url).includes('/auth/v1/signup')){
     const data=JSON.parse(options.body);assert.equal(data.data.velodrive_registration.version,1);
     assert.match(data.data.velodrive_registration.operation_id,/^[0-9a-f-]{36}$/);
     assert.equal(JSON.stringify(data.data).includes(input.password),false);
     return response(200,{user:{id:userId,email:input.email,identities:[{id:'new'}]},access_token:'access',refresh_token:'refresh'});
   }
   if(String(url).includes('/registration_security_operations?'))return response(200,[{id:new URL(url).searchParams.get('id').slice(3),user_id:userId,lote_id:lotId}]);
   assert.equal(options.method,'GET');assert.match(String(url),new RegExp('profile_id=eq.'+userId));
   return response(200,[{id:lotId,profile_id:userId,email_admin:input.email}]);
 }});
 assert.equal(result.status,201);assert.equal(result.body.session.access_token,'access');
 assert.equal(calls.some(c=>c.method==='DELETE'),false);assert.equal(calls.length,4);
});
test('fallo de transaccion no intenta compensar ni filtra errores internos',async()=>{
 let calls=0;const result=await createAtomicRegistration({...input,fetchImpl:async()=>++calls===1?response(200,{ready:true}):response(500,{msg:'SQL private schema failure'})});
 assert.equal(result.status,503);assert.equal(result.body.code,'ATOMIC_REGISTRATION_FAILED');
 assert.equal(JSON.stringify(result).includes('SQL private'),false);assert.equal(calls,2);
});
test('lectura fallida posterior al commit conserva cuenta y lote para iniciar sesion',async()=>{
 let calls=0;const result=await createAtomicRegistration({...input,fetchImpl:async(url,options)=>{
   calls++;assert.notEqual(options.method,'DELETE');
   if(calls===1)return response(200,{ready:true});
   if(calls===2)return response(200,{user:{id:userId,email:input.email}});
   throw Error('offline');
 }});
 assert.equal(result.status,503);assert.equal(result.body.code,'REGISTRATION_READ_PENDING');assert.equal(calls,3);
});
test('respuesta incierta de Auth no elimina una cuenta posiblemente confirmada',async()=>{
 let calls=0;const result=await createAtomicRegistration({...input,fetchImpl:async()=>{
   if(++calls===1)return response(200,{ready:true});throw Error('timeout');
 }});
 assert.equal(result.status,502);assert.equal(result.body.code,'REGISTRATION_STATUS_UNCERTAIN');assert.equal(calls,2);
});
test('duplicado obfuscado no consulta lotes ni elimina usuarios existentes',async()=>{
 let calls=0;const result=await createAtomicRegistration({...input,fetchImpl:async()=>++calls===1?response(200,{ready:true}):response(200,{user:{id:userId,identities:[]}})});
 assert.equal(result.status,422);assert.equal(result.body.code,'EMAIL_ALREADY_REGISTERED');assert.equal(calls,2);
});
test('registro no acepta una lectura de lote de otro propietario',async()=>{
 let calls=0;const result=await createAtomicRegistration({...input,fetchImpl:async(url)=>{
   calls++;if(calls===1)return response(200,{ready:true});if(calls===2)return response(200,{user:{id:userId,email:input.email}});
   if(calls===3)return response(200,[{id:new URL(url).searchParams.get('id').slice(3),user_id:userId,lote_id:lotId}]);
   return response(200,[{id:'other',profile_id:'other',email_admin:input.email}]);
 }});
 assert.equal(result.status,503);assert.equal(result.body.code,'REGISTRATION_READ_PENDING');assert.equal(result.body.lote,undefined);
});
test('correo no confirmado repetido sin operacion actual nunca revela datos del lote',async()=>{
 let calls=0;const result=await createAtomicRegistration({...input,fetchImpl:async(url)=>{
   if(++calls===1)return response(200,{ready:true});
   if(calls===2)return response(200,{user:{id:userId,email:input.email,identities:[{id:'existing'}]}});
   assert.match(String(url),/registration_security_operations/);return response(200,[]);
 }});
 assert.equal(result.status,422);assert.equal(result.body.code,'EMAIL_ALREADY_REGISTERED');
 assert.equal(result.body.lote,undefined);assert.equal(result.body.session,undefined);assert.equal(calls,3);
});
