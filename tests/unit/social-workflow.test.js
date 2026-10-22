const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const workflow = require('../../VeloDrive-n8n-intervencion-automatica.json');

function runNode(name, json, references = {}) {
  const node = workflow.nodes.find((entry) => entry.name === name);
  assert.ok(node, name);
  return vm.runInNewContext(`(function(){${node.parameters.jsCode}})()`, {
    $json: json,
    $: (key) => ({ item: { json: references[key] || { loteId: 'tenant-a', body: {} } } }),
  })[0].json;
}

test('el flujo se puede importar sin identificadores de nodos duplicados', () => {
  assert.equal(new Set(workflow.nodes.map(node => node.id)).size, workflow.nodes.length);
});

test('tokens inválidos nunca llegan a PostgreSQL como valores UUID mal formados', () => {
  for (const name of ['Verificar Token de Tenant7', 'Verificar Token de Tenant8', 'Verificar Token de Tenant9', 'Verificar Token de Tenant10']) {
    const node = workflow.nodes.find(n => n.name === name);
    for (const authorization of ['', 'Bearer ' + 'x'.repeat(64), 'Bearer 00000000-0000-0000-0000-000000000000']) {
      const url = node.parameters.url.slice(1).replace(/{{([\s\S]*?)}}/g, (_, expression) =>
        vm.runInNewContext(expression, { $json: { headers: { authorization } } }));
      const filters = new URL(url).searchParams.getAll('webhook_token');
      assert.deepEqual(filters, ['eq.00000000-0000-0000-0000-000000000000', 'neq.00000000-0000-0000-0000-000000000000']);
    }
  }
});

test('solo TikTok o cuentas vacías no habilitan Facebook e Instagram', () => {
  const result = runNode('Evaluar Conexión2', {
    profiles: [{ username: 'tenant-a', social_accounts: { tiktok: { username: 'old' }, facebook: {}, instagram: '' } }],
  });
  assert.equal(result.conectado, false);
});

test('la verificación distingue conexión parcial y reautorización por plataforma', () => {
  const result = runNode('Evaluar Conexión2', {
    profiles: [{ username: 'tenant-a', social_accounts: {
      facebook: { username: 'Mi lote', reauth_required: false },
      instagram: { username: 'mi_lote', reauth_required: true },
    } }],
  });
  assert.equal(result.plataformas.facebook, true);
  assert.equal(result.plataformas.instagram, false);
  assert.equal(result.conectado, false);
  assert.equal(result.parcial, true);
});

test('crear simultáneamente un perfil existente (409) permite continuar', () => {
  const result = runNode('Evaluar Creación de Perfil Upload-Post2', {
    statusCode: 409, body: { success: false, error: 'User already exists' },
  });
  assert.equal(result.profileCreated, true);
});

test('una plataforma omitida no se presenta como publicación completa', () => {
  const result = runNode('Evaluar Resultado1', {
    status: 'completed', results: {
      facebook: { success: true }, instagram: { success: false, skipped: true },
    },
  });
  assert.equal(result.fallo, true);
  assert.equal(result.publicado, false);
});

test('estado completed sin resultados verificables no confirma publicación', () => {
  const result = runNode('Evaluar Resultado1', { status: 'completed', results: [] });
  assert.equal(result.publicado, false);
});

test('resultado de ambas redes en formato array confirma la publicación', () => {
  const result = runNode('Evaluar Resultado1', {
    status: 'completed', results: [{ platform: 'facebook', success: true }, { platform: 'instagram', success: true }],
  });
  assert.equal(result.publicado, true);
});

const publication = {
  car: { id: 21 }, platforms: ['facebook'], copy: 'Unidad disponible',
  image_urls: ['https://storage.test/a.jpg', 'https://storage.test/b.jpg'],
  request_id: 'qa-request-1234567890',
};

test('publicación válida conserva únicamente las redes elegidas y cada foto', () => {
  const result = runNode('Validar Datos de Publicación', {}, {
    'Webhook Publicar Redes1': { body: publication },
  });
  assert.equal(result.valid, true);
  assert.deepEqual(Array.from(result.platforms), ['facebook']);
  assert.equal(result.urls.length, 2);
});

