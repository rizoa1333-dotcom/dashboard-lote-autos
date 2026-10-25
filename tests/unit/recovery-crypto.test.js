const test=require('node:test'),assert=require('node:assert/strict');
let api={};try{api=require('../../scripts/lib/recovery-crypto.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const pass=()=>Buffer.from('fixture-recovery-passphrase');
test('paquete portable conserva datos de prueba sin exponerlos en el sobre',async()=>{
 assert.equal(typeof api.seal,'function');assert.equal(typeof api.open,'function');
 const original={backups:[{key:'FIXTURE_NOT_A_REAL_KEY'}],version:1};
 const envelope=await api.seal(original,pass());
 assert.equal(JSON.stringify(envelope).includes('FIXTURE_NOT_A_REAL_KEY'),false);
 assert.deepEqual(await api.open(envelope,pass()),original);
});
test('contraseña incorrecta y cifrado alterado fallan sin devolver contenido parcial',async()=>{
 assert.equal(typeof api.seal,'function');
 const envelope=await api.seal({fixture:true},pass());
 await assert.rejects(api.open(envelope,Buffer.from('different-fixture-passphrase')),/RECOVERY_AUTHENTICATION_FAILED/);
 const bytes=Buffer.from(envelope.ciphertext,'base64');bytes[0]^=1;
 await assert.rejects(api.open({...envelope,ciphertext:bytes.toString('base64')},pass()),/RECOVERY_AUTHENTICATION_FAILED/);
});
test('parámetros manipulados o tamaños peligrosos se rechazan antes de derivar',async()=>{
 assert.equal(typeof api.open,'function');
 const base={format:1,algorithm:'aes-256-gcm',kdf:{name:'scrypt',N:2147483648,r:8,p:1,salt:'AA=='},iv:'AA==',tag:'AA==',ciphertext:'AA=='};
 await assert.rejects(api.open(base,pass()),/RECOVERY_PACKAGE_INVALID/);
 await assert.rejects(api.open({...base,format:2},pass()),/RECOVERY_PACKAGE_INVALID/);
 const valid=await api.seal({fixture:true},pass());
 await assert.rejects(api.open({...valid,ciphertext:'A'.repeat(2*1024*1024)},pass()),/RECOVERY_PACKAGE_INVALID/);
 for(const field of ['iv','tag']){
  const changed=Buffer.from(valid[field],'base64');changed[0]^=1;
  await assert.rejects(api.open({...valid,[field]:changed.toString('base64')},pass()),/RECOVERY_AUTHENTICATION_FAILED/);
 }
});
test('frases cortas y cargas excesivas no crean un paquete débil o incompleto',async()=>{
 assert.equal(typeof api.seal,'function');
 await assert.rejects(api.seal({fixture:true},Buffer.from('short')),/RECOVERY_PASSPHRASE_LENGTH/);
 await assert.rejects(api.seal({fixture:'A'.repeat(1024*1024)},pass()),/RECOVERY_PACKAGE_TOO_LARGE/);
});
