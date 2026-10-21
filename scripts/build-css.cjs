const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const postcss=require('postcss');
const root=path.join(__dirname,'..');
const output=path.join(root,'public/assets/utilities.css');
execFileSync(process.execPath,[path.join(root,'node_modules/@tailwindcss/cli/dist/index.mjs'),'-i',path.join(root,'assets/utilities.input.css'),'-o',output,'--minify'],{stdio:'inherit',windowsHide:true});
const css=postcss.parse(fs.readFileSync(output,'utf8'));
// Existing application CSS depends on the v3 cascade (utilities before authored rules).
css.walkAtRules('layer',rule=>{if(rule.nodes)rule.replaceWith(...rule.nodes);else rule.remove();});
css.walkRules(rule=>{
 rule.selectors=rule.selectors.map(selector=>{
  if(!selector.startsWith(':where(.'))return selector;
  let depth=1;
  for(let i=7;i<selector.length;i++){
   if(selector[i]==='\\'){i++;continue;}
   if(selector[i]==='(')depth++;
   if(selector[i]===')'&&--depth===0)return selector.slice(7,i)+selector.slice(i+1);
  }
  throw new Error('UNBALANCED_UTILITY_SELECTOR');
 });
});
fs.writeFileSync(output,css.toString());
