#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client, CliError } from '../lib/client.mjs';
import { asCliError } from '../lib/errors.mjs';
import { capabilities } from '../lib/operations.mjs';
function parse(argv){const words=[],flags={};for(let i=0;i<argv.length;i++){if(argv[i].startsWith('--')){const values=argv[i].slice(2).split('='),name=values.shift();if(!name||Object.hasOwn(flags,name))throw new CliError(`Invalid/duplicate option: ${name}`);if(values.length)flags[name]=values.join('=');else if(argv[i+1]!==undefined&&!argv[i+1].startsWith('--'))flags[name]=argv[++i];else flags[name]=true;}else words.push(argv[i]);}return {words,flags};}
const camel=v=>v.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
const output=v=>process.stdout.write(JSON.stringify(v)+'\n');
const envelope=(operation,data,request_id)=>({schema_version:'1.0',ok:true,operation,...(request_id?{request_id}:{}),data});
let operation='unknown',requestId,client;
try{
 const {words,flags}=parse(process.argv.slice(2));
 if(flags.version){process.stdout.write('0.2.0\n');process.exit(0);}
 if(flags.help||!words.length){process.stdout.write(`molla — standalone CLI runtime (no web server/browser)
node bin/molla.mjs capabilities
node bin/molla.mjs health --db .local/molla.sqlite
node bin/molla.mjs demo login --actor mom --db .local/molla.sqlite --session .local/mom.json
node bin/molla.mjs task create --text "쌀 10kg 주문해줘" --session .local/mom.json
node bin/molla.mjs task get --id TASK_ID --session .local/mom.json
node bin/molla.mjs task decide --id TASK_ID --decision approve --owner-confirmed --expected-action-hash HASH --session .local/mom.json
node bin/molla.mjs task execute --id TASK_ID --session .local/mom.json
node bin/molla.mjs route --input - --session .local/mom.json
Global options: --db FILE --session FILE
No serve, base-url, port or browser options. Local demo profiles are not production authentication.
Exit codes: 0 command success, 2 usage, 3 session, 4 forbidden/owner decision, 5 runtime.
`);process.exit(0);}
 operation=words.join('.');if(operation==='serve')throw new CliError('No server is used in v0.2. Run commands directly.');
 for(const key of ['base-url','port','app-dir','timeout-ms'])if(Object.hasOwn(flags,key))throw new CliError(`--${key} is unsupported: this is a standalone CLI runtime.`);
 if(operation==='capabilities'){if(Object.keys(flags).length)throw new CliError('capabilities takes no options');output(envelope(operation,capabilities()));}
 else{
  client=new Client({db:flags.db,session:flags.session});
  if(operation==='demo.login'){for(const f of Object.keys(flags))if(!['db','session','actor'].includes(f))throw new CliError(`Unknown option: ${f}`);output(envelope(operation,await client.login(flags.actor)));}
  else{
   let args={};
   if(operation==='route'){
    for(const f of Object.keys(flags))if(!['input','db','session'].includes(f))throw new CliError(`Unknown option: ${f}`);if(typeof flags.input!=='string')throw new CliError('route requires --input FILE or --input -');
    let raw='';if(flags.input==='-'){process.stdin.setEncoding('utf8');let size=0;for await(const chunk of process.stdin){size+=Buffer.byteLength(chunk);if(size>16000)throw new CliError('Input exceeds 16000 bytes');raw+=chunk;}}else raw=await readFile(resolve(flags.input),'utf8');if(Buffer.byteLength(raw)>16000)throw new CliError('Input exceeds 16000 bytes');
    let v;try{v=JSON.parse(raw);}catch{throw new CliError('Invalid input JSON');}if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['schema_version','operation','arguments','request_id'].includes(k))||v.schema_version!=='1.0'||typeof v.operation!=='string')throw new CliError('Invalid route envelope');
    if(v.request_id!==undefined&&(typeof v.request_id!=='string'||!/^[-a-zA-Z0-9_.:]{1,128}$/.test(v.request_id)))throw new CliError('Invalid request_id');operation=v.operation;requestId=v.request_id;args=v.arguments??{};
   }else for(const [k,v] of Object.entries(flags)){if(['db','session'].includes(k))continue;args[camel(k)]=v;}
   output(envelope(operation,await client.run(operation,args),requestId));
  }
 }
}catch(e){const c=asCliError(e);output({schema_version:'1.0',ok:false,operation,...(requestId?{request_id:requestId}:{}),error:{code:c.code,message:c.message,retryable:false,...(c.status?{status:c.status}:{})}});process.exitCode=c.exitCode;}
finally{client?.close();}
