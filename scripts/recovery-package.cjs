'use strict';
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const {open}=require('./lib/recovery-crypto.cjs');
const files=require('./lib/recovery-files.cjs');
async function password(){
  if(!process.stdin.isTTY||!process.stdin.setRawMode)throw Error('RECOVERY_REQUIRES_INTERACTIVE_TERMINAL');
  readline.emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();
  process.stdout.write('Contraseña de recuperación: ');
  return new Promise((resolve,reject)=>{
    const chars=[];
    function finish(error){process.stdin.removeListener('keypress',press);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(Buffer.from(chars.join('').normalize('NFC'),'utf8'));chars.length=0;}
    function press(text,key){
      if(key?.ctrl&&key.name==='c'){finish(Error('RECOVERY_CANCELLED'));return;}
      if(key?.name==='return'){finish();return;}
      if(key?.name==='backspace'){chars.pop();return;}
      if(text&&!key?.ctrl&&!key?.meta&&!/[\x00-\x1f\x7f]/.test(text)&&chars.join('').length+text.length<=256)chars.push(text);
    }
    process.stdin.on('keypress',press);
  });
}
(async()=>{
  const [operation,folder,output]=process.argv.slice(2);
  if(!['verify','extract'].includes(operation)||!folder||(operation==='extract'&&!output))throw Error('USAGE: node recovery-package.cjs verify CARPETA | extract CARPETA DESTINO_NUEVO');
  const root=path.resolve(folder),file=path.join(root,'recovery-keys.encrypted.json');
  if(fs.statSync(file).size>2*1024*1024)throw Error('RECOVERY_PACKAGE_INVALID');
  const envelope=JSON.parse(fs.readFileSync(file,'utf8')),pass=await password();let bundle;
  try{bundle=await open(envelope,pass);}finally{pass.fill(0);}
  const count=operation==='verify'?files.verify(bundle,root):files.extract(bundle,root,output);
  console.log(JSON.stringify({operation,verifiedBackups:count,plaintextExported:operation==='extract'}));
})().catch(error=>{console.error(error.message?.startsWith('RECOVERY_')||error.message?.startsWith('USAGE:')?error.message:'RECOVERY_OPERATION_FAILED');process.exitCode=1});
