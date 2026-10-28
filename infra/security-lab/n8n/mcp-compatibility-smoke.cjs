const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {createRequire,Module}=require('node:module');
const root='/usr/local/lib/node_modules/n8n',pn=root+'/node_modules/.pnpm';
const dirs=new Map();
for(const name of ['@modelcontextprotocol/sdk','@modelcontextprotocol/server','@modelcontextprotocol/core','@modelcontextprotocol/node']){
 const matches=fs.readdirSync(pn).filter(n=>n.startsWith(name.replace('/','+')+'@'));
 assert.equal(matches.length,1);dirs.set(name,pn+'/'+matches[0]+'/node_modules/'+name);
}
const nodeDir=dirs.get('@modelcontextprotocol/node');
assert.equal(JSON.parse(fs.readFileSync(nodeDir+'/package.json')).version,'2.1.0');
assert.equal(createRequire(dirs.get('@modelcontextprotocol/sdk')+'/package.json')('zod/package.json').version,'3.25.76');
for(const name of ['@modelcontextprotocol/server','@modelcontextprotocol/core']) assert.equal(createRequire(dirs.get(name)+'/package.json')('zod/package.json').version,'4.6.6');
assert.equal(createRequire(root+'/package.json')('zod/package.json').version,'3.25.76');
const sdkReq=createRequire(dirs.get('@modelcontextprotocol/sdk')+'/package.json');
const {Client}=sdkReq('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=sdkReq('@modelcontextprotocol/sdk/client/streamableHttp.js');
const v2=require(dirs.get('@modelcontextprotocol/server'));
const {toNodeHandler}=require(nodeDir);
const rootReq=createRequire(root+'/package.json');
const schemaUtil=rootReq(root+'/dist/modules/mcp/tool-schema.util.js');
const schemaReq=createRequire(root+'/dist/modules/mcp/tool-schema.util.js');
const {z}=schemaReq('zod');
const {shapeToStandardSchema}=schemaUtil;
let calls=0,validations=0,created=0,maxActive=0,active=0;
function buildServer(){
 created++;
 const s=new v2.McpServer({name:'dummy-n8n-contract',version:'0.0.0'},{maxToolInputElements:10000});
 const schema=shapeToStandardSchema({marker:z.string(),items:z.array(z.string()).optional()});
 const originalValidate=schema['~standard'].validate;
 schema['~standard'].validate=(value)=>{validations++;return originalValidate(value)};
 s.registerTool('echo',{description:'dummy',inputSchema:schema},async args=>{
  calls++;active++;maxActive=Math.max(maxActive,active);
  await new Promise(resolve=>setTimeout(resolve,25));active--;
  return {content:[{type:'text',text:args.marker}]};
 });return s;
}
async function main(){
 console.log('versions',JSON.stringify(Object.fromEntries([...dirs].map(([n,d])=>[n,JSON.parse(fs.readFileSync(d+'/package.json')).version]))));
 const errors=[];
 const handler=v2.createMcpHandler(buildServer,{legacy:'stateless',onerror:e=>errors.push(e.message)});
 const listener=toNodeHandler(handler);
 const web=http.createServer((req,res)=>{Promise.resolve(listener(req,res)).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end()})});
 await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
 const url=new URL('http://127.0.0.1:'+web.address().port+'/mcp');
 const clients=[new Client({name:'dummy-a',version:'0'}),new Client({name:'dummy-b',version:'0'})];
 try{
  await Promise.all(clients.map(c=>c.connect(new StreamableHTTPClientTransport(url))));
  console.log('PASS two actual SDK clients initialize via node2.1 adapter and server/core2.3');
  const results=await Promise.all(clients.map((c,i)=>c.callTool({name:'echo',arguments:{marker:'dummy-'+i,items:['ok']}})));
  assert.equal(results[0].content[0].text,'dummy-0');assert.equal(results[1].content[0].text,'dummy-1');assert(maxActive>=2);
  console.log('PASS concurrent two-client tool results remain isolated');
  const ok=await clients[0].callTool({name:'echo',arguments:{marker:'at-budget',items:Array(9998).fill('x')}});
  assert(!ok.isError);const preCalls=calls,preValidations=validations;
  const tooMany=await clients[1].callTool({name:'echo',arguments:{marker:'over-budget',items:Array(9999).fill('x')}});
  assert.equal(tooMany.isError,true);assert.equal(calls,preCalls);assert.equal(validations,preValidations);
  assert(JSON.stringify(tooMany).includes('10000'));
  console.log('PASS exact10000 elements accepted;10001 rejected before StandardSchema validation and handler');
  const bad=await clients[0].callTool({name:'echo',arguments:{marker:'bad-type',items:[123]}});assert.equal(bad.isError,true);assert.equal(calls,preCalls);
  const after=await clients[0].callTool({name:'echo',arguments:{marker:'after-rejection'}});assert.equal(after.content[0].text,'after-rejection');
  console.log('PASS legitimate schema validation still rejects bad types and accepts request after rejection');
  assert.equal(errors.length,0);console.log('summary',JSON.stringify({created,calls,validations,maxActive}));
 }finally{await Promise.all(clients.map(c=>c.close()));await new Promise(resolve=>web.close(resolve));}
 await statefulV1();
}
async function statefulV1(){
 const {Server}=sdkReq('@modelcontextprotocol/sdk/server/index.js');
 const {StreamableHTTPServerTransport}=sdkReq('@modelcontextprotocol/sdk/server/streamableHttp.js');
 const {CallToolRequestSchema,ListToolsRequestSchema}=sdkReq('@modelcontextprotocol/sdk/types.js');
 const {InMemoryTaskStore}=sdkReq('@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js');
 const sessions=new Map(),servers=[],store=new InMemoryTaskStore();
 const web=http.createServer(async(req,res)=>{try{
  const chunks=[];for await(const b of req)chunks.push(b);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):undefined;
  let transport=sessions.get(req.headers['mcp-session-id']);
  if(!transport){
   transport=new StreamableHTTPServerTransport({sessionIdGenerator:crypto.randomUUID,onsessioninitialized:id=>sessions.set(id,transport)});
   const server=new Server({name:'dummy-low-level',version:'0'},{capabilities:{tools:{}},taskStore:store});
   server.setRequestHandler(ListToolsRequestSchema,()=>({tools:[{name:'echo',inputSchema:{type:'object',properties:{marker:{type:'string'}},required:['marker']}}]}));
   server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{await new Promise(resolve=>setTimeout(resolve,25));return {content:[{type:'text',text:JSON.stringify({marker:request.params.arguments.marker,session:extra.sessionId})}]}});
   await server.connect(transport);servers.push(server);
  }
  await transport.handleRequest(req,res,body);
 }catch{if(!res.headersSent)res.writeHead(500);res.end()}});
 await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
 const clients=[new Client({name:'dummy-stateful-a',version:'0'}),new Client({name:'dummy-stateful-b',version:'0'})];
 try{
  const url=new URL('http://127.0.0.1:'+web.address().port+'/mcp');
  await Promise.all(clients.map(c=>c.connect(new StreamableHTTPClientTransport(url))));
  assert.equal(sessions.size,2);
  const r=await Promise.all(clients.map((c,i)=>c.callTool({name:'echo',arguments:{marker:'session-'+i}})));
  const a=JSON.parse(r[0].content[0].text),b=JSON.parse(r[1].content[0].text);
  assert.notEqual(a.session,b.session);assert.equal(a.marker,'session-0');assert.equal(b.marker,'session-1');
  console.log('PASS SDK1.32 low-level Server+streamable transport actual two stateful HTTP sessions initialize and call concurrently');
  const task=await store.createTask({ttl:60000,pollInterval:1000},1,{method:'tools/call',params:{name:'dummy'}},a.session);
  assert.equal(await store.getTask(task.taskId,b.session),null);
  assert((await store.getTask(task.taskId,a.session)).taskId===task.taskId);
  assert.equal((await store.listTasks(undefined,b.session)).tasks.length,0);
  await assert.rejects(()=>store.updateTaskStatus(task.taskId,'cancelled',undefined,b.session));
  await store.storeTaskResult(task.taskId,'completed',{dummy:'private'},a.session);
  await assert.rejects(()=>store.getTaskResult(task.taskId,b.session));
  assert.equal((await store.getTaskResult(task.taskId,a.session)).dummy,'private');
  console.log('PASS SDK1.32 shared taskStore denies cross-session get/list/update/result while owner succeeds');
 }finally{await Promise.all(clients.map(c=>c.close()));await Promise.all(servers.map(s=>s.close()));store.cleanup();web.closeAllConnections();await new Promise(resolve=>web.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
