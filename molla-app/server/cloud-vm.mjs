import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { id, now, member, DomainError, log } from './core.mjs';
import { PolicyEngine } from './policy.mjs';
import { adbPath } from './phone.mjs';
const root=resolve(import.meta.dirname,'..');
export function cloudMappings(env=process.env){
 let mappings={};try{mappings=env.MOLLA_CLOUD_BINDINGS?JSON.parse(env.MOLLA_CLOUD_BINDINGS):JSON.parse(readFileSync(env.MOLLA_CLOUD_BINDINGS_FILE||resolve(root,'.data/cloud-bindings.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw new DomainError('클라우드 VM 배정 설정을 확인해 주세요.',503);}
 if(!mappings||typeof mappings!=='object'||Array.isArray(mappings))throw new DomainError('클라우드 VM 배정 설정을 확인해 주세요.',503);
 const assigned=new Set();for(const [owner,b] of Object.entries(mappings)){
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(owner)||!b||!/^[-A-Za-z0-9_.]{1,200}$/.test(b.phoneId)||assigned.has(b.phoneId))throw new DomainError('각 사용자에게 서로 다른 저장형 VM을 배정해 주세요.',503);
  assigned.add(b.phoneId);
 }
 return mappings;
}
export function vmLimits(env=process.env){const n=Number(env.MOLLA_VM_MAX_MINUTES||5);return {vmMaxMinutes:Number.isInteger(n)&&n>=1&&n<=5?n:5,vmPricePerMinuteUsd:0.05};}
export function phoneRuntime(s,actor,env=process.env){
 const b=cloudMappings(env)[actor],session=s.cloudSessions?.[actor];
 const valid=b&&session?.phoneId===b.phoneId;
 let state=valid?session.state:'not_started';
 if(valid&&session.expiresAt&&Date.parse(session.expiresAt)<=Date.now())state='expired';
 return {configured:!!b,provider:'phone-harness',phoneId:b?.phoneId??null,state,expiresAt:valid?session.expiresAt??null:null,actions:['open_app','message_compose'],lastCheckedAt:valid?session.checkedAt??null:null};
}
export function runtimePhoneEnv(s,env=process.env){
 let bindings={};try{bindings=JSON.parse(env.MOLLA_PHONE_BINDINGS||'{}');}catch{throw new DomainError('기기 설정을 확인해 주세요.',503);}
 for(const [owner,b] of Object.entries(cloudMappings(env))){
  delete bindings[owner];const session=s.cloudSessions?.[owner];
  if(session?.phoneId===b.phoneId&&session.state==='ready'&&session.serial&&Date.parse(session.expiresAt)>Date.now())bindings[owner]={serial:session.serial,mode:'cloud',phoneId:b.phoneId,sessionId:session.sessionId,expiresAt:session.expiresAt};
 }
 const bundled=resolve(root,'.tools/platform-tools/adb.exe');
 return {...env,MOLLA_PHONE_BINDINGS:JSON.stringify(bindings),MOLLA_ADB:adbPath(env)};
}
export function callCloud(input,{env=process.env}={}){
 const bundled=resolve(root,'.tools/platform-tools/adb.exe');
 return new Promise((done,reject)=>{
  const child=spawn(env.MOLLA_PYTHON||'python',[resolve(root,'workers/cloud_manager.py')],{windowsHide:true,env:{...env,PYTHONUTF8:'1',PHONE_HARNESS_HOME:env.PHONE_HARNESS_HOME||resolve(root,'.data/cloud/operator'),PHONE_HARNESS_ADB:adbPath(env),DO_NOT_TRACK:'1'},stdio:['pipe','pipe','pipe']});
  let output='';const timer=setTimeout(()=>{child.kill();reject(new DomainError('VM 응답을 확인하지 못했어요. 연결 확인 후 다시 시도해 주세요.',504));},60000);
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>100000){child.kill();}});child.stderr.resume();
  child.on('error',()=>{clearTimeout(timer);reject(new DomainError('Python 실행 환경을 확인해 주세요.',503));});
  child.on('close',()=>{clearTimeout(timer);try{const data=JSON.parse(output);if(!data.ok){const messages={login_required:'Phone Harness Cloud 로그인이 필요해요.',saved_phone_required:'이 사용자에게 저장형 Android VM을 배정해 주세요.',session_owner_mismatch:'VM 소유자 검증에 실패했어요.',insufficient_credit:'VM 잔액을 확인해 주세요.',profile_running:'이미 실행 중인 VM이에요. 연결 확인을 눌러 주세요.'};const error=new DomainError(messages[data.code]||(data.stage==='adb_connect'?'VM이 준비됐지만 ADB 연결을 확인하지 못했어요.':'클라우드 연결을 확인하지 못했어요. 새 VM을 시작하지 말고 연결 확인을 눌러 주세요.'),502);error.code=/^[a-z_]{1,60}$/.test(data.code||'')?data.code:'cloud_request_failed';error.stage=data.stage;throw error;}done(data);}catch(e){reject(e instanceof DomainError?e:new DomainError('클라우드 응답을 확인하지 못했어요.',502));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
 });
}
export class CloudVMManager {
 constructor({load,save,env=process.env,call=callCloud}){Object.assign(this,{load,save,env,call});this.busy=new Set();}
 assigned(actor){const b=cloudMappings(this.env)[actor];if(!b)throw new DomainError('운영자가 이 사용자의 저장형 VM을 먼저 배정해야 해요.',409);return b;}
 quote(actor,minutes){
  const s=this.load();new PolicyEngine(s).request(actor,actor,'phone');const b=this.assigned(actor),limits=vmLimits(this.env);
  if(!Number.isInteger(minutes)||minutes<1||minutes>limits.vmMaxMinutes)throw new DomainError(`VM 시간은 1~${limits.vmMaxMinutes}분으로 골라 주세요.`);
  const quote={quoteId:id(),owner:actor,phoneId:b.phoneId,durationMinutes:minutes,estimatedMaxUsd:Number((minutes*limits.vmPricePerMinuteUsd).toFixed(2)),expiresAt:new Date(Date.now()+300000).toISOString(),policyVersion:member(s,actor).policyVersion};
  s.vmQuotes??=[];s.vmQuotes=s.vmQuotes.filter(q=>Date.parse(q.expiresAt)>Date.now()&&q.owner!==actor);s.vmQuotes.push(quote);this.save(s);
  const {owner,phoneId,policyVersion,...visible}=quote;return visible;
 }
 async locked(actor,fn){if(this.busy.has(actor))throw new DomainError('VM 요청을 처리 중이에요.',409);this.busy.add(actor);try{return await fn();}finally{this.busy.delete(actor);}}
 async start(actor,quoteId){return this.locked(actor,async()=>{
  let s=this.load();new PolicyEngine(s).request(actor,actor,'phone');const b=this.assigned(actor),q=s.vmQuotes?.find(q=>q.quoteId===quoteId&&q.owner===actor);
  if(!q||q.used||q.phoneId!==b.phoneId||Date.parse(q.expiresAt)<=Date.now()||q.policyVersion!==member(s,actor).policyVersion)throw new DomainError('실행 견적이 만료되었어요. 비용과 시간을 다시 확인해 주세요.',409);
  const previous=phoneRuntime(s,actor,this.env);if(['starting','ready','provisioning','unknown','closing'].includes(previous.state))throw new DomainError('VM이 실행 중이거나 확인이 필요해요. 연결 확인을 눌러 주세요.',409);
  q.used=true;s.cloudSessions??={};s.cloudSessions[actor]={phoneId:b.phoneId,state:'starting',requestId:q.quoteId,expiresAt:new Date(Date.now()+q.durationMinutes*60000+60000).toISOString()};this.save(s);
  try{
   const response=await this.call({operation:'start',phoneId:b.phoneId,durationSeconds:q.durationMinutes*60,requestId:q.quoteId},{env:this.env});
   this.record(actor,b.phoneId,response);s=this.load();
   if(member(s,actor).consent!=='active'||!member(s,actor).scopes.includes('phone')||member(s,actor).policyVersion!==q.policyVersion){await this.stopUnrestricted(actor);return phoneRuntime(this.load(),actor,this.env);}
   return phoneRuntime(s,actor,this.env);
  }catch(e){s=this.load();if(s.cloudSessions[actor]?.phoneId===b.phoneId){s.cloudSessions[actor].state='unknown';this.save(s);}throw e;}
 });}
 record(actor,phoneId,data){
  if(data.phoneId!==phoneId||!['provisioning','ready','stopped','closing','error'].includes(data.state))throw new DomainError('VM 소유자나 실행 상태를 검증하지 못했어요.',502);
  const s=this.load();s.cloudSessions??={};const expiresAt=typeof data.expiresAt==='number'?new Date(data.expiresAt*1000).toISOString():data.expiresAt??null;
  s.cloudSessions[actor]={phoneId,requestId:s.cloudSessions[actor]?.requestId,sessionId:data.sessionId??null,state:data.state,expiresAt,serial:data.serial??null,checkedAt:now()};log(s,actor,'Android 실행 공간 상태를 확인했어요',data.state);this.save(s);
 }
 async diagnose(actor){return this.locked(actor,async()=>{
  const s=this.load();new PolicyEngine(s).request(actor,actor,'phone');const b=this.assigned(actor),session=s.cloudSessions?.[actor];
  const data=await this.call({operation:session?.sessionId&&session.phoneId===b.phoneId?'status':'recover',phoneId:b.phoneId,sessionId:session?.sessionId,requestId:session?.requestId},{env:this.env});this.record(actor,b.phoneId,data);return phoneRuntime(this.load(),actor,this.env);
 });}
 async stopUnrestricted(actor){
  const s=this.load(),b=this.assigned(actor),session=s.cloudSessions?.[actor];
  if(!session?.sessionId||session.phoneId!==b.phoneId){const recovered=await this.call({operation:'recover',phoneId:b.phoneId,requestId:session?.requestId},{env:this.env});this.record(actor,b.phoneId,recovered);if(recovered.state==='stopped')return phoneRuntime(this.load(),actor,this.env);}
  const current=this.load().cloudSessions[actor];const data=await this.call({operation:'stop',phoneId:b.phoneId,sessionId:current.sessionId,requestId:current.requestId},{env:this.env});this.record(actor,b.phoneId,data);return phoneRuntime(this.load(),actor,this.env);
 }
 async stop(actor){return this.locked(actor,()=>this.stopUnrestricted(actor));}
}
