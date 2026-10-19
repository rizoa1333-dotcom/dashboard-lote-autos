const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '../../VeloDrive-n8n-intervencion-automatica.json'), 'utf8'));

function associateEvolutionPayload(payload, channels) {
  const body = payload.body || payload;
  const data = body.data || {};
  const eventName = String(body.event || '').toLowerCase();
  if (eventName !== 'messages.upsert') return { ignored: true, reason: 'unsupported_event' };
  if (data.key?.fromMe !== false) return { ignored: true, reason: data.key?.fromMe === true ? 'outgoing_message' : 'missing_from_me_flag' };
  const jid = String(data.key?.remoteJid || '');
  if (!jid || jid.includes('@g.us')) return { ignored: true, reason: 'invalid_or_group_jid' };
  const instance = String(body.instance || data.instanceId || data.instance || '').trim().toLowerCase();
  if (!instance) return { ignored: true, reason: 'missing_instance' };
  const channel = channels.find((item) => String(item.instance_name || '').trim().toLowerCase() === instance);
  const phone = jid.split('@')[0].replace(/:\d+$/, '').replace(/^521|^52/, '').replace(/\D/g, '');
  if (!channel || !channel.lote_id || !phone) return { ignored: true, reason: 'unmapped_channel' };
  return { ignored: false, instance, lote_id: String(channel.lote_id), phone_number: phone };
}

test('workflow export contiene un webhook POST /webhook/whatsapp-lotes', () => {
  const node = workflow.nodes.find((item) => item.name === 'Webhook WhatsApp1');
  assert.ok(node);
  assert.equal(node.parameters.httpMethod, 'POST');
  assert.equal(node.parameters.path, 'whatsapp-lotes');
  assert.equal(workflow.connections['Webhook WhatsApp1'].main[0][0].node, 'Validar origen Evolution');
  assert.equal(workflow.connections['Validar origen Evolution'].main[0][0].node, 'Secret Evolution Válido1');
});

test('payload messages.upsert asocia una instancia al lote y normaliza el teléfono', () => {
  const payload = {
    body: {
      event: 'messages.upsert',
      instance: 'Lote-Alpha',
      data: { key: { remoteJid: '5213121234567@s.whatsapp.net', fromMe: false }, message: { conversation: '¿Sigue disponible?' } }
    }
  };
  const result = associateEvolutionPayload(payload, [{ instance_name: 'lote-alpha', lote_id: 'lote-uuid-a' }]);
  assert.deepEqual(result, { ignored: false, instance: 'lote-alpha', lote_id: 'lote-uuid-a', phone_number: '3121234567' });
});

test('no asocia eventos que no sean mensajes entrantes ni mensajes de grupos', () => {
  const base = { body: { event: 'messages.upsert', instance: 'Lote-Alpha', data: { key: { remoteJid: '5213121234567@s.whatsapp.net', fromMe: false } } } };
  assert.equal(associateEvolutionPayload({ ...base, body: { ...base.body, event: 'connection.update' } }, []).reason, 'unsupported_event');
  assert.equal(associateEvolutionPayload({ ...base, body: { ...base.body, data: { ...base.body.data, key: { ...base.body.data.key, fromMe: true } } } }, []).reason, 'outgoing_message');
  assert.equal(associateEvolutionPayload({ ...base, body: { ...base.body, data: { ...base.body.data, key: { remoteJid: '123@g.us', fromMe: false } } } }, []).reason, 'invalid_or_group_jid');
});

test('el clasificador permite intervención humana y evita responder mensajes propios de la API', () => {
  const node = workflow.nodes.find((item) => item.name === 'Clasificar autor WhatsApp (handoff)');
  for (const [fromMe, source, tipo] of [[false, '', 'cliente'], [true, 'unknown', 'salida_api'], [true, 'android', 'humano'], [undefined, '', 'ignorar']]) {
    const result = vm.runInNewContext(`(function(){${node.parameters.jsCode}})()`, {
      $: name => ({ first: () => ({ json: name === 'Webhook WhatsApp1'
        ? { body: { data: { key: { remoteJid: '5213121234567@s.whatsapp.net', fromMe }, source } } }
        : { lote_id: 'lote-uuid-a' } }) }),
    })[0].json;
    assert.equal(result.tipo, tipo);
  }
});


test('un cliente sin pausa manual continúa hacia la IA aunque la consulta no devuelva filas',()=>{
 const query=workflow.nodes.find(n=>n.name==='Consultar pausa de la conversación');
 assert.equal(query.alwaysOutputData,true);
 const evaluate=workflow.nodes.find(n=>n.name==='Evaluar expiración de pausa');
 const r=vm.runInNewContext('(function(){'+evaluate.parameters.jsCode+'})()',{$input:{all:()=>[{json:{}}]},$:name=>({first:()=>({json:name==='Webhook WhatsApp1'?{body:{data:{key:{remoteJid:'523121234567@s.whatsapp.net'},message:{conversation:'Hola'}}}}:{lote_id:'lot-a'}})})})[0].json;
 assert.equal(r.manual_activo,false);assert.equal(r.phone_number,'3121234567');
});

test('los datos reales del lote llegan al asesor cuando Supabase entrega un objeto',()=>{
 const field=workflow.nodes.find(n=>n.name==='Edit Fields1').parameters.assignments.assignments.find(f=>f.name==='lote_nombre');
 const value=vm.runInNewContext(field.value.slice(3,-3),{$:()=>({item:{json:{nombre:'Lote Real'}},first:()=>({json:{nombre:'Lote Real'}})})});
 assert.equal(value,'Lote Real');
});

test('la respuesta del agente no vuelve a insertar el mensaje de usuario ya registrado',()=>{
 const wf=require('../../VeloDrive-n8n-intervencion-automatica.json');
 const visited=new Set();const pending=['Enviar Respuesta WhatsApp1'];
 while(pending.length){const name=pending.pop();if(visited.has(name))continue;visited.add(name);
   for(const outputs of Object.values(wf.connections[name]||{}))for(const edges of outputs)for(const edge of edges)pending.push(edge.node);
 }
 assert.equal(visited.has('Guardar Respuesta IA1'),true);
 assert.equal(visited.has('Guardar Mensaje Usuario1'),false);
 assert.ok(wf.connections['Guardar mensaje al reactivar IA'].main[0].some(edge=>edge.node==='Edit Fields1'));
});
