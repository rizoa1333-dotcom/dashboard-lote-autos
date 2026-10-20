const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const app=require('../../server');
const get=(port,path,method='GET')=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});

test('rafagas del healthcheck no consumen el cupo interactivo ni bloquean callbacks Stripe',async()=>{
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const port=server.address().port;
  try {
    for(let i=0;i<305;i++) assert.equal(await get(port,'/health'),200,'health siempre debe quedar fuera del limite interactivo');
    assert.notEqual(await get(port,'/api/stripe-webhook','POST'),429,'Stripe valida firma; no comparte el cupo del navegador');
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('agotar el limite interactivo no impide recibir Stripe ni consultar health',async()=>{
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const port=server.address().port;
  try {
    for(let i=0;i<300;i++) assert.equal(await get(port,'/api/qa-nonexistent','POST'),404);
    assert.equal(await get(port,'/api/qa-nonexistent','POST'),429);
    assert.notEqual(await get(port,'/api/stripe-webhook','POST'),429);
    assert.equal(await get(port,'/health'),200);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
