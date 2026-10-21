const fs=require('node:fs');
const path=require('node:path');
const {evaluatePublicationResponse}=require('../publication-result');
const file=process.argv[2] || path.join(__dirname,'../VeloDrive-n8n-intervencion-automatica.json');
const workflow=JSON.parse(fs.readFileSync(file,'utf8'));
const node=workflow.nodes.find(n=>n.name==='Evaluar Envío de Publicación');
if(!node)throw Error('PUBLICATION_EVALUATOR_MISSING');
node.parameters.jsCode=evaluatePublicationResponse.toString()+"\nreturn [{json:evaluatePublicationResponse($json, $('Validar Datos de Publicación').item.json.requestId)}];";
fs.writeFileSync(file,JSON.stringify(workflow,null,2)+'\n');
