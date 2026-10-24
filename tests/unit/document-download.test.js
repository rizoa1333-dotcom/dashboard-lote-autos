const test=require('node:test');
const assert=require('node:assert/strict');
let downloadDocumentMedia;
try{({downloadDocumentMedia}=require('../../document-download'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}

test('la descarga limita bytes decodificados antes de acumular JSON y no sigue redirecciones',async()=>{
 assert.equal(typeof downloadDocumentMedia,'function');
 let options;
 const result=await downloadDocumentMedia(async value=>{options=value;return {base64:'QUJD',irrelevant:'not forwarded'};},'instancia_fixture','WA_001','LOCAL_KEY');
 assert.deepEqual(result,{base64:'QUJD'});
 assert.equal(options.maxResponseBodyBytes,4*Math.ceil(10*1024*1024/3)+65536);
 assert.equal(options.disableFollowRedirect,true);
 assert.equal(options.timeout,15000);
 assert.equal(options.url,'https://evolution-api-production-3652.up.railway.app/chat/getBase64FromMediaMessage/instancia_fixture');
 assert.equal(options.headers.Origin,'https://evolution-api-production-3652.up.railway.app');
 assert.equal(options.headers.apikey,'LOCAL_KEY');
 assert.deepEqual(options.body,{message:{key:{id:'WA_001'}},convertToMp4:false});
 assert.equal(options.json,true);
});

test('la descarga no filtra errores del proveedor ni envia credenciales con identificadores invalidos',async()=>{
 assert.equal(typeof downloadDocumentMedia,'function');
 let called=0;
 const request=async()=>{called++;throw Error('Bearer SECRET_TOKEN https://secret.invalid');};
 await assert.rejects(()=>downloadDocumentMedia(request,'instance','WA_001','LOCAL_KEY'),{message:'DOCUMENT_DOWNLOAD_FAILED'});
 for(const instance of ['../other','https://evil.invalid','instance?redirect=x','']){
  await assert.rejects(()=>downloadDocumentMedia(request,instance,'WA_001','LOCAL_KEY'),/INVALID_DOCUMENT_DOWNLOAD/);
 }
 await assert.rejects(()=>downloadDocumentMedia(request,'instance','WA\r\n001','LOCAL_KEY'),/INVALID_DOCUMENT_DOWNLOAD/);
 await assert.rejects(()=>downloadDocumentMedia(request,'instance','WA_001',''),/INVALID_DOCUMENT_DOWNLOAD/);
 assert.equal(called,1);
});

test('la respuesta de descarga debe contener un base64 y no un cuerpo inesperado',async()=>{
 assert.equal(typeof downloadDocumentMedia,'function');
 for(const response of [null,{},'html',{base64:[]},{base64:''}]){
  await assert.rejects(()=>downloadDocumentMedia(async()=>response,'instance','WA_001','LOCAL_KEY'),/DOCUMENT_DOWNLOAD_FAILED/);
 }
});

test('el nodo de descarga conserva el tenant verificado y ejecuta el transporte acotado',async()=>{
 const workflow=require('../../VeloDrive-n8n-intervencion-automatica.json');
 const node=workflow.nodes.find(n=>n.name==='Obtener Base64 de Media');
 assert.equal(node.type,'n8n-nodes-base.code');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const execute=new AsyncFunction('$','$json','$env',node.parameters.jsCode);
 const auth={tenant_lote_id:'tenant_a',tenant_instance:'instancia_fixture'};
 let calls=0,options;
 const context={helpers:{httpRequest:async request=>{calls++;options=request;return {base64:'QUJD'};}}};
 const lookup=()=>({first:()=>({json:auth})});
 await assert.rejects(()=>execute.call(context,lookup,{lote_id:'tenant_b',messageId:'WA_001'},{EVOLUTION_API_KEY:'LOCAL_KEY'}),/DOCUMENT_TENANT_MISMATCH/);
 assert.equal(calls,0);
 const result=await execute.call(context,lookup,{lote_id:'tenant_a',messageId:'WA_001'},{EVOLUTION_API_KEY:'LOCAL_KEY'});
 assert.deepEqual(result,[{json:{base64:'QUJD'}}]);
 assert.equal(calls,1);
 assert.equal(options.headers.Origin,'https://evolution-api-production-3652.up.railway.app');
 assert.ok(options.maxResponseBodyBytes<15*1024*1024);
});
