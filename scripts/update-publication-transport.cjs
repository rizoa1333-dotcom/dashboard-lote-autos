const fs=require('node:fs');
const path=require('node:path');
const file=process.argv[2]||path.join(__dirname,'../VeloDrive-n8n-intervencion-automatica.json');
const workflow=JSON.parse(fs.readFileSync(file,'utf8'));
const node=workflow.nodes.find(n=>n.name==='Publicar Upload-Post (Fotos)1');
if(!node)throw Error('PUBLICATION_TRANSPORT_MISSING');
const validated="$('Validar Datos de Publicación').item.json";
const expr=source=>'={{ '+source+' }}';
const field=(name,value)=>({parameterType:'formData',name,value});
const parameters=[
  field('user',expr("$('Normalizar Verificación Token2').item.json.loteId")),
  field('title',expr(validated+'.copy')),
  field('async_upload','true'),
  field('request_id',expr(validated+'.requestId')),
];
// Keep the collection schema static: n8n editors cannot reliably render expression-valued collections.
for(let i=0;i<2;i++)parameters.push(field(expr(validated+'.platforms['+i+'] ? \'platform[]\' : \'velodrive_unused_platform_'+i+'\''),expr(validated+'.platforms['+i+'] || \'\'')));
for(let i=0;i<10;i++)parameters.push(field(expr(validated+'.urls['+i+'] ? \'photos[]\' : \'velodrive_unused_photo_'+i+'\''),expr(validated+'.urls['+i+'] || \'\'')));
node.parameters.contentType='multipart-form-data';
node.parameters.sendBody=true;
node.parameters.bodyParameters={parameters};
for(const key of ['body','rawContentType','inputDataFieldName','specifyBody','jsonBody'])delete node.parameters[key];
node.parameters.options.response.response.responseFormat='autodetect';
fs.writeFileSync(file,JSON.stringify(workflow,null,2)+'\n');
