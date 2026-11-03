'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const target='/evolution/dist/main.js',before=fs.readFileSync(target,'utf8');
assert.equal(hash(before),'e6d7c75ec7fe13427f30c5738401b06e62b51d436dabc18f41ce7c3216f39a1a');
assert.equal(hash(fs.readFileSync('/evolution/security/request-budget.cjs')),'b507be0c9ebe645dc24e27f21ed0fb31b4bc2ea511a335a2cd561695fc4da6aa');
const after=require('./harden-media.cjs').hardenManagerCors(before);
assert.equal(after.split('VeloDriveRequestBudget.managerCors(').length,2);
fs.writeFileSync(target,after);console.log(JSON.stringify({managerCorsPatched:true,mainSha256:hash(after),budgetSha256:'b507be0c9ebe645dc24e27f21ed0fb31b4bc2ea511a335a2cd561695fc4da6aa'}));
