'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {planAssetNames,rewriteAssetReferences,patchVendor}=require('../../infra/security-lab/n8n/harden-editor.cjs');
test('editor cache invalidation renames every script and matching source map consistently',()=>{
 const names=planAssetNames(['app-HbkQE-io.js','vendor-CvFzIYav.js','worker.js','worker.js.map']);
 const source='import "./vendor-CvFzIYav.js";const deps=["app-HbkQE-io.js","worker.js"];//# sourceMappingURL=worker.js.map';
 const actual=rewriteAssetReferences(source,names);
 assert.match(actual,/vendor-CvFzIYav-vd-security-20261101\.js/);assert.match(actual,/app-HbkQE-io-vd-security-20261101\.js/);assert.match(actual,/worker-vd-security-20261101\.js\.map/);
 assert.doesNotMatch(actual,/"worker\.js"|vendor-CvFzIYav\.js|app-HbkQE-io\.js/);
});
test('asset planning refuses traversal, repeated names and already patched files',()=>{
 for(const names of [['../unsafe.js'],['file.js','file.js'],['file-vd-security-20261101.js'],['a/b.js']])assert.throws(()=>planAssetNames(names));
});
test('unknown vendor or upstream sources are rejected before creating a patched bundle',()=>{
 assert.throws(()=>patchVendor('unreviewed vendor','unreviewed sanitizer','unreviewed rule'),/EDITOR_VENDOR_HASH/);
});
