'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const express=require('express');
const multer=require('multer');
const sharp=require('sharp');
const axios=require('axios');
const undici=require('undici');
const {Server}=require('socket.io');
const {io}=require('socket.io-client');
const sdk=require('@figuro/chatwoot-sdk');
const zlib=require('node:zlib');
let stage='circular-merge';

async function withDeadline(promise,milliseconds=5000){
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOCAL_COMPATIBILITY_TIMEOUT')),milliseconds);})]);}
 finally{clearTimeout(timer);}
}

(async()=>{
 const fs=require('node:fs');
 const {deepmerge}=await import('deepmerge-ts');
 const left={value:1},right={extra:2};left.self=left;right.self=right;
 const merged=deepmerge(left,right);assert.equal(merged.self.value,1);assert.equal(merged.self.extra,2);
 stage='prisma-config';
 const configPath='/tmp/velodrive-qa-prisma.config.ts';
 fs.writeFileSync(configPath,'export default {schema:"/evolution/prisma/postgresql-schema.prisma",migrations:{path:"/tmp/qa-migrations"}};');
 try{
  const config=await require('@prisma/config').loadConfigFromFile({configFile:configPath});
  assert.equal(config.error,undefined);assert.equal(config.config.schema,'/evolution/prisma/postgresql-schema.prisma');
 }finally{fs.unlinkSync(configPath);}
 stage='plain-links';
 const {getUrlInfo}=await import('baileys/lib/Utils/link-preview.js');
 const {generateWAMessageContent}=await import('baileys');
 let publicPreviewCallback=false;
 for(const text of ['https://example.com/qa','http://127.0.0.1/private','http://[::1]/private']){
  assert.equal(await getUrlInfo(text),undefined);
  const content=await generateWAMessageContent({text},{getUrlInfo:async(...args)=>{if(text==='https://example.com/qa')publicPreviewCallback=true;return getUrlInfo(...args);}});
  assert.equal(content.extendedTextMessage?.text||content.conversation,text);
 }
 assert.equal(publicPreviewCallback,true);
 stage='runtime-libraries';
 const lodash=require('lodash'),jws=require('jws');
 assert.deepEqual(lodash.merge({nested:{left:1}},{nested:{right:2}}),{nested:{left:1,right:2}});
 assert.equal(lodash.template('Hello <%= name %>')({name:'fixture'}),'Hello fixture');
 const signed=jws.sign({header:{alg:'HS256'},payload:'fixture',secret:'LOCAL_FIXTURE_ONLY'});
 assert.equal(jws.verify(signed,'HS256','LOCAL_FIXTURE_ONLY'),true);
 assert.equal(jws.verify(signed,'HS256','WRONG_FIXTURE'),false);
 const {Address4,Address6}=require('ip-address');
 assert.equal(new Address4('127.0.0.1').correctForm(),'127.0.0.1');
 assert.equal(new Address6('::1').isLoopback(),true);
 const {defu}=require('defu');
 assert.deepEqual(defu({nested:{left:1}},{nested:{right:2}}),{nested:{left:1,right:2}});
 assert.equal(defu({},JSON.parse('{"__proto__":{"qaPolluted":true}}')).qaPolluted,undefined);
 assert.equal({}.qaPolluted,undefined);
 const {minimatch}=require('minimatch');
 assert.equal(minimatch('fixture/photo.jpg','fixture/*.{jpg,png}'),true);
 assert.equal(minimatch('fixture/photo.exe','fixture/*.{jpg,png}'),false);
 const {Effect,Context}=require('effect'),tenant=Context.GenericTag('qa-tenant');
 const task=value=>Effect.gen(function*(){const before=yield* tenant;yield* Effect.sleep('5 millis');const after=yield* tenant;return [before,after];}).pipe(Effect.provideService(tenant,value));
 assert.deepEqual(await Effect.runPromise(Effect.all([task('tenant-a'),task('tenant-b')],{concurrency:2})),[['tenant-a','tenant-a'],['tenant-b','tenant-b']]);
 const png=await sharp({create:{width:16,height:12,channels:3,background:{r:12,g:34,b:56}}}).png().toBuffer();
 const formats=[];
 for(const format of ['jpeg','png','webp']){
  const converted=await sharp(png).resize(8,6)[format]().toBuffer();
  const info=await sharp(converted).metadata();
  assert.equal(info.width,8);assert.equal(info.height,6);assert.equal(info.format,format);
  formats.push(format);
 }
 const {XMLParser,XMLBuilder}=require('fast-xml-parser');
 assert.deepEqual(new XMLParser().parse(new XMLBuilder().build({root:{value:'fixture'}})),{root:{value:'fixture'}});
 const {XMLParser:LegacyParser}=require('/evolution/node_modules/minio/node_modules/fast-xml-parser');
 assert.deepEqual(new LegacyParser().parse('<root><value>fixture</value></root>'),{root:{value:'fixture'}});

 const app=express();
 app.use(require('compression')());
 app.use(express.json({limit:'16kb'}));
 app.get('/json',(_,res)=>res.json({ok:true}));
 app.get('/compressed',(_,res)=>res.type('text').send('fixture'.repeat(2048)));
 app.get('/redirect',(_,res)=>res.redirect('/json'));
 app.get('/api/v1/accounts/:account/conversations/:conversation/messages',(req,res)=>{
  if(req.headers.api_access_token!=='LOCAL_FIXTURE_ONLY'){res.status(401).json({error:'fixture_auth'});return;}
  if(req.params.account==='999'){res.status(401).json({error:'fixture'});return;}
  res.json({payload:[]});
 });
 let attachmentAccepted=false;
 app.post('/api/v1/accounts/:account/conversations/:conversation/messages',multer({storage:multer.memoryStorage(),limits:{fileSize:32768,files:1}}).any(),(req,res)=>{
  attachmentAccepted=req.headers.api_access_token==='LOCAL_FIXTURE_ONLY'&&req.body.content==='QA_LOCAL'&&req.files.length===1&&req.files[0].buffer.equals(png);
  res.json({id:1,accepted:attachmentAccepted});
 });
 const server=http.createServer(app);
 const sockets=new Server(server,{serveClient:false});
 sockets.on('connection',socket=>socket.on('qa-probe',(value,ack)=>ack({ok:Buffer.isBuffer(value)&&value.equals(Buffer.from([1,2,3]))})));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const clients=[];
 try{
  assert.equal((await axios.get(base+'/json',{timeout:5000})).data.ok,true);
  assert.equal((await axios.get(base+'/redirect',{timeout:5000})).data.ok,true);
  await assert.rejects(axios.get(base+'/redirect',{maxRedirects:0,timeout:5000}),error=>error.response?.status===302);
  assert.equal((await (await undici.request(base+'/json')).body.json()).ok,true);
  const compressed=await undici.request(base+'/compressed',{headers:{'accept-encoding':'gzip'}});
  assert.equal(compressed.headers['content-encoding'],'gzip');
  assert.equal(zlib.gunzipSync(Buffer.from(await compressed.body.arrayBuffer())).toString(),'fixture'.repeat(2048));

  const chatwoot=new sdk.default({config:{...sdk.ChatwootAPI,basePath:base,token:'LOCAL_FIXTURE_ONLY'}});
  assert.deepEqual(await withDeadline(chatwoot.messages.list({accountId:1,conversationId:1})),{payload:[]});
  const sent=await withDeadline(chatwoot.messages.create({accountId:1,conversationId:1,data:{content:'QA_LOCAL',message_type:'outgoing',attachments:[{content:png.toString('base64'),encoding:'base64',filename:'qa.png'}]}}));
  assert.equal(sent.accepted,true);assert.equal(attachmentAccepted,true);
  await assert.rejects(withDeadline(chatwoot.messages.list({accountId:999,conversationId:1})),error=>error.status===401);

  const transports=[];
  for(const transport of ['websocket','polling']){
   const client=io(base,{transports:[transport],upgrade:false,reconnection:false,forceNew:true,timeout:3000});clients.push(client);
   await withDeadline(new Promise((resolve,reject)=>{client.once('connect',resolve);client.once('connect_error',reject);}));
   const result=await withDeadline(new Promise(resolve=>client.emit('qa-probe',Buffer.from([1,2,3]),resolve)));
   assert.equal(result.ok,true);client.disconnect();transports.push(transport);
  }
  console.log(JSON.stringify({passed:true,formats,xmlBranches:[4,5],axios:true,undici:true,compression:true,merge:true,circularMerge:true,prismaConfig:true,plainLinksPreserved:true,automaticPreviewsDisabled:true,signature:true,ipParsing:true,prototypeProtection:true,glob:true,concurrentEffectContext:true,chatwootJson:true,chatwootMultipart:true,chatwootErrorStatus:true,socketTransports:transports,productionCredentialsUsed:false}));
 }finally{
  for(const client of clients)client.disconnect();
  await undici.getGlobalDispatcher().close();
  server.closeAllConnections();await new Promise(resolve=>sockets.close(resolve));
 }
})().catch(error=>{console.error(JSON.stringify({stage,code:error.code||error.name||'LOCAL_COMPATIBILITY_FAILED',actual:typeof error.actual==='number'?error.actual:undefined,expected:typeof error.expected==='number'?error.expected:undefined}));process.exitCode=1});
