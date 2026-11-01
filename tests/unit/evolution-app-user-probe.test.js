'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {asApplicationUser}=require('../../infra/security-lab/evolution/app-user-probe.cjs');

test('application identity probe generates a bounded program with fixed UID, GID and working directory',()=>{
 const source=asApplicationUser('console.log(JSON.stringify({uid:process.getuid()}));');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/uid:1000,gid:1000/);
 assert.match(source,/cwd:'\/evolution'/);
 assert.match(source,/process\.getuid\(\)!==1000/);
 assert.match(source,/35000/);
 for(const invalid of ['',null,'\0','x'.repeat(65537)])assert.throws(()=>asApplicationUser(invalid),/INVALID_APP_PROBE/);
});

test('Linux probe reads the real cwd as the application user when root lacks ptrace', {skip:process.platform!=='linux'||process.getuid()!==0}, async()=>{
 const fs=require('node:fs'),{spawn}=require('node:child_process');
 const peer=spawn(process.execPath,['-e','setTimeout(()=>{},2000)'],{uid:1000,gid:1000,cwd:'/evolution',stdio:'ignore'});
 const exited=new Promise(resolve=>peer.once('exit',resolve));
 await new Promise((resolve,reject)=>{peer.once('spawn',resolve);peer.once('error',reject);});
 try{
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.throws(()=>fs.realpathSync('/proc/'+peer.pid+'/cwd'),error=>error.code==='EACCES');
  const program="const fs=require('node:fs');console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),cwd:fs.realpathSync('/proc/"+peer.pid+"/cwd')}));";
  const observer=spawn(process.execPath,[],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  observer.stdout.on('data',chunk=>stdout+=chunk);observer.stderr.on('data',chunk=>stderr+=chunk);
  const done=new Promise((resolve,reject)=>{observer.once('error',reject);observer.once('exit',code=>code===0?resolve():reject(new Error('PROBE_FAILED:'+stderr)));});
  observer.stdin.end(asApplicationUser(program));await done;
  assert.deepEqual(JSON.parse(stdout),{uid:1000,gid:1000,cwd:'/evolution'});
 }finally{await exited;}
});
