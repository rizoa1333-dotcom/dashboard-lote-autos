const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ui=require('../../ui-feedback');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../dashboard.js'),'utf8');
function element(value=''){
 const attrs=new Map();
 return {value,textContent:'',disabled:false,dataset:{},setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),getAttribute:k=>attrs.get(k)||null};
}
function fixture(name){
 const nodes={loginEmail:element('qa@example.com'),loginPassword:element('fake-only'),loginError:element(),configNombreLote:element('Nombre nuevo'),configPhoneLote:element('523121234567'),configStatus:element()};
 const button=element();button.textContent='Guardar';
 const context={window:{VeloDriveUI:ui},document:{getElementById:id=>nodes[id]},console:{error(){}},currentLote:{id:'lot-a'},currentUser:null,
  captureTenantContext:()=>({loteId:context.currentLote?.id}),isCurrentTenantContext:c=>c.loteId===context.currentLote?.id,renderConfigLote(){},checkSessionAndLote:async()=>true};
 const start=source.indexOf('async function '+name+'(');assert.ok(start>=0,name+' debe existir');
 const next=source.indexOf('\nasync function ',start+1);
 vm.createContext(context);vm.runInContext(source.slice(start,next<0?source.length:next),context);
 return {context,nodes,button,submit:()=>context[name]({preventDefault(){},target:{querySelector:()=>button}})};
}
test('login rechaza doble submit y comunica loading/error sin perder el boton',async()=>{
 const f=fixture('handleLoginSubmit');let release,calls=0;
 f.context.supabaseClient={auth:{signInWithPassword:()=>{calls++;return new Promise(r=>{release=r;});}}};
 const pending=f.submit();assert.equal(f.button.getAttribute('aria-busy'),'true');
 await f.submit();assert.equal(calls,1);
 release({data:{},error:{message:'Credenciales inválidas'}});await pending;
 assert.equal(f.button.disabled,false);assert.equal(f.nodes.loginError.getAttribute('role'),'alert');
});
test('configuracion bloquea otra escritura y confirma solo la fila del lote capturado',async()=>{
 const f=fixture('handleConfigSubmit');let release,calls=0,filter;
 const query={eq:(key,value)=>{filter=[key,value];return query;},select:()=>query,single:()=>new Promise(r=>{release=r;})};
 f.context.supabaseClient={from:()=>({update:()=>{calls++;return query;}})};
 const pending=f.submit();assert.equal(f.nodes.configStatus.dataset.state,'loading');await f.submit();assert.equal(calls,1);
 assert.deepEqual(filter,['id','lot-a']);release({data:{id:'lot-a',nombre:'Nombre nuevo'},error:null});await pending;
 assert.match(f.nodes.configStatus.textContent,/Configuración guardada/);assert.equal(f.button.disabled,false);
});
test('fallo de configuracion preserva las entradas y anuncia error para reintentar',async()=>{
 const f=fixture('handleConfigSubmit');const query={eq:()=>query,select:()=>query,single:async()=>({data:null,error:{message:'offline'}})};
 f.context.supabaseClient={from:()=>({update:()=>query})};await f.submit();
 assert.equal(f.nodes.configNombreLote.value,'Nombre nuevo');assert.equal(f.nodes.configStatus.getAttribute('role'),'alert');assert.equal(f.button.disabled,false);
});
test('respuesta tardia de configuracion no reemplaza un lote distinto',async()=>{
 const f=fixture('handleConfigSubmit');let release;const query={eq:()=>query,select:()=>query,single:()=>new Promise(r=>{release=r;})};
 f.context.supabaseClient={from:()=>({update:()=>query})};const work=f.submit();f.context.currentLote={id:'lot-b'};
 release({data:{id:'lot-a',nombre:'Nombre nuevo'},error:null});await work;assert.equal(f.context.currentLote.id,'lot-b');
 assert.doesNotMatch(f.nodes.configStatus.textContent,/guardada/);
});

