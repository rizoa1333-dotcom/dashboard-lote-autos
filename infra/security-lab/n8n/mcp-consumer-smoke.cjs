const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {Module,createRequire}=require('node:module');
const {patch,hashes}=require('/opt/velodrive-security/mcp-patches.cjs');
const root='/usr/local/lib/node_modules/n8n',pn=root+'/node_modules/.pnpm';
const d=fs.readdirSync(pn).find(x=>x.startsWith('@n8n+n8n-nodes-langchain@'));
const trigger=pn+'/'+d+'/node_modules/@n8n/n8n-nodes-langchain/dist/nodes/mcp/McpTrigger/McpServer.js';
const source=fs.readFileSync(trigger,'utf8'),patched=source;
const entry=path.dirname(trigger)+'/McpTrigger.node.js';
const patchedEntry=fs.readFileSync(entry,'utf8');
const service=root+'/dist/modules/mcp/mcp.service.js';
new vm.Script(fs.readFileSync(service,'utf8'),{filename:service});
const controller=root+'/dist/modules/mcp/mcp.controller.js';
const patchedController=fs.readFileSync(controller,'utf8');
assert.throws(()=>patch('trigger',source+'\n'),/PATCH_SOURCE_HASH/);
console.log('PASS installed MCP consumers parse and reject unexpected source changes');
const loaded=new Module(trigger,module);loaded.filename=trigger;loaded.paths=Module._nodeModulePaths(path.dirname(trigger));loaded._compile(patched,trigger);
const proto=loaded.exports.McpServer.prototype;
const reqFrom=value=>({rawBody:Buffer.from(JSON.stringify(value)),query:{},headers:{}});
const msg=(n,id=1)=>({jsonrpc:'2.0',id,method:'tools/call',params:{name:'dummy',arguments:{items:Array(n).fill('x')}}});
function response(){return {statusCode:200,data:undefined,status(n){this.statusCode=n;return this},json(d){this.data=d;return this},send(d){this.data=d;return this},flush(){}}}
async function main(){
 const controllerModule=new Module(controller,module);controllerModule.filename=controller;controllerModule.paths=Module._nodeModulePaths(path.dirname(controller));
 const controllerRequire=createRequire(controller);controllerModule.require=function(name){if(name==='@n8n/di')return {...controllerRequire(name),Container:{get:()=>({getAuthMiddleware:()=>()=>{},getEnabledMiddleware:()=>()=>{}})}};return controllerRequire(name)};
 controllerModule._compile(patchedController,controller);
 const controllerProto=controllerModule.exports.McpController.prototype;
 let cors=0;const controllerThis={setCorsHeaders(){cors++},logger:{debug(){throw Error('LOGGER_ENTERED')}},handleTransportRequest(){throw Error('ADAPTER_ENTERED')}};
 const controllerRes=response();await controllerProto.build.call(controllerThis,{body:msg(10000)},controllerRes);assert.equal(controllerRes.statusCode,400);assert.equal(cors,1);
 let chain={};const chainRoot=chain;for(let i=0;i<65;i++){chain.next={};chain=chain.next}
 const deepRes=response();await controllerProto.build.call(controllerThis,{body:{method:'tools/call',params:{arguments:chainRoot}}},deepRes);assert.equal(deepRes.statusCode,400);
 console.log('PASS real builtin controller parsed-body guard rejects wide/deep input before logging, adapter JSON.stringify and SDK schemas');
 const events=[];
 const originalRequire=createRequire(entry);
 const webhookUtils=originalRequire('n8n-nodes-base/dist/nodes/Webhook/utils');
 const workflow=originalRequire('n8n-workflow');
 const {WebhookAuthorizationError}=originalRequire('n8n-nodes-base/dist/nodes/Webhook/error');
 let authorization='allow';
 const entryLoaded=new Module(entry,module);entryLoaded.filename=entry;entryLoaded.paths=Module._nodeModulePaths(path.dirname(entry));
 entryLoaded.require=function(name){
  if(name==='./McpServer')return {...loaded.exports,rejectOversizedMcpToolInput(req,res){events.push('guard');return loaded.exports.rejectOversizedMcpToolInput(req,res)}};
  if(name==='n8n-nodes-base/dist/nodes/Webhook/utils')return {...webhookUtils,async validateWebhookAuthentication(){events.push('auth');if(authorization==='deny'){const error=Object.create(WebhookAuthorizationError.prototype);error.responseCode=401;error.message='dummy auth required';throw error}}};
  if(name==='n8n-workflow')return {...workflow,async n8nOAuth2Auth(){events.push('oauth');return {token:'dummy',resource:'dummy',user:{id:'dummy'}}}};
  return originalRequire(name);
 };
 entryLoaded._compile(patchedEntry,entry);
 const entryProto=entryLoaded.exports.McpTrigger.prototype;
 function context(authentication,res){return {getWebhookName(){return 'default'},getRequestObject(){return reqFrom(msg(10000))},getResponseObject(){return res},getNodeParameter(){return authentication},getNode(){if(authentication==='n8nOAuth2')return {typeVersion:2};throw Error('NODE_ACCESS_BEFORE_GUARD')},async establishTriggerIdentity(){events.push('identity')}}}
 const denied=response();denied.writeHead=function(n){this.statusCode=n};denied.end=function(){};
 authorization='deny';await entryProto.webhook.call({},context('none',denied));assert.equal(denied.statusCode,401);assert.deepEqual(events,['auth']);
 events.length=0;authorization='allow';const allowed=response();await entryProto.webhook.call({},context('none',allowed));assert.equal(allowed.statusCode,400);assert.deepEqual(events,['auth','guard']);
 events.length=0;const oauth=response();await entryProto.webhook.call({},context('n8nOAuth2',oauth));assert.equal(oauth.statusCode,400);assert.deepEqual(events,['oauth','identity','guard']);
 console.log('PASS real patched webhook preserves rejection of unauthorized input; normal and OAuth authentication precede guard; guard rejects before getConnectedTools/MessageParser');
 let touched=0;
 const noEntry=new Proxy({},{get(){touched++;throw Error('BODY_ENTERED')}});
 for(const method of ['handlePostMessage','handleStreamableHttpSetup']){
  const res=response();await proto[method].call(noEntry,reqFrom(msg(10000)),res,[], 'dummy');
  assert.equal(res.statusCode,400);assert.equal(res.data.error.code,-32602);assert.equal(touched,0);
  console.log('PASS '+method+' rejects10001 elements before session access, parser, schema, transport and handlers');
 }
 const parserPath=path.dirname(trigger)+'/protocol/MessageParser.js';
 const parser=createRequire(trigger)(parserPath).MessageParser;
 let parsed=0;const original=parser.extractToolCallInfo;
 parser.extractToolCallInfo=function(...a){parsed++;return original.apply(this,a)};
 const normalThis={getSessionId(){return undefined},logger:{warn(){}},sessionManager:{},pendingGateResults:{}};
 const validResp=response();await proto.handlePostMessage.call(normalThis,reqFrom(msg(9999)),validResp,[],'dummy');
 assert.equal(parsed,1);assert.equal(validResp.statusCode,401);
 const oversizeResp=response();await proto.handlePostMessage.call(normalThis,reqFrom(msg(10000)),oversizeResp,[],'dummy');assert.equal(parsed,1);assert.equal(oversizeResp.statusCode,400);
 console.log('PASS exact10000 elements follows existing parser path;10001 bypasses MessageParser');
 const nested={};let current=nested;for(let i=0;i<10001;i++){current.next={};current=current.next}
 const nestedReq={rawBody:Buffer.from('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"dummy","arguments":'+ '{"next":'.repeat(10001)+'{}'+'}'.repeat(10001)+'}}'),query:{},headers:{}};
 const nestedResp=response();await proto.handlePostMessage.call(noEntry,nestedReq,nestedResp,[],'dummy');assert.equal(nestedResp.statusCode,400);
 console.log('PASS deeply nested input rejects iteratively without recursive stack overflow');
 console.log('hashes',JSON.stringify(hashes));
}
main().catch(e=>{console.error(e);process.exitCode=1});
