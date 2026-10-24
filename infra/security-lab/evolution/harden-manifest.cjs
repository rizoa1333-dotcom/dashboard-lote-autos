'use strict';
const fs=require('node:fs');

/** @param {{version:string,dependencies:Record<string,string>,overrides?:Record<string,unknown>}} manifest */
function hardenManifest(manifest){
  if(manifest?.version!=='2.3.7')throw Error('UNEXPECTED_EVOLUTION_BASE');
  if(!['7.0.0-rc.9','7.0.0-rc13'].includes(manifest.dependencies?.baileys))throw Error('UNEXPECTED_BAILEYS_BASE');
  const result=structuredClone(manifest);
  result.dependencies.baileys='7.0.0-rc13';
  const patches={axios:'1.20.0',undici:'7.29.1',sharp:'0.35.5',multer:'2.3.0'};
  for(const [name,version] of Object.entries(patches)){
    if(Object.hasOwn(result.dependencies,name))result.dependencies[name]=version;
  }
  // The vendor application is already compiled; tsup is not used by start:prod.
  delete result.dependencies.tsup;
  const reference=name=>Object.hasOwn(result.dependencies,name)?'$'+name:patches[name];
  result.overrides={...result.overrides,'proxy-addr':'2.0.8',
    'fast-xml-parser@4':'4.5.5','fast-xml-parser@5':'5.5.6',
    'axios@1':reference('axios'),'axios@0':'0.32.0',
    'undici@7':reference('undici'),sharp:reference('sharp'),'multer@2':reference('multer'),
    'ws@8':'8.21.0','engine.io@6':'6.6.10','socket.io-parser@4':'4.2.7'};
  return result;
}

/** Remove the known vendor log without changing migration or error handling. */
function hardenStartupScript(script){
  const result=script.replace(/^[ \t]*echo "Database URL: \$DATABASE_URL"\r?\n/gm,'');
  if(result.includes('$DATABASE_URL'))throw Error('UNEXPECTED_DATABASE_URL_LOG');
  return result;
}

if(require.main===module){
  const file=process.argv[2]||'/evolution/package.json';
  fs.writeFileSync(file,JSON.stringify(hardenManifest(JSON.parse(fs.readFileSync(file,'utf8'))),null,2)+'\n');
  const startup='/evolution/Docker/scripts/deploy_database.sh';
  fs.writeFileSync(startup,hardenStartupScript(fs.readFileSync(startup,'utf8')));
}
module.exports={hardenManifest,hardenStartupScript};
