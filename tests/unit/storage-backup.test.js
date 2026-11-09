const test=require('node:test'),assert=require('node:assert/strict');
let api={};try{api=require('../../scripts/lib/storage-backup.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const bucket={id:'documentos-leads',name:'documentos-leads',public:false,file_size_limit:null,allowed_mime_types:null};
function row(name,id=name){return{name,id,created_at:'2026-11-01T10:00:00Z',updated_at:'2026-11-01T10:00:00Z',last_accessed_at:'2026-11-01T10:00:00Z',metadata:{size:3,mimetype:'text/plain',cacheControl:'max-age=3600',eTag:'same'}};}

test('el inventario recorre carpetas y todas las paginas sin perder objetos',async()=>{
 assert.equal(typeof api.collectInventory,'function');
 const pages={'':[{name:'lote',id:null,metadata:null},row('a.txt')],lote:[row('b.txt'),row('c.txt'),row('d.txt')]},calls=[];
 const inventory=await api.collectInventory([bucket],async(id,prefix,offset,limit)=>{calls.push({id,prefix,offset});return pages[prefix].slice(offset,offset+limit)},{pageSize:2});
 assert.deepEqual(inventory.objects.map(x=>x.key).sort(),['a.txt','lote/b.txt','lote/c.txt','lote/d.txt']);
 assert.equal(inventory.totalBytes,12);assert.equal(inventory.buckets[0].public,false);
 assert.ok(calls.some(x=>x.prefix==='lote'&&x.offset===2));
});

test('rutas peligrosas no se convierten en URLs ni nombres de archivos de restauracion',()=>{
 assert.equal(typeof api.downloadPath,'function');
 for(const key of ['../x','/x','x/../y','x\\y','x\nq','x//y'])assert.throws(()=>api.downloadPath(bucket.id,key),/STORAGE_/);
 assert.equal(api.downloadPath(bucket.id,'lote/foto con espacio.png'),'/storage/v1/object/authenticated/documentos-leads/lote/foto%20con%20espacio.png');
 const a=api.objectFilename('car-images','a/foto.png'),b=api.objectFilename(bucket.id,'a/foto.png');
 assert.match(a,/^[a-f0-9]{64}\.blob$/);assert.notEqual(a,b);
});

test('metadatos incompletos, repetidos y limites excedidos impiden declarar una copia completa',async()=>{
 assert.equal(typeof api.collectInventory,'function');
 await assert.rejects(api.collectInventory([bucket],async()=>[{...row('x'),metadata:{}}]),/STORAGE_/);
 await assert.rejects(api.collectInventory([bucket],async()=>[row('x'),row('x')]),/STORAGE_/);
 await assert.rejects(api.collectInventory([bucket],async()=>[row('x'),row('y')],{maxObjects:1}),/STORAGE_/);
 await assert.rejects(api.collectInventory([bucket],async()=>[{...row('x'),metadata:{size:64*1024*1024+1}}]),/STORAGE_/);
});

test('el cambio concurrente se detecta aunque el numero de archivos no cambie',async()=>{
 assert.equal(typeof api.assertStable,'function');
 const before=await api.collectInventory([bucket],async()=>[row('x')]);
 const accessed=await api.collectInventory([bucket],async()=>[{...row('x'),last_accessed_at:'2026-11-03T12:00:00Z'}]);
 assert.equal(api.assertStable(before,accessed),true);
 const changed=await api.collectInventory([bucket],async()=>[{...row('x'),updated_at:'2026-11-03T12:00:00Z'}]);
 assert.throws(()=>api.assertStable(before,changed),/STORAGE_CHANGED_DURING_BACKUP/);
 const publicBucket=await api.collectInventory([{...bucket,public:true}],async()=>[row('x')]);
 assert.throws(()=>api.assertStable(before,publicBucket),/STORAGE_CHANGED_DURING_BACKUP/);
});

test('un objeto y un prefijo virtual pueden compartir nombre sin perder ninguno',async()=>{
 const inventory=await api.collectInventory([bucket],async(id,prefix)=>prefix?[row('child.txt')]:[{name:'folder',id:null,metadata:null},row('folder')]);
 assert.deepEqual(inventory.objects.map(x=>x.key),['folder','folder/child.txt']);
});
