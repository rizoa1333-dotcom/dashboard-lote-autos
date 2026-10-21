const fs=require('node:fs');
const crypto=require('node:crypto');
const html=fs.readFileSync(require('node:path').join(__dirname,'dashboard.html'),'utf8');
const inlineStyles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>"'sha256-"+crypto.createHash('sha256').update(m[1].replace(/\r\n?/g,'\n')).digest('base64')+"'");
module.exports={
 useDefaults:false,
 directives:{
  defaultSrc:["'self'"], baseUri:["'none'"], objectSrc:["'none'"], frameAncestors:["'none'"], frameSrc:["'none'"],
  scriptSrc:["'self'"],scriptSrcAttr:["'none'"],
  styleSrc:["'self'",'https://fonts.googleapis.com',...inlineStyles],
  styleSrcAttr:["'unsafe-inline'"],
  fontSrc:["'self'",'https://fonts.gstatic.com','data:'],
  imgSrc:["'self'",'https:','data:','blob:'], mediaSrc:["'self'",'https:','blob:'],
  connectSrc:["'self'",'https://deljncdcddfghfihuumd.supabase.co','wss://deljncdcddfghfihuumd.supabase.co','https://n8n-production-97a4.up.railway.app'],
  workerSrc:["'self'"],manifestSrc:["'self'"],formAction:["'self'"]
 }
};
