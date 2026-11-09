import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, decide, consent, planAppTask, planTask, initializeLiveConsent } from '../server/domain.mjs';
import { member } from '../server/core.mjs';
import { LocalMemoryStore } from '../server/memory.mjs';
import { addContact } from '../server/ontology.mjs';
import { LLMPlanner, cloudContext } from '../server/llm.mjs';
import { ChatService } from '../server/chat-service.mjs';
import { cloudMappings, CloudVMManager, runtimePhoneEnv } from '../server/cloud-vm.mjs';
import { phoneBinding, AndroidComposeExecutor } from '../server/phone.mjs';
import { executeTask } from '../server/orchestrator.mjs';

function storage(){let state=seed();for(const m of state.members){m.consent='active';m.cloudAI.enabled=true;m.scopes.push('phone');}return {load:()=>structuredClone(state),save:s=>{state=structuredClone(s);}};}
const result=(intent='conversation',extra={})=>({plan:{intent,reply:'안녕하세요.',draft:null,recipient:null,app:null,...extra},model:'test/model',usage:{inputTokens:1,outputTokens:1}});
const cloudEnv={MOLLA_CLOUD_BINDINGS:JSON.stringify({mom:{phoneId:'profile-mom'},dad:{phoneId:'profile-dad'},son:{phoneId:'profile-son'}})};
const ready=(phoneId)=>({ok:true,phoneId,state:'ready',sessionId:'session-'+phoneId,serial:'vm-'+phoneId,expiresAt:Date.now()/1000+180});
test('Live initialization requires each owner to consent; no seeded private memories or automatic re-consent',()=>{
 const s=seed({live:true});assert.equal(s.memories.length,0);assert(s.members.every(m=>m.consent==='pending'&&!m.cloudAI.enabled));
 initializeLiveConsent(s);consent(s,'mom','active');initializeLiveConsent(s);assert.equal(member(s,'mom').consent,'active');assert.equal(member(s,'dad').consent,'pending');
 const old=seed();new LocalMemoryStore(old).remember('mom',{text:'기존 사용자 기억'});initializeLiveConsent(old);assert(old.memories.some(m=>m.text==='기존 사용자 기억'));assert(old.members.every(m=>m.consent==='pending'));
});

