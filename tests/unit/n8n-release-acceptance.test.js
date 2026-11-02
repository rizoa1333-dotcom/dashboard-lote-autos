'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateRuntime}=require('../../infra/security-lab/n8n/release-acceptance.cjs');
const {createDeployment}=require('../../infra/security-lab/n8n/release-acceptance.cjs');
const {openJournal,assertIsolatedNetwork}=require('../../infra/security-lab/n8n/release-acceptance.cjs');
const {awaitInactive}=require('../../infra/security-lab/n8n/release-acceptance.cjs');
function fixture(){
 const software={version:'2.45.4',node:'fixture-node',versions:{markdown:'14.3.3'},hashes:{vendor:'reviewed',hardener:'fixed'}};
 const database={workflows:16,active:3,credentials:5,migrations:316,workflowHash:'workflows',credentialHash:'credentials',migrationHash:'migrations'};
 return{runtime:{initUid:1000,mainNodeUids:[1000],volume:{uid:1000,gid:1000,mode:'700',realPath:'/home/node/.n8n',symlink:false},software,http:{readiness:200,workflows:401,webhook:401},editor:{releaseVisible:true,vendorHash:'reviewed'}},software,database,configuration:'same-config'};
}
test('release acceptance requires both runtime software and unchanged critical database state',()=>{const f=fixture();assert.doesNotThrow(()=>validateRuntime(f.runtime,f.software,f.database,f.database,f.configuration,f.configuration));});
test('a healthy server with stale served browser code is rejected',()=>{const f=fixture();f.runtime.editor.vendorHash='old';assert.throws(()=>validateRuntime(f.runtime,f.software,f.database,f.database,f.configuration,f.configuration));});
test('UID, volume permissions, unauthorized responses and missing editor release fail closed',()=>{
 for(const change of [f=>f.runtime.initUid=0,f=>f.runtime.mainNodeUids=[0],f=>f.runtime.volume.mode='755',f=>f.runtime.volume.symlink=true,f=>f.runtime.http.webhook=200,f=>f.runtime.editor.releaseVisible=false]){
  const f=fixture();change(f);assert.throws(()=>validateRuntime(f.runtime,f.software,f.database,f.database,f.configuration,f.configuration));
 }
});
test('changed credentials, workflow state, migrations or environment cannot be accepted',()=>{
 for(const field of ['credentialHash','workflowHash','migrationHash','active']){const f=fixture(),after={...f.database,[field]:'changed'};assert.throws(()=>validateRuntime(f.runtime,f.software,f.database,after,f.configuration,f.configuration));}
 const f=fixture();assert.throws(()=>validateRuntime(f.runtime,f.software,f.database,f.database,f.configuration,'changed'));
});

test('deployment intent reaches durable storage before one remote mutation',async()=>{
 const journal={},persisted=[];let calls=0;
 const id=await createDeployment(journal,()=>persisted.push(structuredClone(journal)),async()=>{
  calls++;assert.equal(persisted.at(-1).deploymentCreationAttempted,true);
  return{deploymentId:'12345678-1234-1234-1234-123456789abc'};
 },'00000000-0000-0000-0000-000000000000');
 assert.equal(id,journal.newDeployment);assert.equal(calls,1);assert.equal(persisted.at(-1).deploymentCreationSucceeded,true);
});
test('a failed journal write prevents upload and a timed-out upload is never retried',async()=>{
 let calls=0;
 await assert.rejects(createDeployment({},()=>{throw Error('DISK_FULL');},async()=>{calls++;},'old'),/DISK_FULL/);
 assert.equal(calls,0);
 const journal={};await assert.rejects(createDeployment(journal,()=>{},async()=>{calls++;throw Error('NETWORK_TIMEOUT');},'old'),/NETWORK_TIMEOUT/);
 assert.equal(calls,1);assert.equal(journal.deploymentCreationAttempted,true);assert.equal(journal.newDeployment,undefined);
});
test('journal ownership is atomic and another invocation cannot erase prior recovery state',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'n8n-journal-')),file=path.join(dir,'state.json');
 let store;
 try{store=openJournal(file);store.persist({newDeployment:'retained',deploymentCreationAttempted:true});assert.throws(()=>openJournal(file),{code:'EEXIST'});assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).newDeployment,'retained');store.persist({newDeployment:'retained'});assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{newDeployment:'retained'});}
 finally{store?.close();if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});
test('restore refuses a routable network, absent member metadata or any unrelated member',()=>{
 assert.doesNotThrow(()=>assertIsolatedNetwork({Internal:true,Containers:{}},[]));
 assert.doesNotThrow(()=>assertIsolatedNetwork({Internal:true,Containers:{id:{Name:'owned'}}},['owned']));
 for(const network of [{Internal:false,Containers:{}},{Internal:true},{Internal:true,Containers:{id:{Name:'other'}}}])assert.throws(()=>assertIsolatedNetwork(network,['owned']));
});
test('retired deployment validation waits through removal bookkeeping and accepts only inactive instances',async()=>{
 const states=[{status:'REMOVED',deploymentStopped:true,instances:[{status:'REMOVING'}]},{status:'REMOVED',deploymentStopped:false,instances:[{status:'REMOVED'}]}];
 let reads=0,waits=0;const result=await awaitInactive(()=>states[reads++],async()=>{waits++;},3);
 assert.equal(reads,2);assert.equal(waits,1);assert.equal(result.instances[0].status,'REMOVED');
});
test('a pending build or running old instance never passes retirement validation',async()=>{
 for(const state of [{status:'BUILDING',deploymentStopped:true,instances:[]},{status:'SUCCESS',deploymentStopped:true,instances:[{status:'RUNNING'}]},{status:'SUCCESS',deploymentStopped:false,instances:[]}]){
  let reads=0;await assert.rejects(awaitInactive(()=>{reads++;return state;},async()=>{},3),/OLD_DEPLOYMENT_NOT_INACTIVE/);assert.equal(reads,3);
 }
});
