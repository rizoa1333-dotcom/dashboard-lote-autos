'use strict';
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const LIMIT=1024*1024;
const PARAMETERS=Object.freeze({N:131072,r:8,p:1,maxmem:256*1024*1024});
const AAD=Buffer.from('VeloDrive recovery package v1','utf8');
/** @typedef {{format:1,algorithm:'aes-256-gcm',kdf:{name:'scrypt',N:number,r:number,p:number,salt:string},iv:string,tag:string,ciphertext:string}} RecoveryEnvelope */
/** @param {Buffer} passphrase */
function validatePassphrase(passphrase){
  if(!Buffer.isBuffer(passphrase)||passphrase.length<16||passphrase.length>1024)throw Error('RECOVERY_PASSPHRASE_LENGTH');
}
/** @param {unknown} value @param {number} maxBytes @param {number} [exactBytes] */
function decode(value,maxBytes,exactBytes){
  if(typeof value!=='string'||value.length>4*Math.ceil(maxBytes/3)||!value.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('RECOVERY_PACKAGE_INVALID');
  const bytes=Buffer.from(value,'base64');
  if(bytes.length>maxBytes||(exactBytes!==undefined&&bytes.length!==exactBytes)||bytes.toString('base64')!==value)throw Error('RECOVERY_PACKAGE_INVALID');
  return bytes;
}
/** @param {Record<string,unknown>} data @param {Buffer} passphrase @returns {Promise<RecoveryEnvelope>} */
async function seal(data,passphrase){
  validatePassphrase(passphrase);
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('RECOVERY_PACKAGE_INVALID');
  const plaintext=Buffer.from(JSON.stringify(data),'utf8');
  if(plaintext.length>LIMIT){plaintext.fill(0);throw Error('RECOVERY_PACKAGE_TOO_LARGE');}
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);let key;
  try{
    key=await scrypt(passphrase,salt,32,PARAMETERS);
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv,{authTagLength:16});cipher.setAAD(AAD);
    const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    return {format:1,algorithm:'aes-256-gcm',kdf:{name:'scrypt',N:PARAMETERS.N,r:PARAMETERS.r,p:PARAMETERS.p,salt:salt.toString('base64')},iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
  }finally{plaintext.fill(0);key?.fill(0);}
}
/** @param {RecoveryEnvelope} envelope @param {Buffer} passphrase @returns {Promise<Record<string,unknown>>} */
async function open(envelope,passphrase){
  validatePassphrase(passphrase);
  if(envelope?.format!==1||envelope.algorithm!=='aes-256-gcm'||envelope.kdf?.name!=='scrypt'||envelope.kdf.N!==PARAMETERS.N||envelope.kdf.r!==PARAMETERS.r||envelope.kdf.p!==PARAMETERS.p)throw Error('RECOVERY_PACKAGE_INVALID');
  const salt=decode(envelope.kdf.salt,16,16),iv=decode(envelope.iv,12,12),tag=decode(envelope.tag,16,16),ciphertext=decode(envelope.ciphertext,LIMIT);
  let key,first,plaintext;
  try{
    key=await scrypt(passphrase,salt,32,PARAMETERS);
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv,{authTagLength:16});decipher.setAAD(AAD);decipher.setAuthTag(tag);
    first=decipher.update(ciphertext);plaintext=Buffer.concat([first,decipher.final()]);
    const value=JSON.parse(plaintext.toString('utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_RECOVERY_CONTENT');
    return value;
  }catch{throw Error('RECOVERY_AUTHENTICATION_FAILED');}
  finally{key?.fill(0);first?.fill(0);plaintext?.fill(0);}
}
module.exports={seal,open};