test('el cambio a atencion manual no lanza otra escritura mientras esta pendiente',async()=>{
 const f=fixture('setAiHandoffPaused');let calls=0,release;
 Object.assign(f.context,{leadsCache:[{id:'lead-a',phone_number:'523121234567'}],activeLeadId:'lead-a',catalogModeActive:false,handoffActionPending:false,normalizarTelefonoChat:p=>p,Date,
 refreshAiHandoffControls:async()=>{}});
 f.nodes.crmAiHandoffStatus=element();f.nodes.btnPauseAiChat=f.button;
 f.context.supabaseClient={from:()=>({upsert:()=>{calls++;return new Promise(r=>{release=r;});}})};
 const work=f.context.setAiHandoffPaused(true);await f.context.setAiHandoffPaused(true);assert.equal(calls,1);
 assert.equal(f.button.getAttribute('aria-busy'),'true');release({error:null});await work;
 assert.equal(f.context.handoffActionPending,false);assert.match(f.nodes.crmAiHandoffStatus.textContent,/pausada/);
});

test('inventario y gastos arrancan en paralelo, conservando la guarda del lote',async()=>{
 const f=fixture('fetchCars'),started=[],releases={};
 Object.assign(f.context,{carsReadGeneration:0,carsReadCommitted:0,carsCache:[],carExpensesCache:[],carExpensesAvailable:false,financeRefreshRequired:false,
  renderCars(){},renderCarsCounter(){},calcularMetricasInventario(){},renderControlUtilidad(){},populateMarketingCarSelect(){},calcularOportunidadesRescatadas(){}});
 f.context.supabaseClient={from:table=>{const query={select:()=>query,eq:()=>query,order:()=>query,then:(resolve,reject)=>{started.push(table);return new Promise(r=>{releases[table]=r;}).then(resolve,reject);}};return query;}};
 const work=f.context.fetchCars();await Promise.resolve();await Promise.resolve();
 assert.deepEqual(started.sort(),['car_expenses','cars']);
 releases.cars({data:[{id:'car-a',lote_id:'lot-a'}],error:null});releases.car_expenses({data:[],error:null});
 assert.equal(await work,true);assert.equal(f.context.carExpensesAvailable,true);
});

test('subida de fotos rechaza formatos o tamaños invalidos sin enviarlos al bucket',async()=>{
 const f=fixture('uploadPhotoBatch'),paths=[];
 f.context.crypto={randomUUID:()=> 'fixture-photo-id'};
 f.context.supabaseClient={storage:{from:()=>({upload:async p=>{paths.push(p);return {error:null};},getPublicUrl:p=>({data:{publicUrl:'https://storage.test/'+p}})})}};
 const result=await f.context.uploadPhotoBatch([{type:'image/jpeg',size:100},{type:'image/gif',size:100},{type:'image/png',size:11*1024*1024}],{loteId:'lot-a'},()=>{});
 assert.deepEqual(paths,['lot-a/fixture-photo-id.jpg']);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,2);
});

test('no inicia subida mientras el generador tiene su propio bloqueo',async()=>{
 const f=fixture('subirMediaMarketing');let starts=0;
 Object.assign(f.context,{marketingUploadPending:false,marketingSelectedCarId:'car-a'});
 f.nodes.marketingStatusText=element();f.nodes.btnPublicarRedes=element();f.nodes.btnGenerarCopy=element();f.nodes.btnGenerarCopy.disabled=true;
 f.context.window={VeloDriveUI:{...ui,beginSubmit:(...args)=>{starts++;return ui.beginSubmit(...args);}}};
 await f.context.subirMediaMarketing([{type:'image/jpeg',size:100}]);
 assert.equal(starts,0);assert.equal(f.nodes.btnGenerarCopy.disabled,true);
 assert.match(f.nodes.marketingStatusText.textContent,/termine de generar/);
});
