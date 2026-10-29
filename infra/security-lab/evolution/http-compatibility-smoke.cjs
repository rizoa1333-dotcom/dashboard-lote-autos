'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),zlib=require('node:zlib');
if(process.env.AUTHENTICATION_API_KEY!=='LOCAL_FIXTURE_ONLY_NO_REAL_SECRET'||new URL(process.env.DATABASE_CONNECTION_URI).hostname!=='qa-evo-pg')throw Error('ISOLATED_FIXTURE_REQUIRED');
const base='http://127.0.0.1:8080',origin='https://evolution-api-production-3652.up.railway.app';
const headers={'Content-Type':'application/json',Origin:origin};
async function post(body,extra={}){return fetch(base+'/message/sendText/LOCAL_FAKE',{method:'POST',headers:{...headers,...extra},body,signal:AbortSignal.timeout(5000)});}
let stage='oversized-json';
(async()=>{
 const root=await fetch(base+'/health',{signal:AbortSignal.timeout(5000)});assert.equal(root.status,200);assert.equal(root.headers.get('cache-control'),'no-store');assert.deepEqual(await root.json(),{status:'ok'});
 const oversized=await post(JSON.stringify({media:'x'.repeat(1024*1024)}));assert.equal(oversized.status,413);assert.equal((await oversized.json()).error,'REQUEST_TOO_LARGE');
 stage='normal-auth'; const normal=await post(JSON.stringify({number:'LOCAL_FAKE',text:'LOCAL_FIXTURE_ONLY'}));assert.equal(normal.status,404);await normal.text();
 stage='invalid-json'; const invalid=await post('{"secret":"DO_NOT_REFLECT",oops');assert.equal(invalid.status,400);assert.deepEqual(await invalid.json(),{error:'INVALID_REQUEST_BODY'});
 stage='chunked-json'; const chunked=await new Promise((resolve,reject)=>{const req=http.request(base+'/message/sendText/LOCAL_FAKE',{method:'POST',headers},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.on('error',reject);req.write('{"data":"');req.write('x'.repeat(1024*1024));req.end('"}');});assert.equal(chunked,413);
 stage='compressed-json'; const compressed=await post(zlib.gzipSync(JSON.stringify({media:'x'.repeat(1024*1024)})),{'Content-Encoding':'gzip'});assert.equal(compressed.status,413);await compressed.text();
 stage='deep-form'; const form=await post('data'+'[x]'.repeat(12)+'=1',{'Content-Type':'application/x-www-form-urlencoded'});assert.equal(form.status,400);await form.text();
 stage='form-parameters'; const parameters=await post(Array.from({length:1001},(_,i)=>'a'+i+'=1').join('&'),{'Content-Type':'application/x-www-form-urlencoded'});assert.equal(parameters.status,413);await parameters.text();
 stage='capacity'; const pending=[];
 try{for(let i=0;i<4;i++){const req=http.request(base+'/message/sendText/LOCAL_FAKE',{method:'POST',headers:{...headers,'Content-Length':'50'}});req.on('error',()=>{});req.write('{');pending.push(req);}
 await new Promise(resolve=>setTimeout(resolve,200));
 const full=await post('{}');assert.equal(full.status,503);assert.equal(full.headers.get('retry-after'),'2');await full.text();
 const healthy=await fetch(base+'/instance/fetchInstances',{headers:{Origin:origin,apikey:process.env.AUTHENTICATION_API_KEY},signal:AbortSignal.timeout(5000)});assert.equal(healthy.status,200);await healthy.text();
 }finally{for(const req of pending)req.destroy();}
 let restored=false;for(let i=0;i<10;i++){const r=await post('{}');await r.text();if(r.status===404){restored=true;break;}await new Promise(resolve=>setTimeout(resolve,25));}assert.ok(restored);
 console.log(JSON.stringify({healthRoot:200,oversizedJson:413,normalMetadataUnknownInstance:404,invalidJsonNeutral:400,chunkedJson:413,inflatedJson:413,deepForm:400,tooManyFormParameters:413,saturated:503,authenticatedReadDuringSaturation:200,abortReleasesCapacity:true,productionData:false}));
})().catch(error=>{console.error(JSON.stringify({kind:'HTTP_BOUNDARY_FAILURE',stage,actual:typeof error.actual==='number'?error.actual:undefined,expected:typeof error.expected==='number'?error.expected:undefined}));process.exitCode=1});
