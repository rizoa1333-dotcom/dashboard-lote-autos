'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const LIMIT=64*1024*1024;
/** @typedef {{file:string,output:string,key:string,iv:string,tag:string}} BackupEntry */
/** @param {string} root @param {unknown} relative */
function contained(root,relative){
  if(typeof relative!=='string'||!relative.length||relative.length>240||!/^[-A-Za-z0-9_.]+(?:\/[-A-Za-z0-9_.]+)*$/.test(relative))throw Error('RECOVERY_FILE_PATH_INVALID');
  const segments=relative.split('/');
  if(segments.some(part=>part==='.'||part==='..'||part.endsWith('.')||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)))throw Error('RECOVERY_FILE_PATH_INVALID');
  const target=path.resolve(root,...segments),relation=path.relative(path.resolve(root),target);
  if(relation.startsWith('..')||path.isAbsolute(relation))throw Error('RECOVERY_FILE_PATH_INVALID');
  return target;
}
/** @param {{backups:BackupEntry[]}} bundle */
function entries(bundle){
  if(!Array.isArray(bundle?.backups)||bundle.backups.length<1||bundle.backups.length>16)throw Error('RECOVERY_BACKUP_INVALID');
  const names=new Set();
  for(const entry of bundle.backups){
    if(!entry||typeof entry!=='object')throw Error('RECOVERY_BACKUP_INVALID');
    contained('.',entry.file);contained('.',entry.output);
    const output=entry.output.toLowerCase();
    if(names.has(output))throw Error('RECOVERY_FILE_PATH_INVALID');
    names.add(output);
  }
  return bundle.backups;
}
/** @param {unknown} value @param {number} size */
function decode(value,size){
  if(typeof value!=='string'||value.length!==4*Math.ceil(size/3))throw Error('RECOVERY_BACKUP_INVALID');
  const result=Buffer.from(value,'base64');
  if(result.length!==size||result.toString('base64')!==value)throw Error('RECOVERY_BACKUP_INVALID');
  return result;
}
/** @param {BackupEntry} entry @param {Buffer} encrypted @returns {Buffer} */
function decryptBytes(entry,encrypted){
  if(!Buffer.isBuffer(encrypted)||encrypted.length<1||encrypted.length>LIMIT)throw Error('RECOVERY_BACKUP_INVALID');
  const key=decode(entry.key,32),iv=decode(entry.iv,12),tag=decode(entry.tag,16);let first;
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv,{authTagLength:16});decipher.setAuthTag(tag);
    first=decipher.update(encrypted);
    const plain=Buffer.concat([first,decipher.final()]);return plain;
  }catch{throw Error('RECOVERY_BACKUP_INVALID');}
  finally{key.fill(0);first?.fill(0);}
}
/** @param {BackupEntry} entry @param {string} root @returns {Buffer} */
function decrypt(entry,root){
  const file=contained(root,entry.file),realRoot=fs.realpathSync(root),realFile=fs.realpathSync(file);
  const relation=path.relative(realRoot,realFile);
  if(relation.startsWith('..')||path.isAbsolute(relation))throw Error('RECOVERY_FILE_PATH_INVALID');
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size<1||stat.size>LIMIT)throw Error('RECOVERY_BACKUP_INVALID');
  return decryptBytes(entry,fs.readFileSync(file));
}
/** @param {BackupEntry} entry @param {Buffer} bytes */
function authenticate(entry,bytes){const plain=decryptBytes(entry,bytes);plain.fill(0);return true;}
/** @param {{backups:BackupEntry[]}} bundle @param {string} root */
function verify(bundle,root){
  const list=entries(bundle);
  for(const entry of list){const plain=decrypt(entry,root);plain.fill(0);}
  return list.length;
}
/** Explicit extraction creates plaintext only in a new destination chosen by the operator. */
function extract(bundle,root,output){
  const target=path.resolve(output);
  if(fs.existsSync(target))throw Error('RECOVERY_OUTPUT_EXISTS');
  verify(bundle,root);
  fs.mkdirSync(target,{mode:0o700});
  for(const entry of entries(bundle)){
    const file=contained(target,entry.output);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    const plain=decrypt(entry,root);
    try{fs.writeFileSync(file,plain,{flag:'wx',mode:0o600});}finally{plain.fill(0);}
  }
  fs.writeFileSync(path.join(target,'service-configuration.json'),JSON.stringify({environments:bundle.environments||[],n8nEncryptionKeys:bundle.n8nEncryptionKeys||[]},null,2),{flag:'wx',mode:0o600});
  return bundle.backups.length;
}
module.exports={verify,extract,authenticate};
