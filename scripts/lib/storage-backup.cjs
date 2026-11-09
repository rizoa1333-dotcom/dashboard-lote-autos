'use strict';
const crypto=require('node:crypto');

const FILE_LIMIT=64*1024*1024,TOTAL_LIMIT=1024*1024*1024;
/** @typedef {{name:string,id?:string|null,created_at?:string,updated_at?:string,metadata?:Record<string,unknown>|null}} StorageRow */
/** @typedef {{bucket:string,key:string,id:string,bytes:number,mimeType:string,cacheControl:string,etag:string,createdAt:string,updatedAt:string}} StorageObject */
/** @typedef {{version:1,buckets:Array<Record<string,unknown>>,objects:StorageObject[],totalBytes:number}} StorageInventory */
/** @typedef {(bucket:string,prefix:string,offset:number,limit:number)=>Promise<StorageRow[]>} ListPage */
const compare=(a,b)=>a<b?-1:a>b?1:0;
function fail(code){throw Error(code);}
function validBucket(id){
 if(typeof id!=='string'||!/^[-A-Za-z0-9_.]{1,100}$/.test(id)||id==='.'||id==='..')fail('STORAGE_BUCKET_INVALID');
 return id;
}
/** Storage keys stay metadata; restored filesystem names never come from them. */
function validKey(key){
 if(typeof key!=='string'||!key.length||key.length>1024||/[\u0000-\u001f\u007f\\]/.test(key)||key.split('/').some(p=>!p||p==='.'||p==='..'))fail('STORAGE_PATH_INVALID');
 try{encodeURIComponent(key);}catch{fail('STORAGE_PATH_INVALID');}
 return key;
}
/** @param {string} bucket @param {string} key @returns {string} */
function downloadPath(bucket,key){
 return '/storage/v1/object/authenticated/'+encodeURIComponent(validBucket(bucket))+'/'+validKey(key).split('/').map(encodeURIComponent).join('/');
}
/** @param {string} bucket @param {string} key @returns {string} */
function objectFilename(bucket,key){
 return crypto.createHash('sha256').update(validBucket(bucket)+'\0'+validKey(key)).digest('hex')+'.blob';
}
function boundedText(value,limit=1024){
 if(value===undefined||value===null)return '';
 if(typeof value!=='string'||value.length>limit)fail('STORAGE_METADATA_INVALID');
 return value;
}
function bucketConfig(bucket){
 const id=validBucket(bucket?.id);
 if(typeof bucket.public!=='boolean'||(bucket.name!==undefined&&bucket.name!==id))fail('STORAGE_BUCKET_INVALID');
 const max=bucket.file_size_limit??null;
 if(max!==null&&(!Number.isSafeInteger(max)||max<0))fail('STORAGE_BUCKET_INVALID');
 const mime=bucket.allowed_mime_types??null;
 if(mime!==null&&(!Array.isArray(mime)||mime.length>100||mime.some(x=>typeof x!=='string'||x.length>256)))fail('STORAGE_BUCKET_INVALID');
 return {id,name:id,public:bucket.public,file_size_limit:max,allowed_mime_types:mime?[...mime].sort(compare):null};
}
/** @param {Array<Record<string,unknown>>} buckets @param {ListPage} list @param {{pageSize?:number,maxObjects?:number}} options @returns {Promise<StorageInventory>} */
async function collectInventory(buckets,list,options={}){
 const pageSize=options.pageSize??1000,maxObjects=options.maxObjects??250;
 if(!Array.isArray(buckets)||buckets.length>32||typeof list!=='function'||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>1000||!Number.isSafeInteger(maxObjects)||maxObjects<1||maxObjects>250)fail('STORAGE_INVENTORY_LIMIT');
 const configs=buckets.map(bucketConfig).sort((a,b)=>compare(a.id,b.id));
 if(new Set(configs.map(b=>b.id)).size!==configs.length)fail('STORAGE_DUPLICATE_BUCKET');
 const objects=[],identities=new Set();let totalBytes=0,pages=0;
 for(const bucket of configs){
  const queue=[''],folders=new Set(['']);
  for(let cursor=0;cursor<queue.length;cursor++){
   const prefix=queue[cursor];
   for(let offset=0;;offset+=pageSize){
    if(++pages>2048)fail('STORAGE_PAGE_LIMIT');
    const rows=await list(bucket.id,prefix,offset,pageSize);
    if(!Array.isArray(rows)||rows.length>pageSize)fail('STORAGE_PAGE_INVALID');
    for(const row of rows){
     if(!row||typeof row.name!=='string'||row.name.includes('/'))fail('STORAGE_PATH_INVALID');
     const key=validKey(prefix?prefix+'/'+row.name:row.name);
     if(!row.id&&!row.metadata){
      if(folders.has(key))fail('STORAGE_DUPLICATE_OBJECT');
      if(folders.size>=1024||key.split('/').length>20)fail('STORAGE_FOLDER_LIMIT');
      folders.add(key);queue.push(key);continue;
     }
     const id=boundedText(row.id,256),bytes=row.metadata?.size,identity=bucket.id+'\0'+key;
     if(!id||!Number.isSafeInteger(bytes)||bytes<0||bytes>FILE_LIMIT)fail('STORAGE_METADATA_INVALID');
     if(identities.has(identity))fail('STORAGE_DUPLICATE_OBJECT');
     identities.add(identity);totalBytes+=bytes;
     if(objects.length>=maxObjects||totalBytes>TOTAL_LIMIT)fail('STORAGE_INVENTORY_LIMIT');
     objects.push({bucket:bucket.id,key,id,bytes,mimeType:boundedText(row.metadata.mimetype,256),cacheControl:boundedText(row.metadata.cacheControl),etag:boundedText(row.metadata.eTag??row.metadata.etag,256),createdAt:boundedText(row.created_at,100),updatedAt:boundedText(row.updated_at,100)});
    }
    if(rows.length<pageSize)break;
   }
  }
 }
 objects.sort((a,b)=>compare(a.bucket+'\0'+a.key,b.bucket+'\0'+b.key));
 return {version:1,buckets:configs,objects,totalBytes};
}
/** @param {StorageInventory} before @param {StorageInventory} after @returns {true} */
function assertStable(before,after){
 if(JSON.stringify(before)!==JSON.stringify(after))fail('STORAGE_CHANGED_DURING_BACKUP');
 return true;
}
module.exports={collectInventory,downloadPath,objectFilename,assertStable};
