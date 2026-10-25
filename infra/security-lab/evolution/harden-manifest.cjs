'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');

/** @param {{version:string,dependencies:Record<string,string>,overrides?:Record<string,unknown>}} manifest */
function hardenManifest(manifest){
  if(manifest?.version!=='2.3.7')throw Error('UNEXPECTED_EVOLUTION_BASE');
  if(!['7.0.0-rc.9','7.0.0-rc13'].includes(manifest.dependencies?.baileys))throw Error('UNEXPECTED_BAILEYS_BASE');
  const result=structuredClone(manifest);
  result.dependencies.baileys='7.0.0-rc13';
  const patches={axios:'1.20.0',undici:'7.30.1',sharp:'0.35.5',multer:'2.5.0',compression:'1.8.2','link-preview-js':'4.0.4'};
  for(const [name,version] of Object.entries(patches)){
    if(Object.hasOwn(result.dependencies,name))result.dependencies[name]=version;
  }
  // The vendor application is already compiled; tsup is not used by start:prod.
  delete result.dependencies.tsup;
  const reference=name=>Object.hasOwn(result.dependencies,name)?'$'+name:patches[name];
  result.overrides={...result.overrides,'proxy-addr':'2.0.8',
    'fast-xml-parser@4':'4.5.5','fast-xml-parser@5':'5.5.6',
    'axios@1':reference('axios'),'axios@0':'0.34.0',
    'undici@7':reference('undici'),'undici@6':'6.29.1','body-parser@1':'1.20.9',sharp:reference('sharp'),'multer@2':reference('multer'),
    'ws@8':'8.21.0','engine.io@6':'6.6.10','socket.io-parser@4':'4.2.7',
    'compression@1':reference('compression'),'brace-expansion@2':'2.1.6',
    'defu@6':'6.1.5','effect@3':'3.20.0','ip-address@10':'10.3.1',
    'jws@3':'3.2.3','lodash@4':'4.18.1','minimatch@9':'9.0.7','path-to-regexp@0.1':'0.1.13',
    'deepmerge-ts@7':'8.0.0','link-preview-js':reference('link-preview-js')};
  return result;
}

/** Patch only the reviewed rc13 module; any vendor drift must stop the build. @param {string} source */
function hardenBaileysPreview(source){
  const disabled='// VeloDrive: automatic URL previews are disabled to avoid untrusted fetches.\nexport const getUrlInfo = async (_text, _options) => undefined;\n';
  if(source===disabled)return source;
  if(crypto.createHash('sha256').update(source).digest('hex')!=='895f1fa2f265cc214d5a7a458a9574a88c7f1470b90c6daab1012a6c61cf3716')throw Error('UNEXPECTED_BAILEYS_PREVIEW_SOURCE');
  return disabled;
}

/** Remove the known vendor log without changing migration or error handling. */
function hardenStartupScript(script){
  const result=script.replace(/^[ \t]*echo "Database URL: \$DATABASE_URL"\r?\n/gm,'');
  if(result.includes('$DATABASE_URL'))throw Error('UNEXPECTED_DATABASE_URL_LOG');
  return result;
}

if(require.main===module){
  if(process.argv[2]==='--disable-link-previews'){
    const preview='/evolution/node_modules/baileys/lib/Utils/link-preview.js';
    fs.writeFileSync(preview,hardenBaileysPreview(fs.readFileSync(preview,'utf8')));
  }else{
  const file=process.argv[2]||'/evolution/package.json';
  fs.writeFileSync(file,JSON.stringify(hardenManifest(JSON.parse(fs.readFileSync(file,'utf8'))),null,2)+'\n');
  const startup='/evolution/Docker/scripts/deploy_database.sh';
  fs.writeFileSync(startup,hardenStartupScript(fs.readFileSync(startup,'utf8')));
  }
}
module.exports={hardenManifest,hardenStartupScript,hardenBaileysPreview};
