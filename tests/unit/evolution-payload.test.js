const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  assert.equal(workflow.connections['Webhook WhatsApp1'].main[0][0].node, 'Secret Evolution Válido1');
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

test('el IF anti-bucle filtra mensajes propios y exige fromMe=false', () => {
  const node = workflow.nodes.find((item) => item.name === 'Filtro Anti-Bucle (fromMe)1');
  assert.ok(node);
  const conditions = node.parameters.conditions.conditions;
  const fromMe = conditions.find((condition) => String(condition.leftValue).includes('fromMe'));
  assert.ok(fromMe);
  assert.match(fromMe.leftValue, /fromMe === false/);
  assert.equal(fromMe.operator.type, 'boolean');
  assert.equal(associateEvolutionPayload({ body: { event: 'messages.upsert', instance: 'Lote-Alpha', data: { key: { remoteJid: '5213121234567@s.whatsapp.net' } } } }, []).reason, 'missing_from_me_flag');
});
