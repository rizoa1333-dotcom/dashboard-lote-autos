'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const VENDOR_HASH='1f70bef06584369c9846d25e6460719940799fc39e6ce92460eb459de5f6bfa8';
const SHARED_HASH='cca2c0fdbdf8f5a4d84f61f8c1afc031985850a5d9dbdc7c948c18cc8d39cd6b';
const RULE_HASH='2d92309d2a0517b7ac74ba6780333996ff3bf0763e28464916f04befdddb4dee';
const RELEASE='vd-security-20261101';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function sliceExact(source,start,end,label){const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<=a||source.indexOf(start,a+start.length)!==-1)throw Error(label);return{a,b,text:source.slice(a,b)};}

/** Build-only replacement of the exact reviewed bundle; never accepts arbitrary vendor versions. */
function patchVendor(source,shared,rule){
 if(hash(source)!==VENDOR_HASH)throw Error('EDITOR_VENDOR_HASH');
 if(hash(shared)!==SHARED_HASH)throw Error('EDITOR_SHARED_HASH');
 if(hash(rule)!==RULE_HASH)throw Error('EDITOR_RULE_HASH');
 const originalSanitizer=sliceExact(source,'function Tre(','var Mre=','EDITOR_SANITIZER_LAYOUT');
 const outside=source.slice(0,originalSanitizer.a)+source.slice(originalSanitizer.b);
 for(const name of ['Tre','Ere','Dre','Ore','kre','Are'])if(new RegExp('\\b'+name+'\\b').test(outside))throw Error('EDITOR_SANITIZER_EXTERNAL_CONSUMER');
 const fixedSanitizer=sliceExact(shared,'function escapeAttributeValue(','\n/**\n * Event emitter','EDITOR_FIXED_SANITIZER_LAYOUT').text;
 if(/\b(?:exports|require|warn|__DEV__)\b/.test(fixedSanitizer))throw Error('EDITOR_FIXED_SANITIZER_DEPENDENCY');
 const sanitizer='const jre=(()=>{'+fixedSanitizer+'\nreturn sanitizeTranslatedHtml;})();';
 let patched=source.slice(0,originalSanitizer.a)+sanitizer+source.slice(originalSanitizer.b);
 const originalRule=sliceExact(patched,'TOe=i(',',EOe=','EDITOR_RULE_LAYOUT');
 const importLine="import { isWhiteSpace, isPunctCharCode, isMdAsciiPunct } from '../common/utils.mjs'";
 const exportLine='export default function smartquotes (state)';
 if(rule.split(importLine).length!==2||rule.split(exportLine).length!==2)throw Error('EDITOR_FIXED_RULE_LAYOUT');
 const adaptedRule=rule.replace(importLine,'const { isWhiteSpace, isMdAsciiPunct, isPunctChar } = op();\nconst isPunctCharCode = code => isPunctChar(String.fromCharCode(code));').replace(exportLine,'t.exports = function smartquotes (state)');
 const replacement='TOe=i(((e,t)=>{\n'+adaptedRule+'\n}))';
 return patched.slice(0,originalRule.a)+replacement+patched.slice(originalRule.b);
}

function planAssetNames(names){
 if(!Array.isArray(names)||names.length>4000||new Set(names).size!==names.length)throw Error('EDITOR_ASSET_LIST');
 const plan=new Map();for(const name of names){if(typeof name!=='string'||!/^[A-Za-z0-9_.-]{1,200}\.js(?:\.map)?$/.test(name)||name.includes(RELEASE))throw Error('EDITOR_ASSET_NAME');plan.set(name,name.replace(/\.js(?=\.map$|$)/,'-'+RELEASE+'.js'));}return plan;
}
function rewriteAssetReferences(source,names){
 const escaped=[...names.keys()].sort((a,b)=>b.length-a.length).map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 return escaped.length?source.replace(new RegExp('(?<![A-Za-z0-9_.-])(?:'+escaped.join('|')+')(?![A-Za-z0-9_.-])','g'),name=>names.get(name)):source;
}

function hardenEditor(dist,overlay){
 const root=fs.realpathSync(dist),assets=path.join(root,'assets');
 if(!fs.lstatSync(assets).isDirectory()||fs.lstatSync(assets).isSymbolicLink()||fs.realpathSync(assets)!==assets)throw Error('EDITOR_ASSET_DIRECTORY');
 const vendor=path.join(assets,'vendor-CvFzIYav.js');
 const sharedRoot=path.join(overlay,'node_modules/@intlify/shared'),markdownRoot=path.join(overlay,'node_modules/markdown-it');
 if(JSON.parse(fs.readFileSync(path.join(sharedRoot,'package.json'),'utf8')).version!=='11.4.14'||JSON.parse(fs.readFileSync(path.join(markdownRoot,'package.json'),'utf8')).version!=='14.3.3')throw Error('EDITOR_FIXED_VERSION');
 const patched=patchVendor(fs.readFileSync(vendor,'utf8'),fs.readFileSync(path.join(sharedRoot,'dist/shared.prod.cjs'),'utf8'),fs.readFileSync(path.join(markdownRoot,'lib/rules_core/smartquotes.mjs'),'utf8'));
 const scripts=fs.readdirSync(assets).filter(name=>/\.js(?:\.map)?$/.test(name)),names=planAssetNames(scripts),pending=[];
 let totalBytes=0;
 for(const directory of [root,assets])for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(!/\.(?:js|map|json|html|css)$/.test(entry.name))continue;
  const file=path.join(directory,entry.name),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('EDITOR_ASSET_TYPE');
  totalBytes+=stat.size;if(stat.size>32*1024*1024||totalBytes>256*1024*1024)throw Error('EDITOR_ASSET_LIMIT');
  const before=fs.readFileSync(file,'utf8'),after=rewriteAssetReferences(file===vendor?patched:before,names);
  const target=directory===assets&&names.has(entry.name)?path.join(assets,names.get(entry.name)):file;
  if(target!==file&&fs.existsSync(target))throw Error('EDITOR_ASSET_COLLISION');
  pending.push({file,target,before,after});if(pending.length>8000)throw Error('EDITOR_ASSET_COUNT');
 }
 if(!pending.some(x=>x.file===path.join(root,'index.html')&&x.after!==x.before))throw Error('EDITOR_INDEX_REFERENCES_MISSING');
 for(const item of pending){if(item.after!==item.before)fs.writeFileSync(item.file,item.after);if(item.target!==item.file)fs.renameSync(item.file,item.target);}
 const notices=[['markdown-it 14.3.3',markdownRoot],['@intlify/shared 11.4.14',sharedRoot]].map(([label,folder])=>label+'\n'+fs.readFileSync(path.join(folder,'LICENSE'),'utf8')).join('\n\n');
 fs.writeFileSync(path.join(root,'velodrive-security-licenses.txt'),notices,{flag:'wx'});
 return{release:RELEASE,scripts:names.size,files:pending.length,upstreamVendorSha256:VENDOR_HASH,patchedVendorSha256:hash(patched)};
}
module.exports={patchVendor,planAssetNames,rewriteAssetReferences,hardenEditor};
