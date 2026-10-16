/** @param {unknown} event @param {string} executionId */
function normalizeEvolutionEvent(event, executionId) {
  if (!event || typeof event !== 'object') return { valid: false };
  const body = /** @type {Record<string, any>} */ (event);
  const data = body.data || {};
  const key = data.key || {};
  const instance = typeof body.instance === 'string' ? body.instance.trim() : '';
  const messageId = typeof key.id === 'string' ? key.id : '';
  const jid = typeof key.remoteJid === 'string' ? key.remoteJid : '';
  const execution = String(executionId || '');
  if (String(body.event || '').toLowerCase().replaceAll('_', '.') !== 'messages.upsert'
      || !/^[A-Za-z0-9_-]{1,120}$/.test(instance)
      || !/^[A-Za-z0-9_-]{1,128}$/.test(messageId)
      || !/^\d{10,15}(?::\d{1,5})?@s\.whatsapp\.net$/.test(jid)
      || typeof key.fromMe !== 'boolean'
      || !/^[A-Za-z0-9_-]{1,100}$/.test(execution)) return { valid: false };
  const phone = jid.split('@')[0].replace(/:\d+$/, '').replace(/^521|^52/, '');
  if (!/^\d{10,15}$/.test(phone)) return { valid: false };
  return { valid: true, instance, message_id: messageId, phone_number: phone, execution_id: execution, from_me: key.fromMe };
}

/** @param {unknown} value */
function normalizeClaimResult(value) {
  const result = !Array.isArray(value) && value && typeof value === 'object'
    ? /** @type {Record<string, any>} */ (value) : {};
  return { process: result.acquired === true && typeof result.lote_id === 'string'
    && Boolean(result.lote_id) && result.state === 'processing' };
}

/** @param {Record<string, any>} event @param {string} [handlerExecutionId] */
function sanitizeIncident(event, handlerExecutionId) {
  const error = event.execution?.error || event.trigger?.error || {};
  const message = String(error.message || '').slice(0, 2000).toLowerCase();
  const code = /credential|encryption|decrypt/.test(message) ? 'CREDENTIALS_UNAVAILABLE'
    : /timeout|timed out/.test(message) ? 'DEPENDENCY_TIMEOUT' : 'WORKFLOW_FAILED';
  const safeId = value => /^[A-Za-z0-9_-]{1,100}$/.test(String(value || '')) ? String(value) : null;
  const node = String(event.execution?.lastNodeExecuted || error.lastNodeExecuted || error.node?.name || 'unknown');
  const fallback=safeId(handlerExecutionId);
  return { execution_id: safeId(event.execution?.id) || (fallback ? safeId('trigger_'+fallback) : null), workflow_id: safeId(event.workflow?.id),
    node_name: /^[\p{L}\p{N} _?¿()/-]{1,120}$/u.test(node) ? node : 'unknown', code };
}
module.exports = { normalizeEvolutionEvent, normalizeClaimResult, sanitizeIncident };
