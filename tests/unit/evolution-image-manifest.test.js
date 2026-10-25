const test=require('node:test');
const assert=require('node:assert/strict');
let hardenManifest;
let hardenStartupScript;
let hardenBaileysPreview;
try{({hardenManifest}=require('../../infra/security-lab/evolution/harden-manifest.cjs'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
({hardenStartupScript}=require('../../infra/security-lab/evolution/harden-manifest.cjs'));
({hardenBaileysPreview}=require('../../infra/security-lab/evolution/harden-manifest.cjs'));
const fixture={name:'evolution-api',version:'2.3.7',dependencies:{baileys:'7.0.0-rc.9',minio:'^8.0.3',prisma:'^6.1.0',tsup:'^8.3.5'},devDependencies:{tsx:'4.0.0'},scripts:{'start:prod':'node dist/main'},overrides:{unrelated:'1.2.3'}};
test('la candidata conserva Evolution estable y limita los cambios de dependencias a correcciones previstas',()=>{
 assert.equal(typeof hardenManifest,'function');
 const before=structuredClone(fixture),out=hardenManifest(fixture);
 assert.deepEqual(fixture,before);
 assert.equal(out.version,'2.3.7');
 assert.equal(out.dependencies.baileys,'7.0.0-rc13');
 assert.equal(out.dependencies.tsup,undefined);
 assert.equal(out.dependencies.minio,before.dependencies.minio);
 assert.equal(out.dependencies.prisma,before.dependencies.prisma);
 assert.deepEqual(out.scripts,before.scripts);
 assert.equal(out.overrides['proxy-addr'],'2.0.8');
 assert.equal(out.overrides['fast-xml-parser@4'],'4.5.5');
 assert.equal(out.overrides['fast-xml-parser@5'],'5.5.6');
 assert.equal(out.overrides.unrelated,'1.2.3');
 assert.equal(out.overrides['deepmerge-ts@7'],'8.0.0');
 assert.deepEqual(hardenManifest(out),out);
});
test('la candidata corrige previews pero bloquea el consumidor automatico hasta tener egreso seguro',()=>{
 const source={...fixture,dependencies:{...fixture.dependencies,'link-preview-js':'^3.0.13'}};
 const out=hardenManifest(source);
 assert.equal(out.dependencies['link-preview-js'],'4.0.4');
 assert.equal(out.overrides['link-preview-js'],'$link-preview-js');
 assert.equal(typeof hardenBaileysPreview,'function');
 assert.throws(()=>hardenBaileysPreview('export const getUrlInfo=async()=>{};'),/UNEXPECTED_BAILEYS_PREVIEW_SOURCE/);
 const disabled='// VeloDrive: automatic URL previews are disabled to avoid untrusted fetches.\nexport const getUrlInfo = async (_text, _options) => undefined;\n';
 assert.equal(hardenBaileysPreview(disabled),disabled);
});

test('los parches de transporte e imagen mantienen coherentes dependencias directas y transitivas',()=>{
 const source={...fixture,dependencies:{...fixture.dependencies,axios:'^1.7.9',undici:'^7.16.0',sharp:'^0.34.2',multer:'^2.0.2'}};
 const before=structuredClone(source),out=hardenManifest(source);
 assert.deepEqual(source,before);
 for(const [name,version] of [['axios','1.20.0'],['undici','7.30.1'],['sharp','0.35.5'],['multer','2.5.0']]){
  assert.equal(out.dependencies[name],version);
 }
 assert.equal(out.overrides['axios@1'],'$axios');
 assert.equal(out.overrides['axios@0'],'0.34.0');
 assert.equal(out.overrides['undici@7'],'$undici');
 assert.equal(out.overrides.sharp,'$sharp');
 assert.equal(out.overrides['multer@2'],'$multer');
 assert.equal(out.overrides['ws@8'],'8.21.0');
 assert.equal(out.overrides['engine.io@6'],'6.6.10');
 assert.equal(out.overrides['socket.io-parser@4'],'4.2.7');
 assert.equal(out.dependencies.minio,before.dependencies.minio);
 assert.equal(out.dependencies.prisma,before.dependencies.prisma);
 assert.deepEqual(hardenManifest(out),out);
});

test('la tercera ronda fija correcciones dentro de las ramas de runtime existentes',()=>{
 const source={...fixture,dependencies:{...fixture.dependencies,compression:'^1.7.5'}};
 const out=hardenManifest(source);
 assert.equal(out.dependencies.compression,'1.8.2');
 assert.equal(out.overrides['compression@1'],'$compression');
 const versions={'brace-expansion@2':'2.1.6','defu@6':'6.1.5','effect@3':'3.20.0',
  'ip-address@10':'10.3.1','jws@3':'3.2.3','lodash@4':'4.18.1',
  'minimatch@9':'9.0.7','path-to-regexp@0.1':'0.1.13'};
 for(const [name,version] of Object.entries(versions))assert.equal(out.overrides[name],version);
 assert.equal(out.dependencies.minio,fixture.dependencies.minio);
 assert.equal(out.dependencies.prisma,fixture.dependencies.prisma);
 assert.deepEqual(hardenManifest(out),out);
});

test('el arranque conserva migraciones y elimina exclusivamente la impresion de la URL de base de datos',()=>{
 const source='#!/bin/bash\nexport DATABASE_URL\necho "Database URL: $DATABASE_URL"\nnpm run db:deploy\nnpm run db:generate\n';
 assert.equal(typeof hardenStartupScript,'function');
 const output=hardenStartupScript(source);
 assert.equal(output,source.replace('echo "Database URL: $DATABASE_URL"\n',''));
 assert.equal(hardenStartupScript(output),output);
 assert.throws(()=>hardenStartupScript('echo "Unexpected database URL: $DATABASE_URL"'),/UNEXPECTED_DATABASE_URL_LOG/);
});

test('la candidata instala desde el lock revisado y regenera Prisma sin conectar a una base',()=>{
 const fs=require('node:fs');
 const docker=fs.readFileSync(require('node:path').join(__dirname,'../../infra/security-lab/evolution/Dockerfile'),'utf8');
 assert.match(docker,/COPY package-lock\.json/);
 assert.match(docker,/npm ci --omit=dev --ignore-scripts/);
 assert.match(docker,/DATABASE_PROVIDER=postgresql npm run db:generate/);
 const lock=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../../infra/security-lab/evolution/package-lock.json'),'utf8').replace(/^\uFEFF/,''));
 assert.equal(lock.packages[''].dependencies.baileys,'7.0.0-rc13');
 assert.equal(lock.packages['node_modules/proxy-addr'].version,'2.0.8');
 assert.equal(lock.packages['node_modules/deepmerge-ts'].version,'8.0.0');
 assert.equal(lock.packages['node_modules/link-preview-js'].version,'4.0.4');
 for(const [name,version] of [['axios','1.20.0'],['undici','7.30.1'],['sharp','0.35.5'],['multer','2.5.0']]){
  assert.equal(lock.packages[''].dependencies[name],version);
  assert.equal(lock.packages['node_modules/'+name].version,version);
 }
 for(const [entry,value] of Object.entries(lock.packages)){
  if(entry.endsWith('/node_modules/axios')||entry==='node_modules/axios'){
   assert.ok(['1.20.0','0.34.0'].includes(value.version),entry);
  }
 }
});
test('una base o version de Baileys inesperada requiere revision antes de construir',()=>{
 assert.equal(typeof hardenManifest,'function');
 assert.throws(()=>hardenManifest({...fixture,version:'2.4.0'}),/UNEXPECTED_EVOLUTION_BASE/);
 assert.throws(()=>hardenManifest({...fixture,dependencies:{baileys:'unreviewed'}}),/UNEXPECTED_BAILEYS_BASE/);
});

test('la quinta ronda corrige parsers y ambas ramas de Undici sin migrar Zod ciegamente',()=>{
 const out=hardenManifest(fixture);
 assert.equal(out.overrides['body-parser@1'],'1.20.9');
 assert.equal(out.overrides['undici@6'],'6.29.1');
 assert.equal(out.overrides.zod,undefined);
});
