// Explicit external check. Synthetic family data, real Letsur; optional real owner-bound VM.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { apiRequest } from '../apps/mobile/src/services/runtime.ts';
import { accessHash } from '../server/auth.mjs';
import { adbPath } from '../server/phone.mjs';
import { cloudMappings, callCloud } from '../server/cloud-vm.mjs';
const root=resolve(import.meta.dirname,'..'),android=process.argv.includes('--android');
if(!process.env.LETSUR_API_KEY)throw new Error('Load the private .env first.');
if(android&&process.env.MOLLA_CONFIRM_VM_MAX_USD!=='0.15')throw new Error('This optional test needs explicit approval for one 3-minute VM session, estimated maximum $0.15.');
const mappings=android?cloudMappings():{};if(android&&!mappings.mom)throw new Error('Bind mom to her saved Android first.');
const dir=await mkdtemp(resolve(tmpdir(),'molla-letsur-check-')),authFile=resolve(dir,'auth.json');
const tokens=Object.fromEntries(['mom','dad','son'].map(actor=>[actor,randomBytes(32).toString('base64url')]));
await writeFile(authFile,JSON.stringify({owners:Object.entries(tokens).map(([actor,token])=>({actor,hash:accessHash(token)}))}),{mode:0o600});
const environment={...process.env,PORT:'0',MOLLA_HOST:'127.0.0.1',MOLLA_LIVE_MODE:'1',MOLLA_LLM_ENABLED:'1',MOLLA_LLM_PROVIDER:'letsur',MOLLA_DB:resolve(dir,'state.sqlite'),MOLLA_OWNER_AUTH_FILE:authFile,MOLLA_CLOUD_BINDINGS:JSON.stringify(mappings),MOLLA_PHONE_BINDINGS:'{}',MOLLA_PHONE_OWNER:'',MOLLA_PHONE_SERIAL:'',MOLLA_ALLOW_ANDROID_APPS:android?'1':'0',MOLLA_ALLOW_ANDROID_COMPOSE:'0'};
const child=spawn(process.execPath,[resolve(root,'server/index.mjs')],{cwd:root,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stderr.resume();
let auth,started=false,vmVerified=false;const report={passed:false,provider:'letsur',model:process.env.LETSUR_MODEL,checkedAt:new Date().toISOString(),android,checks:[],responses:[]};
try{
 const baseUrl=await new Promise((done,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server start timed out')),15000);child.once('exit',()=>{clearTimeout(timeout);reject(new Error('Server exited'));});child.stdout.on('data',b=>{const match=b.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);done(match[0]);}});});
 auth={baseUrl,token:tokens.mom};const other={baseUrl,token:tokens.son};
 const runtime=await apiRequest(auth,'/runtime');assert.equal(runtime.llm.provider,'letsur');assert.equal(runtime.llm.configured,true);
 await assert.rejects(apiRequest(auth,'/chat',{text:'동의 전 확인',requestId:randomUUID()}),e=>e.status===403);
 assert.equal((await apiRequest(auth,'/state')).me.consent,'pending');
 await apiRequest(auth,'/consent',{value:'active'});
 await apiRequest(auth,'/ai/consent',{enabled:true,includeMemories:false});
 const request={text:android?'설정 앱을 열어줘':'오늘 하루를 시작하는 따뜻한 인사 한 문장 해줘.',requestId:randomUUID()};
 if(android){
  await apiRequest(auth,'/preferences',{agentName:'몰라',scopes:['message','shopping','calendar','phone']});
  const quote=await apiRequest(auth,'/phone/quote',{durationMinutes:3});assert.equal(quote.estimatedMaxUsd,0.15);
  report.quote={durationMinutes:3,estimatedMaxUsd:0.15};started=true;
  let phone=await apiRequest(auth,'/phone/start',{quoteId:quote.quoteId},{timeoutMs:65000});console.log(JSON.stringify({step:'vm_start',state:phone.state}));
  const deadline=Date.now()+115000;
  while(phone.state!=='ready'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,2000));phone=await apiRequest(auth,'/phone/diagnose',{}, {timeoutMs:65000});console.log(JSON.stringify({step:'vm_poll',state:phone.state}));if(['error','stopped','expired'].includes(phone.state))throw new Error('VM did not become ready');}
  assert.equal(phone.state,'ready');report.checks.push('Saved Android profile started; authenticated ADB connected');
 }
 const reply=await apiRequest(auth,'/chat',request,{timeoutMs:45000});assert.equal(reply.provider,'letsur');assert.ok(reply.usage.inputTokens>0);assert.ok(reply.usage.outputTokens>0);
 report.responses.push({reply:reply.reply,usage:reply.usage,estimatedCost:reply.estimatedCost,action:reply.task?.action?.type});
 assert.deepEqual(await apiRequest(auth,'/chat',request),reply);assert.equal((await apiRequest(other,'/state')).messages.length,0);
 report.checks.push('Mobile HTTP client → actual authenticated Node API → actual Letsur model','No implicit consent; memory sharing remains off','Identical requestId is not billed or generated twice','Other family member cannot read this conversation');
 if(android){
  assert.equal(reply.task?.action.type,'app.open');assert.equal(reply.task.action.appId,'settings');assert.equal(reply.task.status,'awaiting_approval');
  await assert.rejects(apiRequest(other,'/task/decision',{id:reply.task.id,decision:'approve'}),e=>e.status===403);
  await apiRequest(auth,'/task/decision',{id:reply.task.id,decision:'approve'});let task;
  const deadline=Date.now()+35000;do{await new Promise(r=>setTimeout(r,1000));task=(await apiRequest(auth,'/state')).tasks.find(t=>t.id===reply.task.id);}while(task.status==='running'&&Date.now()<deadline);
  assert.equal(task.status,'completed');assert.equal(task.evidence.package,'com.android.settings');assert.equal(task.evidence.verified,true);
  const {stdout}=await promisify(execFile)(adbPath(),['-s',task.evidence.device,'exec-out','screencap','-p'],{encoding:'buffer',maxBuffer:5000000,timeout:15000,windowsHide:true});
  await mkdir(resolve(root,'docs/live/screenshots'),{recursive:true});await writeFile(resolve(root,'docs/live/screenshots/mom-android-settings.png'),stdout);
  report.androidEvidence={kind:task.evidence.kind,package:task.evidence.package,verified:true,screenshot:'docs/live/screenshots/mom-android-settings.png'};
  report.checks.push('Model planned settings app → exact owner approval → ADB launch → foreground package verification');vmVerified=true;
 }else{
  const draft=await apiRequest(auth,'/chat',{text:'내일 병원에 다녀온다고 가족에게 보낼 문자 초안을 작성해줘.',requestId:randomUUID()},{timeoutMs:45000});assert.equal(draft.task?.status,'awaiting_approval');assert.equal(draft.task.action.execution,'local');report.responses.push({body:draft.task.action.body,usage:draft.usage,estimatedCost:draft.estimatedCost});report.checks.push('Actual model-created message draft awaits owner approval; no sending');
 }
 report.passed=true;
}catch(e){report.error={name:e.name,message:e.status?e.message:'Verification did not complete.',status:e.status??null};console.log(JSON.stringify({step:'verification_failed',...report.error}));process.exitCode=1;}
finally{
 if(started&&auth){try{let phone=await apiRequest(auth,'/phone/stop',{}, {timeoutMs:65000});const deadline=Date.now()+45000;while(phone.state==='closing'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,2000));phone=await apiRequest(auth,'/phone/diagnose',{}, {timeoutMs:65000});}report.stopped=phone.state==='stopped'||phone.state==='expired';report.finalVmState=phone.state;if(!report.stopped){report.passed=false;process.exitCode=1;}}catch{report.stopped=false;report.passed=false;process.exitCode=1;console.log('VM stop needs confirmation; session has a 3-minute provider deadline.');}}
 await mkdir(resolve(root,'docs/live'),{recursive:true});const file=resolve(root,'docs/live',android?'letsur-android-live-report.json':'letsur-model-smoke-report.json');await writeFile(file,JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,android,vmVerified,stopped:report.stopped,report:file}));
 child.kill();if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);setTimeout(r,3000);});
 if(dirname(resolve(dir))===resolve(tmpdir())&&basename(dir).startsWith('molla-letsur-check-'))await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