test('LLM context includes only consenting owner data and strips phone numbers',()=>{
 const s=storage().load(),mem=new LocalMemoryStore(s);mem.remember('mom',{text:'엄마 전용'});mem.remember('dad',{text:'아빠 비밀'});addContact(s,'mom',{name:'민지',relation:'딸',phone:'01012345678'});
 s.messages.push({owner:'dad',role:'user',text:'아빠 대화'});const first=cloudContext(s,'mom','mom','안녕');assert.equal(first.memories.length,0);
 member(s,'mom').cloudAI.includeMemories=true;const own=JSON.stringify(cloudContext(s,'mom','mom','안녕'));assert(own.includes('엄마 전용'));assert(!own.includes('아빠 비밀'));assert(!own.includes('아빠 대화'));assert(!own.includes('01012345678'));
 const other=cloudContext(s,'mom','dad','안녕');assert.deepEqual(other.contacts,[]);assert.deepEqual(other.memories,[]);
 member(s,'mom').cloudAI.enabled=false;assert.throws(()=>cloudContext(s,'mom','mom','안녕'),{status:403});
});
test('LLM schema validates output and errors never expose provider secrets',async()=>{
 const env={MOLLA_LLM_ENABLED:'1',AI_GATEWAY_API_KEY:'test-only',MOLLA_MODEL:'test/model'};let options;
 const planner=new LLMPlanner({env,generate:async opts=>{options=opts;return {output:result().plan,usage:{inputTokens:4,outputTokens:5}};}});
 assert.equal((await planner.plan({request:'안녕'})).usage.inputTokens,4);assert.equal(options.maxRetries,0);assert(options.output);assert.equal(options.maxOutputTokens,1800);
 for(const generate of [async()=>({output:{intent:'shell',command:'rm -rf'}}),async()=>{throw Object.assign(new Error('SECRET_KEY prompt private'),{statusCode:401});}]){
  await assert.rejects(new LLMPlanner({env,generate}).plan({}),e=>e.status===502&&!e.message.includes('SECRET_KEY'));
 }
 await assert.rejects(new LLMPlanner({env:{},generate:()=>assert.fail()}).plan({}),{status:503});
});
test('Chat idempotency is owner-scoped and a pending request cannot be duplicated',async()=>{
 const store=storage();let calls=0,release;const wait=new Promise(r=>release=r);const chat=new ChatService({...store,env:{},planner:{plan:async()=>{calls++;await wait;return result();}}});
 const pending=chat.send('mom',{text:'안녕',requestId:'request-001'});
 await assert.rejects(chat.send('mom',{text:'안녕',requestId:'request-001'}),{status:409});
 release();const first=await pending;assert.equal(first.model,'test/model');await chat.send('mom',{text:'안녕',requestId:'request-001'});assert.equal(calls,1);
 await assert.rejects(chat.send('mom',{text:'다른 내용',requestId:'request-001'}),{status:409});
 await chat.send('son',{text:'안녕',requestId:'request-001'});assert.equal(calls,2);assert.equal(store.load().messages.length,4);
});
test('Chat rechecks revoked or corrected context after model response, preserving concurrent writes',async()=>{
 for(const change of [s=>{member(s,'mom').cloudAI.enabled=false;},s=>{new LocalMemoryStore(s).remember('mom',{text:'새 기억'});}]){
  const store=storage();const chat=new ChatService({...store,env:{},planner:{plan:async()=>{const s=store.load();change(s);new LocalMemoryStore(s).remember('dad',{text:'동시 저장'});store.save(s);return result('message',{draft:'내일 만나요'});}}});
  await assert.rejects(chat.send('mom',{text:'문자 작성',requestId:'request-002'}),{status:409});assert.equal(store.load().tasks.length,0);assert(store.load().memories.some(m=>m.text==='동시 저장'));
 }
});
test('AI draft requires owner approval; no grant can be produced by the model',async()=>{
 const store=storage();let s=store.load();addContact(s,'mom',{name:'민지',relation:'딸',phone:'01012345678'});store.save(s);
 const chat=new ChatService({...store,env:{},planner:{plan:async()=>result('message',{draft:'내일 병원에 가요.',recipient:'딸'})}});
 const response=await chat.send('mom',{text:'딸에게 병원에 간다고 알려줘',requestId:'request-003'});
 assert.equal(response.task.status,'awaiting_approval');assert.equal(response.task.action.body,'내일 병원에 가요.');assert.equal(response.task.action.execution,'local');assert(!response.task.approval);
 s=store.load();assert.throws(()=>decide(s,'son',response.task.id,'approve'),{status:403});
});
test('Daily request cap and owner cloud consent are enforced before calling model',async()=>{
 const store=storage();let calls=0;const chat=new ChatService({...store,env:{MOLLA_LLM_DAILY_REQUEST_LIMIT:'1'},planner:{plan:async()=>{calls++;return result();}}});
 await chat.send('mom',{text:'안녕',requestId:'request-004'});await assert.rejects(chat.send('mom',{text:'안녕',requestId:'request-005'}),{status:429});
 const s=store.load();member(s,'son').cloudAI.enabled=false;store.save(s);await assert.rejects(chat.send('son',{text:'안녕',requestId:'request-006'}),{status:403});assert.equal(calls,1);
});
test('VM binding rejects duplicate profiles and never falls back to expired or other family device',()=>{
 assert.throws(()=>cloudMappings({MOLLA_CLOUD_BINDINGS:'{"mom":{"phoneId":"same"},"dad":{"phoneId":"same"}}'}),{status:503});
 const s=storage().load();s.cloudSessions={mom:ready('profile-mom'),dad:ready('profile-dad')};for(const v of Object.values(s.cloudSessions))v.expiresAt=new Date(v.expiresAt*1000).toISOString();
 assert.equal(phoneBinding('mom',runtimePhoneEnv(s,cloudEnv)).serial,'vm-profile-mom');assert.equal(phoneBinding('son',runtimePhoneEnv(s,cloudEnv)),null);
 s.cloudSessions.mom.expiresAt='2000-01-01T00:00:00Z';assert.equal(phoneBinding('mom',runtimePhoneEnv(s,cloudEnv)),null);
});
test('VM quote is cost-free; owner, time cap, consent and one-time confirmation bind each start',async()=>{
 const store=storage();const calls=[];const cloud=new CloudVMManager({...store,env:cloudEnv,call:async x=>{calls.push(x);return ready(x.phoneId);}});
 assert.throws(()=>cloud.quote('mom',6),{status:400});const q=cloud.quote('mom',3);assert.equal(q.estimatedMaxUsd,0.15);assert.equal(calls.length,0);
 await assert.rejects(cloud.start('dad',q.quoteId),{status:409});assert.equal(calls.length,0);
 assert.equal((await cloud.start('mom',q.quoteId)).state,'ready');assert.equal(calls[0].phoneId,'profile-mom');assert.equal(calls[0].durationSeconds,180);
 await assert.rejects(cloud.start('mom',q.quoteId),{status:409});assert.equal(calls.length,1);
 const q2=cloud.quote('son',1),s=store.load();member(s,'son').policyVersion++;store.save(s);await assert.rejects(cloud.start('son',q2.quoteId),{status:409});
});
test('Revocation during VM start triggers stop for that same profile without overwriting changes',async()=>{
 const store=storage();const calls=[];const cloud=new CloudVMManager({...store,env:cloudEnv,call:async x=>{calls.push(x);if(x.operation==='start'){const s=store.load();consent(s,'mom','revoked');new LocalMemoryStore(s).remember('dad',{text:'보존할 기억'});store.save(s);return ready(x.phoneId);}return {ok:true,phoneId:x.phoneId,state:'stopped'};}});
 const q=cloud.quote('mom',1);assert.equal((await cloud.start('mom',q.quoteId)).state,'stopped');assert.deepEqual(calls.map(c=>c.operation),['start','stop']);assert(calls.every(c=>c.phoneId==='profile-mom'));assert(store.load().memories.some(m=>m.text==='보존할 기억'));
});
test('VM timeout marks unknown; diagnose recovers instead of launching another paid session',async()=>{
 const store=storage();let calls=[];const cloud=new CloudVMManager({...store,env:cloudEnv,call:async x=>{calls.push(x.operation);if(x.operation==='start')throw new Error('timeout');return ready(x.phoneId);}});
 await assert.rejects(cloud.start('mom',cloud.quote('mom',1).quoteId));assert.equal(store.load().cloudSessions.mom.state,'unknown');
 await assert.rejects(cloud.start('mom',cloud.quote('mom',1).quoteId),{status:409});assert.equal((await cloud.diagnose('mom')).state,'ready');assert.deepEqual(calls,['start','recover']);
});
test('expired or mismatched previous VM sessions must retain their receipt until cleanup is confirmed',async()=>{
 for(const [state,phoneId] of [['starting','profile-mom'],['ready','profile-mom'],['provisioning','profile-mom'],['unknown','profile-mom'],['closing','profile-mom'],['error','profile-mom'],['unknown','old-profile-mom']]){
  const store=storage();const calls=[];const cloud=new CloudVMManager({...store,env:cloudEnv,call:async x=>{calls.push(x.operation);return ready(x.phoneId);}});
  const s=store.load();
  s.cloudSessions={mom:{phoneId,state,requestId:'original-receipt',expiresAt:'2000-01-01T00:00:00Z'}};
  store.save(s);
  const quote=cloud.quote('mom',1);
  await assert.rejects(cloud.start('mom',quote.quoteId),{status:409});
  assert.deepEqual(calls,[]);
  assert.equal(store.load().cloudSessions.mom.requestId,'original-receipt');
  assert.equal(store.load().vmQuotes[0].used,undefined);
  const cleaned=store.load();cleaned.cloudSessions.mom.state='stopped';store.save(cleaned);
  assert.equal((await cloud.start('mom',quote.quoteId)).state,'ready');
  assert.deepEqual(calls,['start']);
  assert.equal(store.load().cloudSessions.mom.requestId,quote.quoteId);
 }
});
test('unconfirmed VM recovery cannot substitute a different profile or a missing receipt',async()=>{
 for(const session of [{phoneId:'old-profile-mom',requestId:'original-receipt'},{phoneId:'profile-mom'}]){
  const store=storage();const cloud=new CloudVMManager({...store,env:cloudEnv,call:async()=>assert.fail('unverifiable session must not reach the provider')});
  const s=store.load();s.cloudSessions={mom:{...session,state:'unknown'}};store.save(s);
  await assert.rejects(cloud.diagnose('mom'),{status:409});
  await assert.rejects(cloud.stop('mom'),{status:409});
  assert.deepEqual(store.load().cloudSessions,s.cloudSessions);
 }
});
test('VM profile mismatch cannot turn into a ready device',async()=>{
 const store=storage();const cloud=new CloudVMManager({...store,env:cloudEnv,call:async()=>ready('profile-dad')});
 await assert.rejects(cloud.start('mom',cloud.quote('mom',1).quoteId),{status:502});assert.equal(store.load().cloudSessions.mom.state,'unknown');assert.equal(phoneBinding('mom',runtimePhoneEnv(store.load(),cloudEnv)),null);
});
test('Android app completion requires expected foreground package and device evidence',async()=>{
 for(const matches of [true,false]){
  const s=storage().load(),env={MOLLA_PHONE_BINDINGS:'{"mom":{"serial":"test-vm"}}',MOLLA_ALLOW_ANDROID_APPS:'1'};
  const {task}=planAppTask(s,'mom',{text:'설정 열어줘',appId:'settings',device:phoneBinding('mom',env)});decide(s,'mom',task.id,'approve');let commands=[];
  const executor=new AndroidComposeExecutor('mom',{env,runner:async(_,args)=>{commands.push(args);const cmd=args.at(-1);return {stdout:cmd==='get-state'?'device':cmd.startsWith('cmd package')?'com.android.settings/.Settings':cmd.startsWith('am start')?'Status: ok':`mResumedActivity: ${matches?'com.android.settings/.Settings':'other/.App'}`,stderr:''};}});
  await executeTask(s,task.id,executor);assert.equal(task.status,matches?'completed':'needs_verification');assert(commands.every(args=>args[1]==='test-vm'));assert.equal(commands.length,4);
 }
});
test('Android scope revocation or changed VM blocks side effects after an async probe',async()=>{
 const s=storage().load(),env={MOLLA_PHONE_BINDINGS:'{"mom":{"serial":"test-vm"}}',MOLLA_ALLOW_ANDROID_APPS:'1'};
 const {task}=planAppTask(s,'mom',{text:'설정',appId:'settings',device:phoneBinding('mom',env)});decide(s,'mom',task.id,'approve');let calls=0;
 const executor=new AndroidComposeExecutor('mom',{env,runner:async(_,args)=>{calls++;if(calls===2)env.MOLLA_PHONE_BINDINGS='{"mom":{"serial":"different"}}';return {stdout:args.at(-1)==='get-state'?'device':'com.android.settings/.Settings',stderr:''};}});
 await executeTask(s,task.id,executor);assert.equal(task.status,'failed');assert.equal(calls,2);
});
test('Forged completion evidence from a different package cannot mark an app task complete',async()=>{
 const s=storage().load();const {task}=planAppTask(s,'mom',{text:'설정',appId:'settings',device:{serial:'test-vm'}});decide(s,'mom',task.id,'approve');
 await executeTask(s,task.id,{execute:async()=>({kind:'app_opened',verified:true,package:'other.app',device:'test-vm'})});assert.equal(task.status,'failed');
});
