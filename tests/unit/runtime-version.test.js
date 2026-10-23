const test=require('node:test');
const assert=require('node:assert/strict');
const pkg=require('../../package.json');
const lock=require('../../package-lock.json');

test('producción fija Node 24 LTS con al menos el parche de seguridad 24.22.1',()=>{
  assert.match(pkg.engines.node,/^24\.\d+\.\d+$/);
  const [,minor,patch]=pkg.engines.node.split('.').map(Number);
  assert.ok(minor>22||(minor===22&&patch>=1));
  assert.equal(lock.packages[''].engines.node,pkg.engines.node);
});
