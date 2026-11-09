#!/usr/bin/env node
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Client, CliError } from '../lib/client.mjs';
import { operations, capabilities } from '../lib/operations.mjs';

const packageDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const globalNames=new Set(['base-url','session','timeout-ms','input','app-dir','port','db']);
function parse(argv){
 const words=[],flags={};
 for(let i=0;i<argv.length;i++){
  if(argv[i].startsWith('--')){
   const match=argv[i].slice(2).split('=');const name=match.shift();
   if(!name||Object.hasOwn(flags,name))throw new CliError(`Duplicate or invalid option: ${name}`);
   if(match.length)flags[name]=match.join('=');
   else if(argv[i+1]!==undefined&&!argv[i+1].startsWith('--'))flags[name]=argv[++i];
   else flags[name]=true;
  }else words.push(argv[i]);
 }
 return {words,flags};
}
function camel(name){return name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());}
function output(v){process.stdout.write(JSON.stringify(v)+'\n');}
function envelope(operation,data,requestId){return {schema_version:'1.0',ok:true,operation,...(requestId?{request_id:requestId}:{}),data};}
const help=`molla — family agent CLI (local integration release)

node bin/molla.mjs capabilities
node bin/molla.mjs serve [--app-dir ../molla-app] [--port 4328]
node bin/molla.mjs demo login --actor mom --session .local/mom.json
node bin/molla.mjs task create --text "쌀 10kg 주문해줘" --session .local/mom.json
node bin/molla.mjs task get --id TASK_ID --session .local/mom.json
node bin/molla.mjs route --input - --session .local/mom.json

Global options: --base-url http://127.0.0.1:4328 --session FILE --timeout-ms 10000
CLI command words match dotted operations: memory.search => memory search.
capabilities returns the complete argument allowlist. All operational output is one JSON line.
Exit codes: 0 success, 2 usage, 3 session required, 4 forbidden/owner decision, 5 API/network.
The demo login is not production authentication. Real VM provisioning and automatic sending are not implemented.
`;
let operation='unknown',requestId;
try{
 const {words,flags}=parse(process.argv.slice(2));
 if(flags.version){process.stdout.write('0.1.0\n');process.exit(0);}
 if(flags.help||!words.length){process.stdout.write(help);process.exit(0);}
 operation=words.join('.');
 if(operation==='capabilities'){
  if(Object.keys(flags).length)throw new CliError('capabilities takes no options');output(envelope(operation,capabilities()));
 }else if(operation==='serve'){
  for(const f of Object.keys(flags))if(!['app-dir','port','db'].includes(f))throw new CliError(`Unknown serve option: ${f}`);
  const appDir=resolve(flags['app-dir']||resolve(packageDir,'../molla-app'));
  const port=Number(flags.port||4328);if(!Number.isInteger(port)||port<1024||port>65535)throw new CliError('port must be 1024..65535');
  const db=resolve(flags.db||resolve(packageDir,'.local/server/molla.sqlite'));await mkdir(dirname(db),{recursive:true});
  await readFile(resolve(appDir,'server/index.mjs'));
  process.stderr.write(`Starting an isolated Molla API at http://127.0.0.1:${port}\n`);
  const child=spawn(process.execPath,['--env-file-if-exists=.env','server/index.mjs'],{cwd:appDir,env:{...process.env,PORT:String(port),MOLLA_DB:db},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let announced=false,startup='';
  child.stdout.on('data',chunk=>{process.stderr.write(chunk);startup+=chunk;if(!announced&&startup.includes(`http://127.0.0.1:${port}`)){announced=true;output(envelope('serve',{base_url:`http://127.0.0.1:${port}`,db_file:db,mode:'local-demo'}));}});
  child.stderr.pipe(process.stderr);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;if(code&&!announced)output({schema_version:'1.0',ok:false,operation:'serve',error:{code:'API_START_FAILED',message:'The isolated API did not start. See stderr.',retryable:false}});resolve();});});
 }else{
  const client=new Client({baseUrl:flags['base-url']||process.env.MOLLA_API_URL,session:flags.session||process.env.MOLLA_SESSION_FILE,timeoutMs:flags['timeout-ms']});
  if(operation==='demo.login'){
   for(const f of Object.keys(flags))if(!['actor','base-url','session','timeout-ms'].includes(f))throw new CliError(`Unknown login option: ${f}`);
   output(envelope(operation,await client.login(flags.actor)));
  }else{
   let args={};
   if(operation==='route'){
    for(const f of Object.keys(flags))if(!['input','base-url','session','timeout-ms'].includes(f))throw new CliError(`Unknown route option: ${f}`);
    if(typeof flags.input!=='string')throw new CliError('route requires --input FILE or --input -');
    let raw='';
    if(flags.input==='-'){
     process.stdin.setEncoding('utf8');
     let size=0;for await(const chunk of process.stdin){size+=Buffer.byteLength(chunk);if(size>16000)throw new CliError('Input exceeds 16000 bytes');raw+=chunk;}
    }else raw=await readFile(resolve(flags.input),'utf8').catch(()=>{throw new CliError('Cannot read input JSON');});
    if(Buffer.byteLength(raw)>16000)throw new CliError('Input exceeds 16000 bytes');
    let v;try{v=JSON.parse(raw);}catch{throw new CliError('Invalid input JSON');}
    if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['schema_version','operation','arguments','request_id'].includes(k))||v.schema_version!=='1.0'||typeof v.operation!=='string')throw new CliError('Expected {schema_version:"1.0", operation, arguments?, request_id?}');
    if(v.request_id!==undefined&&(typeof v.request_id!=='string'||!/^[-a-zA-Z0-9_.:]{1,128}$/.test(v.request_id)))throw new CliError('Invalid request_id');
    operation=v.operation;requestId=v.request_id;args=v.arguments??{};
   }else{
    for(const [name,value] of Object.entries(flags)){
     if(globalNames.has(name)){if(!['base-url','session','timeout-ms'].includes(name))throw new CliError(`Option --${name} is not valid for ${operation}`);continue;}
     args[camel(name)]=value;
    }
   }
   output(envelope(operation,await client.run(operation,args),requestId));
  }
 }
}catch(e){
 const c=e instanceof CliError||e?.code==='USAGE'?e:Object.assign(new Error('Command failed. Check the local API and supplied paths.'),{code:'INTERNAL',exitCode:5});
 output({schema_version:'1.0',ok:false,operation,...(requestId?{request_id:requestId}:{}),error:{code:c.code||'USAGE',message:c.message,retryable:c.retryable??false,...(c.http_status?{http_status:c.http_status}:{}),...(c.outcome?{outcome:c.outcome}:{})}});process.exitCode=c.exitCode||2;
}
