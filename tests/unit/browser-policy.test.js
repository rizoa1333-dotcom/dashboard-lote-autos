const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const app=require('../../server');
function get(port,path){return new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port,path},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));}).on('error',reject);});}
test('el HTML aplica CSP sin scripts inline/eval y todos los scripts se sirven desde el mismo origen',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const response=await get(server.address().port,'/');const policy=response.headers['content-security-policy'];
 assert.ok(policy,'CSP debe estar habilitada');
 const scriptPolicy=policy.split(';').find(p=>p.trim().startsWith('script-src '));
 assert.match(scriptPolicy,/'self'/);assert.doesNotMatch(scriptPolicy,/unsafe-inline|unsafe-eval|https:/);
 const scripts=[...response.body.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
 for(const [,attrs,body] of scripts){assert.equal(body.trim(),'','ningun script ejecutable inline');assert.match(attrs,/src="(?!https?:|\/\/)[^"]+"/);}
 }finally{await new Promise(r=>server.close(r));}
});
test('los recursos de SDK y CSS son archivos propios con MIME correcto, sin fallback HTML',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const port=server.address().port;
 for(const [path,type] of [['/vendor/supabase-2.118.0.js','javascript'],['/assets/utilities.css','text/css'],['/app-config.js','javascript'],['/registration-wizard.js','javascript'],['/vehicle-finance.js','javascript']]){
 const r=await get(port,path);assert.equal(r.status,200);assert.match(r.headers['content-type'],new RegExp(type));assert.doesNotMatch(r.body,/<!DOCTYPE html>/i);
 }
 }finally{await new Promise(r=>server.close(r));}
});

test('el parser corregido maneja gzip valido e invalido y mantiene disponible el servidor',async()=>{
 const zlib=require('node:zlib');
 const lock=require('../../package-lock.json');
 assert.equal(lock.packages['node_modules/body-parser'].version,'1.20.9');
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=body=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/api/stripe-checkout-link',method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip','Content-Length':body.length}},res=>{
   res.resume();res.on('end',()=>resolve(res.statusCode));
  });req.on('error',reject);req.end(body);
 });
 try{
  assert.equal(await post(zlib.gzipSync(Buffer.from('{}'))),401);
  assert.equal(await post(Buffer.from('invalid gzip')),400);
  assert.equal((await get(server.address().port,'/health')).status,200);
 }finally{await new Promise(r=>server.close(r));}
});
