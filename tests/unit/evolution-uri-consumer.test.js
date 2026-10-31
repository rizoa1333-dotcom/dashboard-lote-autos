'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {patchQueryString}=require('../../infra/security-lab/evolution/harden-uri-consumer.cjs');
const original="'use strict';\nconst decodeComponent = require('decode-uri-component');\nexports.decode = value => decodeComponent(value);\n";
test('el consumidor CJS usa el export default de la version ESM revisada',()=>{
 const result=patchQueryString(original,'7.1.3');
 assert.equal(result,original.replace("require('decode-uri-component')","require('decode-uri-component').default"));
});
test('el consumidor URI rechaza cambio de version, ancla ausente o anclas duplicadas',()=>{
 assert.throws(()=>patchQueryString(original,'8.0.0'),/URI_CONSUMER_DRIFT/);
 assert.throws(()=>patchQueryString('changed','7.1.3'),/URI_CONSUMER_DRIFT/);
 assert.throws(()=>patchQueryString(original+original,'7.1.3'),/URI_CONSUMER_DRIFT/);
});
test('el lock conserva las versiones revisadas y la construccion adapta el consumidor',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'../../infra/security-lab/evolution');
 const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
 assert.equal(lock.packages['node_modules/decode-uri-component'].version,'0.5.1');
 assert.equal(lock.packages['node_modules/follow-redirects'].version,'1.16.2');
 assert.equal(lock.packages['node_modules/query-string'].version,'7.1.3');
 assert.match(fs.readFileSync(path.join(root,'Dockerfile'),'utf8'),/&& node \/tmp\/harden-uri-consumer\.cjs/);
});
