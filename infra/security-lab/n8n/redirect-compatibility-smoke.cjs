'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http'),vm=require('node:vm');
const store='/usr/local/lib/node_modules/n8n/node_modules/.pnpm';
const copies=fs.readdirSync(store).filter(name=>name.startsWith('follow-redirects@')).map(name=>path.join(store,name,'node_modules/follow-redirects'));
assert.equal(copies.length,2);copies.push('/opt/velodrive-security/node_modules/follow-redirects');
async function check(root){
 let received;
 const target=http.createServer((req,res)=>{received=req.headers;res.end('fixture');});
 const origin=http.createServer((_req,res)=>res.writeHead(302,{Location:'http://127.0.0.1:'+target.address().port+'/'}).end());
 try{
  await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));await new Promise(resolve=>origin.listen(0,'127.0.0.1',resolve));
  const redirects=require(root).http;
  const status=await new Promise((resolve,reject)=>{const request=redirects.get('http://127.0.0.1:'+origin.address().port+'/',{headers:{'X-QA-Key':'FAKE_LOCAL_ONLY','X-Harmless':'fixture'},sensitiveHeaders:vm.runInNewContext("['X-QA-Key']"),timeout:3000},response=>{response.resume();response.once('end',()=>resolve(response.statusCode));});request.once('error',reject);request.once('timeout',()=>request.destroy(Error('FIXTURE_TIMEOUT')));});
  assert.equal(status,200);assert.equal(received['x-qa-key'],undefined);assert.equal(received['x-harmless'],'fixture');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,'1.16.2');return true;
 }finally{for(const server of [origin,target]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
(async()=>{const results=[];for(const root of copies){try{results.push({protected:await check(root)});}catch(error){results.push({protected:false,reason:error.code==='ERR_ASSERTION'?'HEADER_OR_VERSION_REGRESSION':'FIXTURE_FAILED'});}}console.log(JSON.stringify({consumers:copies.length,results,productionData:false,externalNetwork:false}));if(results.some(x=>!x.protected))process.exitCode=1;})().catch(()=>{console.error('N8N_REDIRECT_SMOKE_NOT_COMPLETED');process.exitCode=1;});
