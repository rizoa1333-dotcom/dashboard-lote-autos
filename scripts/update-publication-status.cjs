const fs = require('node:fs');
const path = require('node:path');
const {evaluatePublicationStatus} = require('../publication-result');
const file = process.argv[2] || path.join(__dirname, '../VeloDrive-n8n-intervencion-automatica.json');
const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
const node = workflow.nodes.find(entry => entry.name === 'Evaluar Resultado1');
if (!node) throw Error('PUBLICATION_STATUS_EVALUATOR_MISSING');
node.parameters.jsCode = evaluatePublicationStatus.toString() + "\nreturn [{json:{...evaluatePublicationStatus($json),car_id:$('Webhook Verificar Publicación1').item.json.body.car_id,lote_id:$('Normalizar Verificación Token6').item.json.loteId}}];";
fs.writeFileSync(file, JSON.stringify(workflow, null, 2) + '\n');
