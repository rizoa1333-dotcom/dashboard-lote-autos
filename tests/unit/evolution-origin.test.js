const test=require('node:test');
const assert=require('node:assert/strict');
const w=require('../../VeloDrive-n8n-intervencion-automatica.json');
const origin='https://evolution-api-production-3652.up.railway.app';

test('las llamadas autenticadas a Evolution declaran su origen permitido sin ampliar CORS',()=>{
  const nodes=w.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest'&&new RegExp('^=?'+origin.replaceAll('.','\\.')+'/').test(n.parameters.url||''));
  assert.equal(nodes.length,15);
  for(const node of nodes){
    assert.equal(node.parameters.sendHeaders,true,node.name);
    const headers=node.parameters.headerParameters.parameters;
    assert.ok(headers.some(h=>h.name.toLowerCase()==='apikey'),node.name);
    assert.deepEqual(headers.filter(h=>h.name.toLowerCase()==='origin'),[{name:'Origin',value:origin}],node.name);
  }
  for(const node of w.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest'&&!nodes.includes(n))){
    assert.equal(node.parameters.headerParameters?.parameters?.some(h=>h.name.toLowerCase()==='origin'&&h.value===origin)||false,false,node.name);
  }
});
