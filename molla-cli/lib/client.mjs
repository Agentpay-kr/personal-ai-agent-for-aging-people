import { readFile, mkdir, writeFile, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { operations, validate, readOnly } from './operations.mjs';
export class CliError extends Error {constructor(message,code='USAGE',exitCode=2,extra={}){super(message);Object.assign(this,{code,exitCode,...extra});}}
export function endpoint(value){
 let u;try{u=new URL(value);}catch{throw new CliError('Invalid --base-url');}
 if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new CliError('This release connects only to a local HTTP API (127.0.0.1 or localhost). Remote production auth is not implemented.');
 return u.origin;
}
export function actionHash(t){return createHash('sha256').update(JSON.stringify([t.owner,t.requester,t.kind,t.text,t.action])).digest('hex');}
export class Client {
 constructor({baseUrl='http://127.0.0.1:4328',session='.local/session.json',timeoutMs=10000}={}){
  this.baseUrl=endpoint(baseUrl);this.sessionPath=resolve(session);this.timeoutMs=Number(timeoutMs);this.cookie=null;
  if(!Number.isInteger(this.timeoutMs)||this.timeoutMs<100||this.timeoutMs>60000)throw new CliError('timeout-ms must be 100..60000');
 }
 async loadSession(){
  let s;try{s=JSON.parse(await readFile(this.sessionPath,'utf8'));}catch{throw new CliError('No valid session. Run demo login --actor <id> with this --session file.', 'AUTH_REQUIRED',3);}
  if(s.version!==1||s.baseUrl!==this.baseUrl||!/^molla_session=[a-f0-9]{48}$/.test(s.cookie||''))throw new CliError('Session does not match this API endpoint. Run demo login again.','AUTH_REQUIRED',3);
  this.cookie=s.cookie;
 }
 async persist(){
  await mkdir(dirname(this.sessionPath),{recursive:true,mode:0o700});
  await writeFile(this.sessionPath,JSON.stringify({version:1,baseUrl:this.baseUrl,cookie:this.cookie})+'\n',{mode:0o600});await chmod(this.sessionPath,0o600);
 }
 async request(path,{body,anonymous=false,mutating=false}={}){
  if(!this.cookie&&!anonymous)await this.loadSession();
  let response;
  try{response=await fetch(`${this.baseUrl}/api/${path}`,{method:body===undefined?'GET':'POST',headers:{...(this.cookie?{Cookie:this.cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(this.timeoutMs)});}
  catch{throw new CliError(mutating?'Request outcome is unknown. Inspect current state before retrying this mutation.':'Local API is unavailable or timed out. Start molla serve or check --base-url.','NETWORK',5,{retryable:!mutating,outcome:mutating?'unknown':'unavailable'});}
  const setCookie=response.headers.get('set-cookie')?.match(/(?:^|,\s*)(molla_session=[a-f0-9]{48})(?:;|$)/)?.[1];
  // An established session replaced by the server means the server lost its identity mapping.
  // Do not continue under the server's default demo identity.
  if(setCookie&&this.cookie&&setCookie!==this.cookie)throw new CliError('Server rejected this session. Run demo login again; do not replay the operation.','AUTH_REQUIRED',3,{outcome:mutating?'unknown':'unavailable',retryable:false});
  if(setCookie)this.cookie=setCookie;
  let data;try{data=await response.json();}catch{throw new CliError('API returned invalid JSON.','PROTOCOL',5,{retryable:false});}
  if(!response.ok)throw new CliError(data.error||`HTTP ${response.status}`,response.status===403?'FORBIDDEN':'API_ERROR',response.status===403?4:5,{http_status:response.status,retryable:!mutating&&response.status>=500});
  return data;
 }
 async login(actor){
  if(typeof actor!=='string'||!actor.trim()||actor.length>100)throw new CliError('demo login requires --actor');
  this.cookie=null;await this.request('health',{anonymous:true});
  if(!this.cookie)throw new CliError('API did not establish a local session.','PROTOCOL',5);
  await this.request('demo/switch',{body:{actor},mutating:true});await this.persist();
  const s=await this.request('state');return {identity:s.me,mode:s.mode,session_file:this.sessionPath,warning:'Demo identity switching is not production authentication.'};
 }
 async run(operation,input={}){
  const args=validate(operation,input),spec=operations[operation];
  if(operation==='consent.set'&&args.ownerConfirmed!==true)throw new CliError('Consent changes require the owner’s explicit decision.','OWNER_CONFIRMATION_REQUIRED',4);
  if(operation==='task.decide'&&args.decision==='approve'){
   if(args.ownerConfirmed!==true||!/^([a-f0-9]{64})$/.test(args.expectedActionHash||''))throw new CliError('Approval requires --owner-confirmed and the --expected-action-hash from task get.','OWNER_CONFIRMATION_REQUIRED',4);
   const current=await this.run('task.get',{id:args.id});
   if(current.approval_hash!==args.expectedActionHash)throw new CliError('Task changed since it was reviewed. Show the new task to its owner.','APPROVAL_CHANGED',4);
  }
  const payload={...args};delete payload.ownerConfirmed;delete payload.expectedActionHash;
  // Detect an expired demo session before sending any modifying request.
  if(!readOnly.has(operation))await this.request('state');
  const state=await this.request(spec.path,{body:spec.method==='POST'?payload:undefined,anonymous:spec.session===false,mutating:!readOnly.has(operation)});
  if(!spec.select)return state;
  if(spec.select==='identity')return {identity:state.me,mode:state.mode};
  if(spec.select==='task'){
   const task=state.tasks.find(t=>t.id===args.id);if(!task)throw new CliError('Task not found in the current owner’s space.','NOT_FOUND',5,{http_status:404});
   return {...task,approval_hash:actionHash(task)};
  }
  if(spec.select==='tasks')return {tasks:state.tasks.filter(t=>!args.status||t.status===args.status)};
  return {[spec.select]:state[spec.select]||[]};
 }
}
