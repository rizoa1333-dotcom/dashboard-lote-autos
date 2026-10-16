const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
test('regenerar flujos conserva credenciales, vigilancia y produce el mismo resultado',()=>{
  const repo=path.join(__dirname,'../..');
  const tempRoot=fs.realpathSync(os.tmpdir());
  const temp=fs.mkdtempSync(path.join(tempRoot,'velodrive-generator-'));
  const files=['VeloDrive-n8n-intervencion-automatica.json','VeloDrive-n8n-incidentes.json','VeloDrive-n8n-alertas-correo.json'];
  try {
    fs.mkdirSync(path.join(temp,'scripts'));
    for(const name of [...files,'whatsapp-reliability.js'])fs.copyFileSync(path.join(repo,name),path.join(temp,name));
    for(const name of ['update-whatsapp-reliability.cjs','update-incident-workflows.cjs'])fs.copyFileSync(path.join(repo,'scripts',name),path.join(temp,'scripts',name));
    const initial=JSON.parse(fs.readFileSync(path.join(temp,files[2])));
    const credentials=initial.nodes.find(n=>n.name==='Enviar alerta de soporte').credentials;
    const generate=()=>{for(const name of ['update-whatsapp-reliability.cjs','update-incident-workflows.cjs'])execFileSync(process.execPath,[path.join(temp,'scripts',name)],{cwd:temp});};
    generate();const first=files.map(name=>fs.readFileSync(path.join(temp,name),'utf8'));
    generate();assert.deepEqual(files.map(name=>fs.readFileSync(path.join(temp,name),'utf8')),first);
    assert.deepEqual(JSON.parse(first[2]).nodes.find(n=>n.name==='Enviar alerta de soporte').credentials,credentials);
    assert.ok(JSON.parse(first[1]).nodes.some(n=>n.name==='Detectar mensajes atascados'));
  } finally {
    assert.equal(path.dirname(fs.realpathSync(temp)),tempRoot,'la limpieza debe permanecer en la carpeta temporal');
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
