const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
let api={};try{api=require('../../scripts/lib/recovery-files.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'velodrive-recovery-test-'));
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),plain=Buffer.from('PGDMP_FIXTURE_ONLY');
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);fs.writeFileSync(path.join(root,'fixture.aesgcm'),encrypted);
 return {root,plain,entry:{file:'fixture.aesgcm',output:'fixture.dump',key:key.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')},cleanup(){fs.unlinkSync(path.join(root,'fixture.aesgcm'));fs.rmdirSync(root);}};
}
test('verificar comprueba cada respaldo sin crear archivos de texto claro',()=>{
 const f=fixture();try{assert.equal(typeof api.verify,'function');assert.equal(api.verify({backups:[f.entry]},f.root),1);assert.deepEqual(fs.readdirSync(f.root),['fixture.aesgcm']);}finally{f.cleanup();}
});
test('rutas fuera de la carpeta y etiquetas manipuladas nunca se aceptan',()=>{
 const f=fixture();try{assert.equal(typeof api.verify,'function');assert.throws(()=>api.verify({backups:[{...f.entry,file:'../fixture.aesgcm'}]},f.root),/RECOVERY_FILE_PATH_INVALID/);const bad={...f.entry,tag:crypto.randomBytes(16).toString('base64')};assert.throws(()=>api.verify({backups:[bad]},f.root),/RECOVERY_BACKUP_INVALID/);}finally{f.cleanup();}
});
test('extraer requiere destino nuevo y conserva exactamente los datos autenticados',()=>{
 const f=fixture(),output=path.join(f.root,'restored');try{assert.equal(typeof api.extract,'function');api.extract({backups:[f.entry],environments:[]},f.root,output);assert.deepEqual(fs.readFileSync(path.join(output,'fixture.dump')),f.plain);assert.throws(()=>api.extract({backups:[f.entry]},f.root,output),/RECOVERY_OUTPUT_EXISTS/);}finally{if(fs.existsSync(output)){for(const name of fs.readdirSync(output))fs.unlinkSync(path.join(output,name));fs.rmdirSync(output);}f.cleanup();}
});
