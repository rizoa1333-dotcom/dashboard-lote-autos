'use strict';
const {randomUUID} = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const result = (status, code, message) => ({status,body:{code,message}});

/** Inputs are validated and lot fields allowlisted by the registration route.
 * @param {{email:string,password:string,lote:Record<string,unknown>,legalConsent:Record<string,unknown>,env:Record<string,string|undefined>,fetchImpl:typeof fetch}} input
 */
async function createAtomicRegistration({email,password,lote,legalConsent,env,fetchImpl}) {
  const base=env.SUPABASE_URL.replace(/\/$/,'');
  const serviceHeaders={apikey:env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
  if(env.SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ'))serviceHeaders.Authorization='Bearer '+env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const ready=await fetchImpl(base+'/rest/v1/rpc/registration_atomic_ready',{
      method:'POST',headers:serviceHeaders,body:'{}',signal:AbortSignal.timeout(15000)});
    if(!ready.ok || (await ready.json())?.ready!==true)throw Error('NOT_READY');
  } catch {
    return result(503,'ATOMIC_REGISTRATION_NOT_READY','El registro está en mantenimiento. Intenta más tarde.');
  }
  const operationId=randomUUID();
  let authResponse,auth;
  try {
    const url=new URL(base+'/auth/v1/signup');url.searchParams.set('redirect_to',env.APP_BASE_URL);
    authResponse=await fetchImpl(url,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY||env.SUPABASE_KEY,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(15000),body:JSON.stringify({email,password,data:{legal_consent:legalConsent,
        velodrive_registration:{version:1,operation_id:operationId,lote}}})});
    auth=await authResponse.json();
  } catch {
    return result(502,'REGISTRATION_STATUS_UNCERTAIN','No se confirmó la respuesta del registro. Intenta iniciar sesión antes de volver a crear la cuenta.');
  }
  const user=auth?.user || (UUID.test(auth?.id||'')?auth:null);
  const duplicate=(Array.isArray(user?.identities)&&user.identities.length===0)
    || /already|registered|exists|duplicate/.test(String(auth?.msg||auth?.message||'').toLowerCase());
  if(duplicate)return result(422,'EMAIL_ALREADY_REGISTERED','Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.');
  if(!authResponse.ok || !UUID.test(user?.id||'')) {
    return result(authResponse.status>=500?503:422,'ATOMIC_REGISTRATION_FAILED','No se pudo completar el registro. Revisa los datos e inténtalo de nuevo.');
  }
  try {
    // Signup can return a pre-existing, unconfirmed user without proving the supplied password.
    const proofQuery=new URLSearchParams({select:'id,user_id,lote_id',id:'eq.'+operationId,user_id:'eq.'+user.id,limit:'2'});
    const proof=await fetchImpl(base+'/rest/v1/registration_security_operations?'+proofQuery,{method:'GET',headers:serviceHeaders,signal:AbortSignal.timeout(15000)});
    const operations=await proof.json();
    if(!proof.ok || !Array.isArray(operations))throw Error('REGISTRATION_PROOF_UNAVAILABLE');
    if(operations.length!==1 || operations[0].id!==operationId || operations[0].user_id!==user.id || !UUID.test(operations[0].lote_id||'')) {
      return result(422,'EMAIL_ALREADY_REGISTERED','Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.');
    }
    const query=new URLSearchParams({select:'*',id:'eq.'+operations[0].lote_id,profile_id:'eq.'+user.id,email_admin:'eq.'+email,limit:'2'});
    const read=await fetchImpl(base+'/rest/v1/lotes?'+query,{method:'GET',headers:serviceHeaders,signal:AbortSignal.timeout(15000)});
    const lots=await read.json();
    if(!read.ok || !Array.isArray(lots) || lots.length!==1 || lots[0].id!==operations[0].lote_id || lots[0].profile_id!==user.id || lots[0].email_admin?.toLowerCase()!==email)throw Error('LOT_NOT_CONFIRMED');
    const session=auth.access_token&&auth.refresh_token?{access_token:auth.access_token,refresh_token:auth.refresh_token,
      expires_in:auth.expires_in,expires_at:auth.expires_at,token_type:auth.token_type,user}:auth.session||null;
    return {status:201,body:{user:{id:user.id,email:user.email},lote:lots[0],session,requiresEmailConfirmation:!session}};
  } catch {
    // Auth and lot already committed together. A failed read must never delete either.
    return result(503,'REGISTRATION_READ_PENDING','La cuenta fue creada, pero no se pudo cargar el lote. Inicia sesión para continuar.');
  }
}
module.exports={createAtomicRegistration};
