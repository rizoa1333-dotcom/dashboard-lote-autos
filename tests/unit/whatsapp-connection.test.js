const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const workflow=require('../../VeloDrive-n8n-intervencion-automatica.json');
function run(name,json,refs={}){const node=workflow.nodes.find(n=>n.name===name);assert.ok(node,'falta controlador '+name);return vm.runInNewContext('(function(){'+node.parameters.jsCode+'})()',{$json:json,$:name=>({first:()=>({json:refs[name]||{}})}),URL,$env:{WEBHOOK_SECRET:'test-secret'}})[0].json;}
const context={instance:'instancia_lot-a',loteId:'lot-a',accion:'conectar'};
test('una instancia existente cerrada se reconecta sin intentar crearla',()=>{
 const result=run('Evaluar estado de instancia',{statusCode:200,body:{instance:{state:'close'}}},{'Preparar conexión QR':context});assert.equal(result.valid,true);assert.equal(result.exists,true);assert.equal(result.connected,false);
});
test('solo un 404 permite crear una instancia; 401 y 500 devuelven error',()=>{
 for(const status of [404,401,500]){const r=run('Evaluar estado de instancia',{statusCode:status,body:{}},{'Preparar conexión QR':context});assert.equal(r.valid,status===404);assert.equal(r.exists,false);}
});
test('reconectar conserva la clave real y nunca genera una distinta para el canal',()=>{
 const r=run('Preparar canal confirmado',{statusCode:200,body:[{name:'instancia_lot-a',token:'actual-token',connectionStatus:'open',ownerJid:'523121234567@s.whatsapp.net'}]},{'Preparar conexión QR':context});assert.equal(r.valid,true);assert.equal(r.api_key,'actual-token');assert.equal(r.phone_number,'523121234567');assert.equal(r.connected,true);
});
test('no registra credenciales de otra instancia o respuestas vacías',()=>{
 for(const body of [[],[{name:'other',token:'secret'}]])assert.equal(run('Preparar canal confirmado',{statusCode:200,body},{'Preparar conexión QR':context}).valid,false);
});
test('la vinculación solo confirma un webhook habilitado con el destino y evento correctos',()=>{
 const refs={'Preparar conexión QR':context};const check=(body)=>run('Comprobar webhook WhatsApp',{statusCode:200,body},refs);
 const good={enabled:true,url:'https://n8n-production-97a4.up.railway.app/webhook/whatsapp-lotes?secret=test-secret',events:['MESSAGES_UPSERT']};
 assert.equal(check(good).valid,true);assert.equal(check({...good,enabled:false}).valid,false);assert.equal(check({...good,events:[]}).valid,false);assert.equal(check({...good,url:'https://other.test'}).valid,false);
});
test('el QR se normaliza y nunca se entrega como objeto o código vacío',()=>{
 assert.equal(run('Evaluar QR entregado',{statusCode:200,body:{base64:'data:image/png;base64,aGVsbG8='}}).qr_base64,'data:image/png;base64,aGVsbG8=');
 assert.equal(run('Evaluar QR entregado',{statusCode:200,body:{qrcode:{count:0}}}).qr_base64,null);
 assert.equal(run('Evaluar QR entregado',{statusCode:500,body:{error:'failure'}}).valid,false);
});

test('Evolution confirma webhook con HTTP 201 sin rechazar una configuración correcta',()=>{const r=run('Comprobar webhook WhatsApp',{statusCode:201,body:{enabled:true,url:'https://n8n-production-97a4.up.railway.app/webhook/whatsapp-lotes?secret=test-secret',events:['MESSAGES_UPSERT']}});assert.equal(r.valid,true);});

test('el cuerpo del webhook no cierra antes de tiempo la expresión de n8n',()=>{
 const value=workflow.nodes.find(n=>n.name==='Configurar webhook WhatsApp').parameters.jsonBody;
 const expression=/{{([\s\S]*?)}}/.exec(value);
 assert.ok(expression);
 assert.equal(value.slice(expression.index+expression[0].length).trim(),'');
 const body=JSON.parse(vm.runInNewContext(expression[1],{$env:{WEBHOOK_SECRET:'test secret'}}));
 assert.equal(body.webhook.enabled,true);
 assert.deepEqual(body.webhook.events,['MESSAGES_UPSERT']);
 assert.ok(body.webhook.url.endsWith('secret=test%20secret'));
});