test('rechaza plataformas ajenas al servicio e identificadores inyectados', () => {
  for (const change of [{ platforms: ['tiktok'] }, { car: { id: '21&lote_id=neq.x' } }, { image_urls: ['javascript:alert(1)'] }]) {
    const result = runNode('Validar Datos de Publicación', {}, {
      'Webhook Publicar Redes1': { body: { ...publication, ...change } },
    });
    assert.equal(result.valid, false);
  }
});

test('el enlace de conexión rechaza dominios ajenos a Upload-Post', () => {
  const accepted = runNode('Validar Enlace de Conexión Upload-Post2', { body: { access_url: 'https://app.upload-post.com/connect?token=qa' } });
  assert.equal(accepted.linkReady, true);
  const rejected = runNode('Validar Enlace de Conexión Upload-Post2', { body: { access_url: 'https://app.upload-post.com.attacker.test/connect' } });
  assert.equal(rejected.linkReady, false);
});

test('multipart envía dos fotos separadas y solamente Facebook', async () => {
  const node = workflow.nodes.find(n => n.name === 'Publicar Upload-Post (Fotos)1');
  const result = runNode('Validar Datos de Publicación', {}, { 'Webhook Publicar Redes1': { body: publication } });
  assert.equal(node.parameters.contentType, 'multipart-form-data');
  assert.equal(node.parameters.options.response.response.responseFormat, 'autodetect');
  const form = new FormData();
  const refs={'Validar Datos de Publicación':result,'Normalizar Verificación Token2':{loteId:'tenant-a'}};
  const resolve=value=>typeof value==='string' && value.startsWith('={{') ? vm.runInNewContext(value.slice(3,-2),{$:key=>({item:{json:refs[key]}})}) : value;
  for(const field of node.parameters.bodyParameters.parameters)form.append(resolve(field.name),resolve(field.value));
  assert.deepEqual(form.getAll('platform[]'), ['facebook']);
  assert.deepEqual(form.getAll('photos[]'), publication.image_urls);
  assert.equal(form.get('user'), 'tenant-a');
  assert.equal(form.get('title'), 'Unidad disponible');
});

test('el texto no puede introducir campos adicionales dentro del multipart', async () => {
  const copy = 'Información ñ 🚗\r\n--velodrive_qa-request-1234567890\r\nContent-Disposition: form-data; name="user"\r\n\r\notro-lote';
  const result = runNode('Validar Datos de Publicación', {}, { 'Webhook Publicar Redes1': { body: { ...publication, copy } } });
  const form = await new Response(result.multipartBody, { headers: {
    'Content-Type': 'multipart/form-data; boundary=' + result.boundary,
  } }).formData();
  assert.deepEqual(form.getAll('user'), ['tenant-a']);
  assert.equal(form.get('title'), copy);
});


