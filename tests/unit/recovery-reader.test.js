const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
let read;try{read=require('../../scripts/lib/recovery-reader.cjs').readBounded;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
test('el presupuesto real se conserva entre archivos aunque el inventario anterior fuera menor',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-read-')),file=path.join(root,'cipher');
 try{fs.writeFileSync(file,'123456');const budget={remaining:10};assert.equal(typeof read,'function');assert.equal(read(file,budget,8).toString(),'123456');assert.throws(()=>read(file,budget,8),/RECOVERY_TOTAL_SIZE_LIMIT/);}
 finally{fs.unlinkSync(file);fs.rmdirSync(root);}
});
test('crecimiento despues de abrir se rechaza sin leer un cuerpo ilimitado',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-read-')),file=path.join(root,'cipher');
 try{
  fs.writeFileSync(file,'1234');const original=fs.readSync;let changed=false;
  t.mock.method(fs,'readSync',function(...args){const count=original.apply(this,args);if(!changed){changed=true;fs.appendFileSync(file,'567890');}return count;});
  assert.equal(typeof read,'function');assert.throws(()=>read(file,{remaining:20},8),/RECOVERY_BACKUP_CHANGED/);
 }finally{t.mock.restoreAll();fs.unlinkSync(file);fs.rmdirSync(root);}
});
