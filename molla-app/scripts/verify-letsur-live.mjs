// Explicit external check. Synthetic family data, real Letsur; optional real owner-bound VM.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { apiRequest } from '../apps/mobile/src/services/runtime.ts';
import { accessHash } from '../server/auth.mjs';
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
let auth,started=false,vmVerified=false,browser,page,watchdog,startTime,stopPromise;const report={passed:false,provider:'letsur',model:process.env.LETSUR_MODEL,checkedAt:new Date().toISOString(),android,checks:[],responses:[]};
async function account(){
 const code="import json; import workers.cloud_manager; from phone_harness import cloud; m=cloud._api('GET','/me',timeout=12); s=cloud._api('GET','/sessions',timeout=12); print(json.dumps({'balanceCents':m.get('balance_cents'),'rateCentsPerMinute':m.get('price_cents_per_minute'),'activeSessions':sum(x.get('state') in ['ready','provisioning','closing'] for x in s)}))";
 const {stdout}=await promisify(execFile)(process.env.MOLLA_PYTHON||'python',['-c',code],{cwd:root,timeout:35000,maxBuffer:100000,windowsHide:true});return JSON.parse(stdout);
}
async function stopVM(){
 if(stopPromise)return stopPromise;
 stopPromise=(async()=>{report.stopRequestedAt=new Date().toISOString();console.log(JSON.stringify({step:'vm_stop_requested'}));let phone=await apiRequest(auth,'/phone/stop',{}, {timeoutMs:65000});const deadline=Date.now()+45000;while(phone.state==='closing'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,2000));phone=await apiRequest(auth,'/phone/diagnose',{}, {timeoutMs:65000});}report.stopped=phone.state==='stopped'||phone.state==='expired';report.finalVmState=phone.state;report.stoppedAt=new Date().toISOString();return phone;})();return stopPromise;
}
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
  // All browser setup and account checks happen before the metered session starts.
  report.accountBefore=await account();assert.equal(report.accountBefore.rateCentsPerMinute,5);assert.ok(report.accountBefore.balanceCents>=15);assert.equal(report.accountBefore.activeSessions,0);
  const existing=await callCloud({operation:'recover',phoneId:mappings.mom.phoneId});assert.equal(existing.state,'stopped');
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  page=await browser.newPage({viewport:{width:430,height:1080},reducedMotion:'reduce'});page.setDefaultTimeout(12000);
  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});await page.getByTestId('server-url').fill(baseUrl);await page.getByTestId('connection-token').fill(tokens.mom);await page.getByTestId('connect-account').click();await expect(page.getByTestId('message-input')).toBeVisible();
  await apiRequest(auth,'/preferences',{agentName:'몰라',scopes:['message','shopping','calendar','phone']});
  const quote=await apiRequest(auth,'/phone/quote',{durationMinutes:3});assert.equal(quote.estimatedMaxUsd,0.15);
  report.quote={durationMinutes:3,estimatedMaxUsd:0.15};started=true;startTime=Date.now();report.startRequestedAt=new Date().toISOString();
  watchdog=setTimeout(()=>{report.watchdogTriggered=true;void stopVM().catch(()=>{});},150000);
  let phone=await apiRequest(auth,'/phone/start',{quoteId:quote.quoteId},{timeoutMs:65000});console.log(JSON.stringify({step:'vm_start',state:phone.state}));
  const deadline=startTime+90000;
  while(phone.state!=='ready'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,2000));phone=await apiRequest(auth,'/phone/diagnose',{}, {timeoutMs:65000});console.log(JSON.stringify({step:'vm_poll',state:phone.state}));if(['error','stopped','expired'].includes(phone.state))throw new Error('VM did not become ready');}
  assert.equal(phone.state,'ready');assert.ok(Date.parse(phone.expiresAt)<=startTime+190000);report.providerExpiresAt=phone.expiresAt;report.checks.push('Saved Android profile started with 180-second provider timeout; authenticated ADB connected');
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
  assert.ok(Date.now()-startTime<140000,'Stop before exceeding the verification time budget');
  await page.getByTestId('nav-profile').click();await page.getByRole('button',{name:'연결 상태 새로고침'}).click();
  const frameResponsePromise=page.waitForResponse(r=>r.url().endsWith('/api/phone/screen')&&r.request().method()==='GET',{timeout:20000});
  await expect(page.getByTestId('open-phone-screen')).toBeEnabled();await page.getByTestId('open-phone-screen').click();
  const frameResponse=await frameResponsePromise;assert.equal(frameResponse.status(),200);assert.equal(frameResponse.headers()['cache-control'],'no-store');const frame=await frameResponse.json();
  assert.ok(frame.dataUrl.startsWith('data:image/png;base64,'));assert.ok(frame.width>100&&frame.height>100);
  await expect(page.getByTestId('phone-live-image')).toBeVisible();await expect(page.getByTestId('phone-captured-at')).toBeVisible();
  await expect.poll(()=>page.getByTestId('phone-live-image').evaluate(el=>{const img=el.matches('img')?el:el.querySelector('img');return !!img?.complete&&img.naturalWidth>0;}),{timeout:5000}).toBe(true);
  const png=Buffer.from(frame.dataUrl.split(',')[1],'base64');await mkdir(resolve(root,'docs/live/screenshots'),{recursive:true});await writeFile(resolve(root,'docs/live/screenshots/mom-android-settings.png'),png);
  await page.screenshot({path:resolve(root,'docs/live/screenshots/mom-android-live-viewer.png')});
  await page.getByRole('button',{name:'Android 화면 닫기'}).click();
  await assert.rejects(apiRequest(other,'/phone/screen'),e=>e.status===403);
  report.androidEvidence={kind:task.evidence.kind,package:task.evidence.package,verified:true,screenshot:'docs/live/screenshots/mom-android-settings.png',viewerScreenshot:'docs/live/screenshots/mom-android-live-viewer.png',width:frame.width,height:frame.height,capturedAt:frame.capturedAt,sha256:createHash('sha256').update(png).digest('hex'),actualViewerRendered:true};
  report.checks.push('Actual screen endpoint → React Native Web image decoded and displayed; other owner denied');
  report.checks.push('Model planned settings app → exact owner approval → ADB launch → foreground package verification');vmVerified=true;
 }else{
  const draft=await apiRequest(auth,'/chat',{text:'내일 병원에 다녀온다고 가족에게 보낼 문자 초안을 작성해줘.',requestId:randomUUID()},{timeoutMs:45000});assert.equal(draft.task?.status,'awaiting_approval');assert.equal(draft.task.action.execution,'local');report.responses.push({body:draft.task.action.body,usage:draft.usage,estimatedCost:draft.estimatedCost});report.checks.push('Actual model-created message draft awaits owner approval; no sending');
 }
 report.passed=true;
}catch(e){report.error={name:e.name,message:e.status?e.message:'Verification did not complete.',status:e.status??null};console.log(JSON.stringify({step:'verification_failed',...report.error}));process.exitCode=1;}
finally{
 if(started&&auth){try{await stopVM();if(!report.stopped){report.passed=false;process.exitCode=1;}}catch{report.stopped=false;report.passed=false;process.exitCode=1;console.log('VM stop needs confirmation; session has a 3-minute provider deadline.');}}
 clearTimeout(watchdog);if(browser)await browser.close();
 if(android&&report.accountBefore){try{report.accountAfter=await account();report.vmCreditUsedUsd=(report.accountBefore.balanceCents-report.accountAfter.balanceCents)/100;if(report.vmCreditUsedUsd>0.15||report.accountAfter.activeSessions!==0){report.passed=false;process.exitCode=1;}}catch{report.billingRecheckRequired=true;report.passed=false;process.exitCode=1;}}
 await mkdir(resolve(root,'docs/live'),{recursive:true});const file=resolve(root,'docs/live',android?'letsur-android-live-report.json':'letsur-model-smoke-report.json');await writeFile(file,JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,android,vmVerified,stopped:report.stopped,report:file}));
 child.kill();if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);setTimeout(r,3000);});
 if(dirname(resolve(dir))===resolve(tmpdir())&&basename(dir).startsWith('molla-letsur-check-'))await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