test('la renovación genera un UUID compatible con webhook_token', () => {
  const node = workflow.nodes.find(n => n.name === 'Generar Nuevo Token1');
  const generate = () => vm.runInNewContext('(function(){' + node.parameters.jsCode + '})()', {
    require, $json: { id:'tenant-a', webhook_token:'old-token' },
  }).json;
  const first = generate();
  const second = generate();
  assert.match(first.token_nuevo, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(first.token_nuevo, second.token_nuevo);
  assert.equal(first.lote_id, 'tenant-a');
});


test('la renovación procesa cada lote y actualiza solo el token que leyó',()=>{
  const node=name=>workflow.nodes.find(n=>n.name===name);
  assert.equal(node('Schedule Rotación Mensual Token1').disabled,undefined);
  assert.equal(node('Generar Nuevo Token1').parameters.mode,'runOnceForEachItem');
  assert.equal(workflow.connections['Obtener Lotes Activos1'].main[0][0].node,'Generar Nuevo Token1');
  const patch=node('Actualizar Token en Supabase1');
  for (const id of ['lot-a','lot-b']) {
    const source={id,webhook_token:'previous-'+id};
    const generated=vm.runInNewContext('(function(){'+node('Generar Nuevo Token1').parameters.jsCode+'})()',{require,$json:source}).json;
    const url=new URL(patch.parameters.url.slice(1).replace(/{{([\s\S]*?)}}/g,(_,expr)=>vm.runInNewContext(expr,{$json:generated})));
    assert.equal(url.searchParams.get('id'),'eq.'+id);
    assert.equal(url.searchParams.get('webhook_token'),'eq.previous-'+id);
    const body=JSON.parse(vm.runInNewContext(patch.parameters.jsonBody.slice(3,-3),{$json:generated}));
    assert.equal(body.webhook_token,generated.token_nuevo);
  }
  assert.equal(patch.parameters.headerParameters.parameters.find(h=>h.name==='Prefer').value,'return=representation');
  assert.notEqual(patch.onError,'continueRegularOutput');
  const url=node('Notificar Token Rotado1').parameters.url.slice(1).replace(/{{([\s\S]*?)}}/g,(_,expr)=>vm.runInNewContext(expr,{$json:{instance_name:'instance-a'}}));
  assert.equal(new URL(url).pathname,'/message/sendText/instance-a');
});


test('publicacion distingue cuota, credenciales y datos rechazados sin filtrar errores del proveedor', () => {
  for (const [status, code] of [[401,'UPLOAD_POST_AUTH_FAILED'],[403,'UPLOAD_POST_PLAN_RESTRICTED'],[429,'UPLOAD_POST_LIMIT_REACHED'],[400,'UPLOAD_POST_INVALID_REQUEST'],[404,'UPLOAD_POST_PROFILE_NOT_FOUND']]) {
    const result = runNode('Evaluar Envío de Publicación', {statusCode:status,body:{success:false,message:'private-token-example'}}, {'Validar Datos de Publicación':{requestId:publication.request_id}});
    assert.equal(result.accepted,false); assert.equal(result.code,code); assert.ok(!result.error.includes('private-token-example'));
  }
});

test('publicacion aceptada exige el identificador esperado y conserva una respuesta incierta para consultar antes de reintentar', () => {
  const refs={'Validar Datos de Publicación':{requestId:publication.request_id}};
  const accepted=runNode('Evaluar Envío de Publicación',{statusCode:200,body:{success:true,request_id:publication.request_id}},refs);
  assert.equal(accepted.accepted,true);
  for (const body of [{success:true,request_id:'different-request'},{success:false},'unexpected html']) {
    const result=runNode('Evaluar Envío de Publicación',{statusCode:200,body},refs);
    assert.equal(result.accepted,false); assert.equal(result.code,'UPLOAD_POST_UNCONFIRMED'); assert.equal(result.request_id,publication.request_id);
  }
});


test('el formulario nativo conserva diez fotos, unicode y una sola plataforma sin serializar arrays',()=>{
  const node=workflow.nodes.find(n=>n.name==='Publicar Upload-Post (Fotos)1');
  const urls=Array.from({length:10},(_,i)=>'https://storage.test/'+i+'.jpg');
  const refs={'Validar Datos de Publicación':{urls,platforms:['instagram'],copy:'🚗 Automóvil en Colima',requestId:publication.request_id},'Normalizar Verificación Token2':{loteId:'tenant-a'}};
  const resolve=value=>typeof value==='string' && value.startsWith('={{') ? vm.runInNewContext(value.slice(3,-2),{$:key=>({item:{json:refs[key]}})}) : value;
  const form=new FormData();
  for(const field of node.parameters.bodyParameters?.parameters||[])form.append(resolve(field.name),resolve(field.value));
  assert.deepEqual(form.getAll('photos[]'),urls);
  assert.deepEqual(form.getAll('platform[]'),['instagram']);
  assert.equal(form.get('title'),'🚗 Automóvil en Colima');
  assert.equal(form.get('request_id'),publication.request_id);
  assert.equal(node.parameters.rawContentType,undefined);
});

test('un fallo parcial informa la red exitosa y la Pagina faltante sin filtrar payload del proveedor', () => {
  const result = runNode('Evaluar Resultado1', {
    status: 'completed', total: 2,
    results: [
      {platform:'facebook',success:false,error_code:'config_target_missing',error_message:'provider secret',user_email:'private@example.test'},
      {platform:'instagram',success:true,post_caption:'private caption',access_token:'secret-token'},
    ],
  });
  assert.equal(result.parcial,true);
  assert.equal(result.publicado,false);
  assert.match(result.mensaje,/Instagram: publicado/);
  assert.match(result.mensaje,/Facebook:.*Página/);
  assert.doesNotMatch(JSON.stringify(result),/private|secret-token|provider secret/);
});
