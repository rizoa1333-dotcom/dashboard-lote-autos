'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const budget=require('../../infra/security-lab/evolution/request-budget.cjs');

test('public Manager navigation works without Origin while API auth and CORS remain intact',async t=>{
  assert.equal(typeof budget.managerCors,'function');
  const app=express();
  app.use(budget.managerCors((req,_res,next)=>next(req.headers.origin==='https://allowed.example'?undefined:new Error('CORS_BLOCK'))));
  app.get('/manager',(_req,res)=>res.type('html').send('<main>Manager</main>'));
  app.get('/manager/*',(_req,res)=>res.type('text').send('public asset'));
  app.get('/assets/*',(_req,res)=>res.type('text').send('public asset'));
  app.get('/instance/fetchInstances',(_req,res)=>res.sendStatus(401));
  app.use((_err,_req,res,_next)=>res.status(500).json({error:'CORS_BLOCK'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>{server.closeAllConnections();server.close()});
  const base='http://127.0.0.1:'+server.address().port;
  for(const route of ['/manager','/manager/','/manager/assets/index-abc.js','/manager/instance/abc-123','/assets/index-abc.js','/assets/index-abc.css']){
    const r=await fetch(base+route);assert.equal(r.status,200,route);assert.equal(r.headers.get('access-control-allow-origin'),null);
    assert.equal((await fetch(base+route,{method:'HEAD'})).status,200);
  }
  assert.equal((await fetch(base+'/manager',{method:'POST'})).status,500);
  assert.equal((await fetch(base+'/manager',{headers:{Origin:'https://evil.example'}})).status,500);
  assert.equal((await fetch(base+'/assets/index-abc.js',{headers:{Origin:'https://allowed.example'}})).status,200);
  assert.equal((await fetch(base+'/assets/index-abc.css',{headers:{Origin:'https://allowed.example'}})).status,200);
  assert.equal((await fetch(base+'/instance/fetchInstances')).status,500);
  assert.equal((await fetch(base+'/instance/fetchInstances',{headers:{Origin:'https://allowed.example'}})).status,401);
});

test('Manager CORS exception rejects encoded, traversal and prefix-confusion paths',()=>{
  assert.equal(typeof budget.managerCors,'function');
  for(const pathname of ['/manager-other','/manager/../instance','/manager/./assets/app.js','/manager//assets/app.js','/manager/%2e%2e/instance','/manager/%2f/instance','/manager\\assets\\app.js','/manager/assets/app.js\0','/assets-other','/assets/../instance','/assets/%2e%2e/instance','/instance/fetchInstances']){
    let gated=0,passed=0;
    budget.managerCors((_req,_res,next)=>{gated++;next()} )({method:'GET',path:pathname,headers:{}},{},()=>{passed++});
    assert.equal(gated,1,pathname);assert.equal(passed,1);
  }
  for(const sample of [
    {method:'OPTIONS',path:'/manager',headers:{}},
    {method:'PATCH',path:'/manager',headers:{}},
    {method:'DELETE',path:'/manager',headers:{}},
    {method:'GET',path:'/manager',headers:{origin:''}},
    {method:'GET',path:'/manager',headers:{origin:'null'}},
    {method:'GET',path:'/manager/'+ 'a'.repeat(1024),headers:{}},
  ]){
    let gated=0;
    budget.managerCors(()=>{gated++})(sample,{},()=>{});
    assert.equal(gated,1,JSON.stringify(sample));
  }
  assert.throws(()=>budget.managerCors(null),/INVALID_CORS_MIDDLEWARE/);
});

test('compiled Manager integration preserves the original CORS policy and rejects drift',()=>{
  const {hardenManagerCors}=require('../../infra/security-lab/evolution/harden-media.cjs');
  assert.equal(typeof hardenManagerCors,'function');
  const cors='(0,Ll.default)({origin(r,a){let{ORIGIN:c}=E.get("CORS");return c.includes("*")||c.indexOf(r)!==-1?a(null,!0):a(new Error("Not allowed by CORS"))},methods:[...E.get("CORS").METHODS],credentials:E.get("CORS").CREDENTIALS})';
  const source=`s.use(${cors},NEXT_MIDDLEWARE);`;
  const changed=hardenManagerCors(source);
  assert.equal(changed,`s.use(VeloDriveRequestBudget.managerCors(${cors}),NEXT_MIDDLEWARE);`);
  assert.throws(()=>hardenManagerCors(source+source),/MEDIA_CONSUMER_DRIFT/);
  assert.throws(()=>hardenManagerCors(source.replace('CREDENTIALS','CHANGED')),/MEDIA_CONSUMER_DRIFT/);
});
