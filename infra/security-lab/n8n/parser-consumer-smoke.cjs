'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{Worker}=require('node:worker_threads');
const store='/usr/local/lib/node_modules/n8n/node_modules/.pnpm';
async function checkReference(root){
 const program="const{parentPort,workerData}=require('node:worker_threads');const Markdown=require(workerData.root);const md=new Markdown();parentPort.postMessage({ready:true});const t=performance.now();md.render(workerData.prefix+'x\\n'.repeat(100000));parentPort.postMessage({bounded:true,ms:Math.round(performance.now()-t)});";
 const worker=new Worker(program,{eval:true,workerData:{root,prefix:'[a]: /u "'},resourceLimits:{maxOldGenerationSizeMb:128}});let timer;
 try{return await new Promise((resolve,reject)=>{timer=setTimeout(()=>resolve({bounded:false,bootLimitMs:10000}),10000);worker.on('message',message=>{clearTimeout(timer);if(message.ready)timer=setTimeout(()=>resolve({bounded:false,processingLimitMs:1200}),1200);else resolve(message);});worker.once('error',reject);});}finally{clearTimeout(timer);await worker.terminate();}
}
(async()=>{
 const slot=fs.readdirSync(store).filter(name=>name.startsWith('markdown-it@'));assert.equal(slot.length,1);
 const roots=[path.join(store,slot[0],'node_modules/markdown-it'),'/opt/velodrive-security/node_modules/markdown-it'],references=[];
 for(const root of roots){const result=await checkReference(root);references.push({version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,...result});}
 const renderer=require('/opt/velodrive-security/node_modules/@vue/server-renderer');
 const rendered=renderer.ssrRenderAttrs({['x\rsrc\ronerror']:'globalThis.__qa=1'});
 const normal=renderer.ssrRenderAttrs({class:'qa',id:'local-fixture'});
 const ssrBlocked=!rendered.includes('\r')&&!/onerror\s*=/.test(rendered);assert.match(normal,/class="qa"/);
 console.log(JSON.stringify({references,ssrBlocked,productionData:false,externalNetwork:false}));
 if(references.some(item=>!item.bounded||item.version!=='14.3.3')||!ssrBlocked)process.exitCode=1;
})().catch(error=>{console.error(JSON.stringify({status:'PARSER_CONSUMER_NOT_COMPLETED',type:error.code||error.name}));process.exitCode=1;});
