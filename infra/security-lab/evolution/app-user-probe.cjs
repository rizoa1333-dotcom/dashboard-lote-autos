'use strict';

/** SSH observes as root without ptrace; run the trusted probe as the application's UID.
 * This produces an operator-only program, not an HTTP endpoint.
 * @param {string} source @returns {string} */
function asApplicationUser(source) {
  if(typeof source!=='string'||!source.trim()||source.length>65536||source.includes('\0'))throw new Error('INVALID_APP_PROBE');
  const childSource="if(process.getuid()!==1000||process.getgid()!==1000){console.error('APP_PROBE_IDENTITY_UNAVAILABLE');process.exit(1);}\n"+
    "setTimeout(()=>{console.error('APP_PROBE_TIMEOUT');process.exit(124);},35000).unref();\n"+source;
  return `'use strict';
const {spawn}=require('node:child_process');
if(process.platform!=='linux'||![0,1000].includes(process.getuid())){console.error('APP_PROBE_IDENTITY_UNAVAILABLE');process.exit(1);}
const current=process.getuid();
const child=spawn(process.execPath,[],{cwd:'/evolution',stdio:['pipe','inherit','inherit'],...(current===0?{uid:1000,gid:1000}:{})});
child.once('error',()=>{console.error('APP_PROBE_IDENTITY_UNAVAILABLE');process.exitCode=1;});
child.stdin.once('error',()=>{process.exitCode=1;});
child.once('exit',(code,signal)=>{process.exitCode=signal?1:code===0?0:code||1;});
child.stdin.end(${JSON.stringify(childSource)});
`;
}

module.exports={asApplicationUser};
