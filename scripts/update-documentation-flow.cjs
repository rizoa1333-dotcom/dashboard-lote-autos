const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const file = path.join(__dirname, '..', 'VeloDrive-n8n-intervencion-automatica.json');
const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
const get = name => {
  const node = workflow.nodes.find(item => item.name === name);
  if (!node) throw new Error(`Missing node: ${name}`);
  return node;
};
const connect = (from, ...outputs) => {
  workflow.connections[from] = { main: outputs.map(names => names.map(node => ({ node, type: 'main', index: 0 }))) };
};
const clone = (source, name, position) => {
  const existing = workflow.nodes.find(item => item.name === name);
  if (existing) return existing;
  const node = structuredClone(get(source));
  Object.assign(node, { id: randomUUID(), name, position });
  workflow.nodes.push(node);
  return node;
};
const documentation = get('Documentación de fase de validación1');
documentation.parameters.jsCode = documentation.parameters.jsCode
  .replace("if (!uuid.test(loteId) || !uuid.test(leadId)) throw new Error('No se pudo validar el lote y lead para guardar el documento.');", [
    "const tenantId = String($('Edit Fields1').first().json.tenant_lote_id || '');",
    "const numericId = /^[1-9][0-9]{0,18}$/.test(leadId) && BigInt(leadId) <= 9223372036854775807n;",
    "if (!uuid.test(loteId) || loteId !== tenantId || !numericId) throw new Error('No se pudo validar el lote y lead para guardar el documento.');",
    "if (!Number.isInteger(Number(lead.encuesta_step)) || Number(lead.encuesta_step) < 1 || Number(lead.encuesta_step) > 3) throw new Error('Paso de documentación inválido.');",
  ].join('\n'))
  .replace(/const phone = [^\n]*;/, "const phone = remoteJid.split('@')[0].replace(/:\\d+$/, '').replace(/[^0-9]/g, '');")
  .replace('Para agendar tu cita necesito 3 documentos rápidos. Primero, mándame una foto clara de tu identificación oficial (INE), por favor.', 'Tu cita ya está registrada. Para preparar tu expediente, mándame una foto clara de tu identificación oficial (INE), por favor.');
const merge = get('Fusionar Datos del Lead1');
if (!merge.parameters.jsCode.includes('mensaje_cliente:')) {
  merge.parameters.jsCode = merge.parameters.jsCode.replace('    nombre: extraer(', [
    '    mensaje_cliente: (() => {',
    "      let text = output.split('<<<DATOS_INTERNOS>>>')[0].trim();",
    "      const cita = extraer(/Cita:\\s*([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2})/);",
    "      if (cita && !previo.fecha_cita && !/INE|identificaci[oó]n oficial/i.test(text)) {",
    "        text = text.replace(/En un momento te voy a pedir unos documentos para agilizar tu cita[.!]?/gi, '').trim();",
    "        text += '\\n\\nPara preparar tu expediente, mándame una foto clara de tu identificación oficial (INE), por favor.';",
    '      }',
    '      return text;',
    '    })(),',
    '    nombre: extraer(',
  ].join('\n'));
}
get('Enviar Respuesta WhatsApp1').parameters.jsonBody = "={{ JSON.stringify({ number: $('Webhook WhatsApp1').item.json.body.data.key.remoteJid.split('@')[0], text: $('Fusionar Datos del Lead1').first().json.mensaje_cliente }) }}";
const agent = get('AI Agent Vendedor1');
agent.parameters.options.systemMessage = agent.parameters.options.systemMessage.replace(
  'Documentos: NO pidas tú los documentos (INE, comprobante de domicilio, ingresos). Eso lo gestiona el sistema automáticamente después de agendar la cita. Solo avisa: "En un momento te voy a pedir unos documentos para agilizar tu cita."',
  'Documentos: después de que crear_cita confirme una cita nueva, pide en ESA MISMA respuesta una foto clara de la identificación oficial (INE) para preparar el expediente. Nunca prometas un mensaje posterior ni vuelvas a crear la cita para iniciar documentos. El sistema gestionará después el comprobante de domicilio y el de ingresos, uno a la vez.'
);
const update = get('Líder de Actualizar1');
update.parameters.url = "=https://deljncdcddfghfihuumd.supabase.co/rest/v1/leads?id=eq.{{ $json.lead_id }}&lote_id=eq.{{ $json.lote_id }}";
get('Mapear Columna / Siguiente Paso1').parameters.jsCode = get('Mapear Columna / Siguiente Paso1').parameters.jsCode.replace(
  'Listo, ya tengo tus 3 documentos. Tu expediente está completo, en breve un asesor te contactará para agendar tu cita.',
  'Listo, recibí los 3 documentos y tu expediente quedó completo. Tu cita ya está registrada; un asesor revisará la documentación.'
);
for (const [suffix, send, x] of [['documento', 'Responder WhatsApp1', 37900], ['solicitud documental', 'Responder Sin Adjunto1', 37900]]) {
  const y = suffix === 'documento' ? 17400 : 17800;
  const auth = clone('Autorizar envío único', `Autorizar ${suffix}`, [x, y]);
  const gate = clone('¿Envío autorizado?', `¿Enviar ${suffix}?`, [x + 220, y]);
  connect(auth.name, [gate.name]);
  connect(gate.name, [send], []);
  get(send).parameters.options.timeout = 15000;
  connect(send, ['Confirmar respuesta documental']);
}
const accepted = clone('Confirmar envío aceptado', 'Confirmar respuesta documental', [38400, 17600]);
accepted.parameters.jsonBody = "={{ (() => { const id = $('Preparar identidad del mensaje').first().json; return JSON.stringify({ p_instance:id.instance,p_message_id:id.message_id,p_execution_id:id.execution_id,p_state:'accepted',p_outbound_id:$json.key?.id || null }); })() }}";
const confirmed = clone('¿Envío confirmado?', '¿Respuesta documental confirmada?', [38620, 17600]);
connect(accepted.name, [confirmed.name]);
connect(confirmed.name, ['Completar mensaje durable'], ['Detener confirmación inconsistente']);
connect('Líder de Actualizar1', ['Autorizar documento']);
connect('Continuar1', ['Base64 y binario1'], ['Autorizar solicitud documental']);
fs.writeFileSync(file, JSON.stringify(workflow, null, 2) + '\n');
