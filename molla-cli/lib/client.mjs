import { readFile, mkdir, writeFile, chmod, lstat, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { requireOwnerProof, ownerSubject, mintOwnerToken, defaultIo } from './owner.mjs';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store } from './store.mjs';
import { CliError, asCliError } from './errors.mjs';
import { validate } from './operations.mjs';
import { execute } from './execute.mjs';
import { member, own, id, log, DomainError } from '../runtime/core.mjs';
import { planTask, planAppTask, decide, consent, snapshot, tick } from '../runtime/domain.mjs';
import { LocalMemoryStore } from '../runtime/memory.mjs';
import { addContact, graphFor } from '../runtime/ontology.mjs';
import { fingerprint } from '../runtime/policy.mjs';
import { phoneBinding, adbPath } from '../runtime/phone.mjs';
export { CliError } from './errors.mjs';
export const actionHash=fingerprint;
const digest=v=>createHash('sha256').update(v).digest('hex');
// Never follow a planted symlink or overwrite a non-session file: write a private temp file, then rename.
async function writeSessionFile(path,content){
 const existing=await lstat(path).catch(()=>null);
 if(existing&&!existing.isFile())throw new CliError('Session path exists and is not a regular file. Choose another --session path.','USAGE',2);
 const tmp=`${path}.${randomBytes(6).toString('hex')}.tmp`;
 try{await writeFile(tmp,content,{mode:0o600,flag:'wx'});await chmod(tmp,0o600);await rename(tmp,path);}
 catch(e){await rm(tmp,{force:true});throw e;}
}
export class Client {
 constructor({db=process.env.MOLLA_CLI_DB||'.local/molla.sqlite',session=process.env.MOLLA_SESSION_FILE||'.local/session.json',env=process.env,io=defaultIo()}={}){this.dbPath=resolve(db);this.sessionPath=resolve(session);this.env=env;this.io=io;this.store=null;}
 open(){return this.store??=new Store(this.dbPath);}
 close(){this.store?.close();this.store=null;}
 async actor(){
  const store=this.open();let data;try{data=JSON.parse(await readFile(this.sessionPath,'utf8'));}catch{throw new CliError('Run demo login --actor <id> using this --db and --session file.','AUTH_REQUIRED',3);}
  if(data.version!==2||data.runtime_id!==store.runtimeId||data.db!==this.dbPath||!/^[-a-f0-9]{64}$/.test(data.token||''))throw new CliError('Session does not match this CLI database. Log in again.','AUTH_REQUIRED',3);
  const s=store.db.prepare('SELECT actor,expires_at FROM cli_sessions WHERE token_hash=?').get(digest(data.token));
  if(!s||s.expires_at<=Date.now())throw new CliError('Session is invalid or expired. Log in again.','AUTH_REQUIRED',3);member(store.read(),s.actor);return s.actor;
 }
 async login(actor){
  if(typeof actor!=='string'||!actor.trim()||actor.length>100)throw new CliError('demo login requires --actor');
  const store=this.open();member(store.read(),actor);const token=randomBytes(32).toString('hex');
  store.db.prepare('INSERT INTO cli_sessions VALUES(?,?,?)').run(digest(token),actor,Date.now()+86400000);
  await mkdir(dirname(this.sessionPath),{recursive:true,mode:0o700});
  await writeSessionFile(this.sessionPath,JSON.stringify({version:2,db:this.dbPath,runtime_id:store.runtimeId,token})+'\n');
  return {identity:store.read().members.find(m=>m.id===actor),mode:'local-cli-demo',session_file:this.sessionPath,warning:'Local demo profiles are not production authentication.'};
 }
 // For the owner's own app (holds MOLLA_OWNER_KEY): mint a token for one exact decision.
 async ownerToken(operation,input={}){
  try{
   const args=validate(operation,{...input,...(operation==='task.decide'?{decision:'approve'}:{})});const actor=await this.actor();
   if(operation==='task.decide'){const t=this.ownTask(actor,args.id);args.expectedActionHash=actionHash(t);}
   const subject=ownerSubject(operation,args);if(!subject)throw new CliError('This operation does not need an owner token.');
   return {operation,owner:actor,subject,owner_token:mintOwnerToken(this.env,{actor,operation,subject}),expires_in_seconds:300};
  }catch(e){throw asCliError(e);}
 }
 ownTask(actor,taskId){const t=this.open().read().tasks.find(t=>t.id===taskId);if(!t)throw new DomainError('작업을 찾을 수 없어요.',404);own(actor,t.owner);return t;}
 async run(operation,input={}){
  try{
   const args=validate(operation,input),store=this.open();
   if(operation==='health')return {ok:true,mode:'local-cli',transport:'direct-process',http_server_required:false,browser_required:false,production_auth:false};
   const actor=await this.actor();
   if(ownerSubject(operation,args)){
    // Decisions a router must not make alone: prove the owner decided before touching state.
    let summary=`${operation} ${JSON.stringify(Object.fromEntries(Object.entries(args).filter(([k])=>k!=='ownerToken')))}`;
    if(operation==='task.decide'){
     const t=this.ownTask(actor,args.id);
     if(!/^([a-f0-9]{64})$/.test(args.expectedActionHash||'')||actionHash(t)!==args.expectedActionHash)throw new CliError('Reviewed action changed. Ask the owner to review it again.','APPROVAL_CHANGED',4);
     summary=[`요청: ${t.title||t.text}`,`내용: ${t.action?.body??''}`,t.action?.recipient?`받는 사람: ${t.action.recipient.name??''} ${t.action.recipient.phone??''}`:null,t.action?.device?`기기: ${t.action.device.serial}`:null].filter(Boolean).join('\n');
    }
    await requireOwnerProof({operation,args,actor,summary,env:this.env,io:this.io});
   }
   if(operation==='vm.diagnose'){
    const state=store.read();if(member(state,actor).consent!=='active')throw new DomainError('소유자의 동의가 필요해요.',403);
    const binding=phoneBinding(actor,this.env);if(!binding)throw new DomainError('이 소유자에게 연결된 Android VM이 없어요.',409);
    const {stdout}=await promisify(execFile)(adbPath(this.env),['-s',binding.serial,'get-state'],{timeout:15000,maxBuffer:64000,windowsHide:true});
    return {connected:stdout.trim()==='device',state:stdout.trim(),owner:actor,readOnly:true};
   }
   if(operation==='task.execute')return await execute(store,actor,args.id,{env:this.env});
   return store.transaction(s=>{
    tick(s);const memories=new LocalMemoryStore(s),me=member(s,actor);
    const task=()=>{const t=s.tasks.find(t=>t.id===args.id);if(!t)throw new DomainError('작업을 찾을 수 없어요.',404);own(actor,t.owner);return t;};
    switch(operation){
     case 'identity.get':return {identity:me,mode:'local-cli-demo'};
     case 'family.list':return {members:snapshot(s,actor).members};
     case 'family.invite':{const inv={id:id(),code:randomBytes(4).toString('hex').toUpperCase(),name:args.name,createdBy:actor,expiresAt:new Date(Date.now()+86400000).toISOString(),used:false};s.invites.push(inv);return inv;}
     case 'family.join':{const inv=s.invites.find(i=>i.code===args.code.toUpperCase()&&!i.used&&Date.parse(i.expiresAt)>Date.now());if(!inv)throw new DomainError('올바른 초대 코드를 확인해 주세요.');const m={id:id(),name:inv.name,initial:inv.name.slice(0,1),color:'peach',consent:'pending',agentName:'몰라',role:'owner',subtitle:'가족이 준비한 작은 친구',vm:id(),scopes:['shopping','calendar','message'],policyVersion:1};s.members.push(m);const f=s.families.find(f=>f.members.includes(inv.createdBy));if(!f)throw new DomainError('가족을 찾을 수 없어요.',404);f.members.push(m.id);inv.used=true;return {member_id:m.id,name:m.name,consent:m.consent,next:'Use demo login explicitly for this new profile; caller identity did not change.'};}
     case 'task.create':return planTask(s,actor,args);
     case 'task.list':return {tasks:s.tasks.filter(t=>t.owner===actor&&(!args.status||t.status===args.status))};
     case 'task.get':{const t=task();return {...t,approval_hash:actionHash(t)};}
     case 'task.decide':{const t=task();if(args.decision==='approve'){if(args.ownerConfirmed!==true||!/^([a-f0-9]{64})$/.test(args.expectedActionHash||''))throw new CliError('Owner decision and expected-action-hash are required.','OWNER_CONFIRMATION_REQUIRED',4);if(actionHash(t)!==args.expectedActionHash)throw new CliError('Reviewed action changed. Ask the owner to review it again.','APPROVAL_CHANGED',4);}return {...decide(s,actor,t.id,args.decision),next:args.decision==='approve'?'task.execute':null};}
     case 'task.recover':{const t=task();if(t.status!=='running'||!t.executionStartedAt||Date.parse(t.executionLeaseUntil)>Date.now())throw new DomainError('아직 복구할 수 없어요. 실행 종료나 만료를 확인해 주세요.',409);t.status='needs_verification';t.result='중단된 실행의 결과를 직접 확인해 주세요. 자동 재실행하지 않아요.';return t;}
     case 'memory.list':case 'memory.search':return {memories:memories.recall(actor,{query:args.query||''})};
     case 'memory.remember':return memories.remember(actor,args);
     case 'memory.correct':return memories.correct(actor,args.id,args.text);
     case 'memory.forget':memories.forget(actor,args.id);return {ok:true};
     case 'memory.shared':return {memories:memories.recallShared(actor)};
     case 'memory.share':memories.share(actor,args.id,args.grantee);return {ok:true};
     case 'memory.revoke':memories.revokeShare(actor,args.id,args.grantee);return {ok:true};
     case 'contact.list':return {contacts:s.contacts.filter(c=>c.owner===actor)};
     case 'contact.add':return addContact(s,actor,args);
     case 'contact.remove':{const c=s.contacts.find(c=>c.id===args.id);if(!c)throw new DomainError('연락처를 찾을 수 없어요.',404);own(actor,c.owner);s.contacts=s.contacts.filter(c=>c.id!==args.id);return {ok:true};}
     case 'ontology.get':return graphFor(s,actor);
     case 'consent.set':{if(args.ownerConfirmed!==true)throw new CliError('Owner decision is required.','OWNER_CONFIRMATION_REQUIRED',4);consent(s,actor,args.value);return {consent:member(s,actor).consent};}
     case 'permission.set':{if(args.ownerConfirmed!==true)throw new CliError('Owner decision is required.','OWNER_CONFIRMATION_REQUIRED',4);const scopes=[...new Set(args.scopes.split(',').map(v=>v.trim()))];if(scopes.some(v=>!['shopping','calendar','message','phone'].includes(v)))throw new CliError('Unknown scope');me.scopes=scopes;me.policyVersion++;for(const t of s.tasks)if(t.owner===actor&&['running','awaiting_approval'].includes(t.status))t.status='cancelled';log(s,actor,'도움 범위를 바꿨어요');return {scopes};}
     case 'vm.compose.plan':{const device=phoneBinding(actor,this.env);if(!device||this.env.MOLLA_ALLOW_ANDROID_COMPOSE!=='1')throw new DomainError('소유자별 기기 연결과 문자 작성 허용 설정이 필요해요.',409);return planTask(s,actor,{text:'문자 작성 화면 열기',draft:args.draft,contactId:args.contactId,execution:'android-compose',device});}
     case 'vm.app.plan':{const device=phoneBinding(actor,this.env);if(!device||this.env.MOLLA_ALLOW_ANDROID_APPS!=='1')throw new DomainError('소유자별 기기 연결과 앱 실행 허용 설정이 필요해요.',409);return planAppTask(s,actor,{text:args.appId+' 앱 열기',appId:args.appId,device});}
     default:throw new CliError('Unknown operation');
    }
   });
  }catch(e){throw asCliError(e);}
 }
}
