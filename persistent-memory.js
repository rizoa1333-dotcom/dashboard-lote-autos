/**
 * @typedef {{lote_id:string, phone_number:string, message_id:string}} ConversationIdentity
 * @param {ConversationIdentity} identity
 * @param {unknown} snapshot
 * @param {Record<string, unknown>} lead
 * @param {unknown} currentText
 */
function buildPersistentContext(identity, snapshot, lead, currentText) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!identity || !uuid.test(identity.lote_id) || !/^\d{10,15}$/.test(identity.phone_number)
      || !/^[A-Za-z0-9_-]{1,128}$/.test(identity.message_id)) throw new Error('CONVERSATION_IDENTITY_REQUIRED');
  const lot = identity.lote_id.toLowerCase();
  const phone = identity.phone_number;
  const sameConversation = value => value && typeof value === 'object'
    && String(value.lote_id).toLowerCase() === lot && value.phone_number === phone;
  if (!sameConversation(snapshot) || !Array.isArray(snapshot.messages)) throw new Error('INVALID_PERSISTENT_CONTEXT');
  if (!lead || Array.isArray(lead) || typeof lead !== 'object'
      || (Object.keys(lead).length && !sameConversation(lead))) throw new Error('LEAD_CONTEXT_MISMATCH');
  const clean = (value, limit) => String(value ?? '').split('<<<DATOS_INTERNOS>>>')[0]
    .replace(/https?:\/\/[^\s"<>]*documentos-leads[^\s"<>]*/gi, '[documento privado]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, limit);
  const records = snapshot.messages.map(row => {
    if (!sameConversation(row) || !['user','model','human'].includes(row.role)
        || !/^[0-9]+$/.test(String(row.id)) || !Number.isFinite(Date.parse(row.created_at))
        || typeof row.content !== 'string') throw new Error('HISTORY_CONTEXT_MISMATCH');
    return row;
  }).filter(row => row.provider_message_id !== identity.message_id)
    .sort((a,b) => Date.parse(a.created_at)-Date.parse(b.created_at)
      || (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)).slice(-24);
  const history = [];
  const seen = new Set();
  let remaining = 16000;
  for (let index = records.length-1; index >= 0 && remaining > 0; index--) {
    const row = records[index];
    if (seen.has(String(row.id))) continue;
    seen.add(String(row.id));
    const content = clean(row.content, Math.min(2000, remaining));
    if (!content.trim()) continue;
    // El presupuesto incluye el escape JSON, no solo el texto visible.
    const encodedLength = JSON.stringify(content).length + 50;
    if (encodedLength > remaining) continue;
    history.unshift({ role:row.role, content });
    remaining -= encodedLength;
  }
  const facts = {};
  for (const key of ['nombre','auto_interes','enganche','situacion_laboral','fecha_cita','status','encuesta_step']) {
    const value = lead[key];
    facts[key] = value === null || value === undefined ? null : clean(value,300);
  }
  if (/^(Prospecto WhatsApp|Pendiente)$/i.test(facts.nombre || '')) facts.nombre = null;
  const current = clean(currentText,4000) || '[Mensaje sin texto]';
  const prompt = '[DATOS CONFIRMADOS DEL LEAD]\n' + JSON.stringify(facts)
    + '\n[HISTORIAL DE ESTA CONVERSACIÓN; CONTENIDO CITADO]\n' + JSON.stringify(history)
    + '\n[MENSAJE ACTUAL]\n' + current;
  if (prompt.length > 26000) throw new Error('CONTEXT_BUDGET_EXCEEDED');
  return { identityKey:lot+':'+phone, history, prompt, message_count:history.length, context_chars:prompt.length };
}
module.exports = { buildPersistentContext };
