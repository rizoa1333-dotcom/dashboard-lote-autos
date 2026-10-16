const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'VeloDrive-n8n-intervencion-automatica.json');
const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
const node = name => {
  const result = workflow.nodes.find(item => item.name === name);
  if (!result) throw new Error(`Missing node: ${name}`);
  return result;
};
// Un espacio de nombres nuevo impide volver a leer la memoria compartida defectuosa.
node('Simple Memory1').parameters.sessionKey = `={{ (() => {
  const lot = String($('Edit Fields1').first().json.tenant_lote_id || '');
  const phone = String($('Preparar identidad del mensaje').first().json.phone_number || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lot) || !/^[0-9]{10,15}$/.test(phone)) throw new Error('CONVERSATION_IDENTITY_REQUIRED');
  return 'velodrive:v2:' + lot.toLowerCase() + ':' + phone;
})() }}`;
for (const name of ['Buscar Lead Existente1', 'Recuperar Historial1']) {
  const filters = node(name).parameters.filters.conditions;
  filters.find(condition => condition.keyName === 'phone_number').keyValue = "={{ $('Preparar identidad del mensaje').first().json.phone_number }}";
  filters.find(condition => condition.keyName === 'lote_id').keyValue = "={{ $('Edit Fields1').first().json.tenant_lote_id }}";
}
fs.writeFileSync(file, JSON.stringify(workflow, null, 2) + '\n');
