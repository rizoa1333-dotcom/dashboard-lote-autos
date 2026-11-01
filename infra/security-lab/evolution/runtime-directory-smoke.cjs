'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
if(process.env.VELODRIVE_QA_FIXTURE!=='1')throw Error('ISOLATED_FIXTURE_REQUIRED');
assert.equal(process.getuid(),1000);assert.equal(process.getgid(),1000);
const directory='/evolution/instances',state=fs.lstatSync(directory);
assert.equal(state.isDirectory(),true);assert.equal(state.isSymbolicLink(),false);
assert.equal(state.uid,1000);assert.equal(state.gid,1000);assert.equal(state.mode&0o7777,0o700);
assert.equal(fs.realpathSync(directory),directory);assert.equal(fs.readdirSync(directory).length,0);
const child=directory+'/qa-'+crypto.randomBytes(8).toString('hex');
try{fs.mkdirSync(child,{mode:0o700});fs.writeFileSync(child+'/probe','isolated fixture',{flag:'wx',mode:0o600});assert.equal(fs.readFileSync(child+'/probe','utf8'),'isolated fixture');}
finally{if(fs.existsSync(child+'/probe'))fs.unlinkSync(child+'/probe');if(fs.existsSync(child))fs.rmdirSync(child);}
const tmp=fs.lstatSync('/tmp');assert.equal(tmp.isDirectory(),true);assert.equal(tmp.mode&0o7777,0o1777);
const temp='/tmp/qa-directory-'+crypto.randomBytes(8).toString('hex');try{fs.writeFileSync(temp,'fixture',{flag:'wx',mode:0o600});}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),directoryMode:'700',tmpMode:'1777',tmpWritable:true,childWritable:true,fixtureRemoved:fs.readdirSync(directory).length===0}));
