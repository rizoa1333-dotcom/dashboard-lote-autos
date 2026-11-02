'use strict';
const assert=require('node:assert/strict');
/** Operator-only checks; no state is modified by this validator. */
function validateRuntime(runtime,software,databaseBefore,databaseAfter,configurationBefore,configurationAfter){
 assert.equal(runtime.initUid,1000);
 assert.ok(Array.isArray(runtime.mainNodeUids)&&runtime.mainNodeUids.length>0);assert.ok(runtime.mainNodeUids.every(uid=>uid===1000));
 assert.deepEqual(runtime.volume,{uid:1000,gid:1000,mode:'700',realPath:'/home/node/.n8n',symlink:false});
 assert.deepEqual(runtime.software,software);assert.deepEqual(runtime.http,{readiness:200,workflows:401,webhook:401});
 assert.equal(runtime.editor.releaseVisible,true);assert.equal(runtime.editor.vendorHash,software.hashes.vendor);
 assert.deepEqual(databaseAfter,databaseBefore);assert.equal(configurationAfter,configurationBefore);
 return true;
}
async function createDeployment(journal,persist,upload,previousId){
 journal.deploymentCreationAttempted=true;
 persist();
 // A timeout has an unknown remote outcome. Retrying could create a second writer.
 const result=await upload();
 assert.match(result.deploymentId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
 assert.notEqual(result.deploymentId,previousId);
 journal.newDeployment=result.deploymentId;journal.deploymentCreationSucceeded=true;
 persist();return result.deploymentId;
}
function openJournal(file){
 const fs=require('node:fs'),fd=fs.openSync(file,'wx',0o600);
 return{persist(value){const bytes=Buffer.from(JSON.stringify(value,null,2));let offset=0;while(offset<bytes.length)offset+=fs.writeSync(fd,bytes,offset,bytes.length-offset,offset);fs.ftruncateSync(fd,bytes.length);fs.fsyncSync(fd);},close(){fs.closeSync(fd);}};
}
function assertIsolatedNetwork(network,allowedNames){
 assert.equal(network.Internal,true);assert.ok(network.Containers&&typeof network.Containers==='object'&&!Array.isArray(network.Containers));
 const allowed=new Set(allowedNames);for(const member of Object.values(network.Containers))assert.ok(allowed.has(member.Name));
}
async function awaitInactive(readState,wait,checks=10){
 assert.ok(Number.isInteger(checks)&&checks>=1&&checks<=30);
 for(let i=0;i<checks;i++){
  const state=await readState(),pending=['BUILDING','QUEUED','WAITING'].includes(state.status);
  const inactive=Array.isArray(state.instances)&&state.instances.every(x=>['STOPPED','EXITED','REMOVED','CRASHED'].includes(x.status));
  const terminal=['REMOVED','FAILED','CANCELLED','SKIPPED'].includes(state.status);
  if(!pending&&inactive&&(state.deploymentStopped===true||terminal))return state;
  if(i+1<checks)await wait(1000);
 }
 throw Error('OLD_DEPLOYMENT_NOT_INACTIVE');
}
module.exports={validateRuntime,createDeployment,openJournal,assertIsolatedNetwork,awaitInactive};
