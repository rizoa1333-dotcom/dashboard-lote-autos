'use strict';
const fs=require('node:fs');

/** @param {{version:string,dependencies:Record<string,string>,overrides?:Record<string,unknown>}} manifest */
function hardenManifest(manifest){
  if(manifest?.version!=='2.3.7')throw Error('UNEXPECTED_EVOLUTION_BASE');
  if(!['7.0.0-rc.9','7.0.0-rc13'].includes(manifest.dependencies?.baileys))throw Error('UNEXPECTED_BAILEYS_BASE');
  const result=structuredClone(manifest);
  result.dependencies.baileys='7.0.0-rc13';
  // The vendor application is already compiled; tsup is not used by start:prod.
  delete result.dependencies.tsup;
  result.overrides={...result.overrides,'proxy-addr':'2.0.8','fast-xml-parser@4':'4.5.4','fast-xml-parser@5':'5.3.5'};
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
