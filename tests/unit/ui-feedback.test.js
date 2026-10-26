const test = require('node:test');
const assert = require('node:assert/strict');
const { beginSubmit, createRefreshScheduler, createRequestScope, mapLimited } = require('../../ui-feedback');

function fakeElement(textContent = '') {
  const attributes = new Map();
  return {
    textContent,
    disabled: false,
    dataset: {},
    setAttribute(key, value) { attributes.set(key, value); },
    getAttribute(key) { return attributes.get(key) || null; },
    removeAttribute(key) { attributes.delete(key); }
  };
}

test('double submit is locked and loading state is announced accessibly', () => {
  const button = fakeElement('Guardar');
  const status = fakeElement('');
  const finish = beginSubmit(button, status, 'Guardando…', 'Guardando el vehículo…');
  assert.equal(typeof finish, 'function');
  assert.equal(beginSubmit(button, status, 'Guardando…', 'Guardando el vehículo…'), null);
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(status.textContent, 'Guardando el vehículo…');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.dataset.state, 'loading');
});

test('al completar restaura el botón y anuncia éxito; se puede iniciar otro guardado', () => {
  const button = fakeElement('Guardar');
  const status = fakeElement('');
  const finish = beginSubmit(button, status, 'Guardando…', 'Guardando…');
  finish('Vehículo agregado.', 'success');
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Guardar');
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(status.textContent, 'Vehículo agregado.');
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(beginSubmit(button, status, 'Guardando…', 'Guardando…') instanceof Function, true);
});

test('fallo por desconexión produce alerta accesible y desbloquea el botón para reintentar', () => {
  const button = fakeElement('Guardar');
  const status = fakeElement('');
  const finish = beginSubmit(button, status, 'Guardando…', 'Guardando…');
  finish('No se pudo guardar. Revisa tu conexión.', 'error');
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(status.getAttribute('role'), 'alert');
  assert.equal(status.dataset.state, 'error');
  assert.equal(status.getAttribute('aria-live'), 'assertive');
});

test('un control deshabilitado no se activa y el estado loading se retira al terminar sin mensaje',()=>{
 const button=fakeElement('Guardar'),status=fakeElement('');
 button.disabled=true;
 assert.equal(beginSubmit(button,status,'Guardando'),null);
 button.disabled=false;
 const finish=beginSubmit(button,status,'Guardando');finish();
 assert.notEqual(status.dataset.state,'loading');
 assert.equal(status.textContent,'');
});

test('la sincronizacion comparte una solicitud lenta y agenda solo al terminar',async()=>{
 let release,calls=0;const timers=[];
 const scheduler=createRefreshScheduler({run:()=>{calls++;return new Promise(r=>{release=r;});},canRun:()=>true,schedule:fn=>{timers.push(fn);return timers.length;},cancel:()=>{}});
 const first=scheduler.start();await Promise.resolve();
 const second=scheduler.refresh();
 assert.equal(calls,1);assert.equal(timers.length,0);
 release();await Promise.all([first,second]);
 assert.equal(timers.length,1);scheduler.stop();
});

test('una pestaña oculta u offline no inicia lecturas y detener evita futuros timers',async()=>{
 let visible=false,calls=0;const timers=[];
 const scheduler=createRefreshScheduler({run:async()=>{calls++;},canRun:()=>visible,schedule:fn=>{timers.push(fn);return timers.length;},cancel:()=>{}});
 await scheduler.start();assert.equal(calls,0);
 visible=true;await scheduler.refresh();assert.equal(calls,1);
 scheduler.stop();await scheduler.refresh();assert.equal(calls,1);
});

test('detener durante una solicitud no la vuelve a programar ni deja rechazos sin manejar',async()=>{
 let reject;const timers=[],errors=[];
 const scheduler=createRefreshScheduler({run:()=>new Promise((_,r)=>{reject=r;}),canRun:()=>true,schedule:fn=>{timers.push(fn);return timers.length;},cancel:()=>{},onError:e=>errors.push(e.message)});
 const work=scheduler.start();await Promise.resolve();scheduler.stop();reject(Error('fixture'));
 await work;assert.equal(timers.length,0);assert.deepEqual(errors,['fixture']);
});

test('una lectura que excede el plazo tampoco puede entregar su cuerpo tardio',async()=>{
 const scope=createRequestScope(async()=>({json:async()=>{await new Promise(r=>setTimeout(r,25));return {stale:true};}}),5);
 const response=await scope.fetch('/fixture');
 await assert.rejects(response.json(),error=>error.name==='TimeoutError');
});

test('subidas limitadas mantienen orden, no exceden dos solicitudes y contabilizan fallos parciales',async()=>{
 const releases=[],progress=[];let active=0,max=0;
 const task=mapLimited(['first','second','third'],2,async(value,index)=>{
  active++;max=Math.max(max,active);await new Promise(r=>{releases[index]=r;});active--;
  if(index===1)throw Error('fixture');return value;
 },count=>progress.push(count));
 await Promise.resolve();assert.equal(active,2);releases[1]();await new Promise(r=>setImmediate(r));
 assert.equal(active,2);releases[2]();releases[0]();const result=await task;
 assert.equal(max,2);assert.deepEqual(result.map(r=>r.status),['fulfilled','rejected','fulfilled']);
 assert.equal(result[0].value,'first');assert.deepEqual(progress,[1,2,3]);
});

test('terminar una accion antigua libera su bloqueo sin cambiar la interfaz de otro contexto',()=>{
 const button=fakeElement('Pausar'),status=fakeElement('');
 const finish=beginSubmit(button,status,'Pausando','Guardando',()=>false);
 status.textContent='Estado de otra conversación';finish('Mensaje viejo');
 assert.equal(status.textContent,'Estado de otra conversación');
 button.disabled=false;assert.equal(typeof beginSubmit(button,status,'Nuevo'),'function');
});
