import { randomUUID } from 'node:crypto';
import { own, DomainError, log } from '../runtime/core.mjs';
import { PolicyEngine } from '../runtime/policy.mjs';
import { LocalDraftExecutor } from '../runtime/orchestrator.mjs';
import { AndroidComposeExecutor, PHONE_APPS } from '../runtime/phone.mjs';
import { transition, executingStatuses } from '../runtime/lifecycle.mjs';

export const EXECUTION_LEASE_MS=120000;

export async function execute(store,actor,taskId,{executor,env=process.env,guard=()=>{},timeoutMs=EXECUTION_LEASE_MS}={}){
 guard();
 const claim=store.transaction(s=>{
  const t=s.tasks.find(t=>t.id===taskId);if(!t)throw new DomainError('작업을 찾을 수 없어요.',404);own(actor,t.owner);
  if(['prepared','completed','needs_verification','failed','cancelled','rejected'].includes(t.status))return {existing:t};
  if(!['running','approved'].includes(t.status))throw new DomainError('소유자의 승인 후 실행할 수 있어요.',403);
  if(t.executionStartedAt)throw new DomainError('이미 실행 중이에요. 결과를 확인하고 자동 재실행하지 마세요.',409);
  // Lease must outlast the worst-case ADB run (4 calls x 15 s) so recover can't race a live execution.
  new PolicyEngine(s).execute(t);t.executionStartedAt=new Date().toISOString();t.executionId=randomUUID();t.executionLeaseUntil=new Date(Date.now()+EXECUTION_LEASE_MS).toISOString();t.step=1;
  if(t.lifecycleVersion)transition(s,t,'executing');
  return {id:t.id,executionId:t.executionId,action:structuredClone(t.action)};
 });
 if(claim.existing)return {...claim.existing,reused_result:true};
 let effectStarted=false, expired=false, timer;
 const authorize=()=>{guard();const state=store.read(),t=state.tasks.find(t=>t.id===taskId);if(expired||!t||!executingStatuses.includes(t.status)||t.executionId!==claim.executionId)throw new DomainError('작업이 중단되었어요.',403);new PolicyEngine(state).execute(t);};
 const beforeEffect=()=>{authorize();store.transaction(s=>{s.tasks.find(t=>t.id===taskId).externalEffectStartedAt=new Date().toISOString();});effectStarted=true;};
 const verifying=()=>{authorize();store.transaction(s=>{const t=s.tasks.find(t=>t.id===taskId);if(t.lifecycleVersion)transition(s,t,'verifying');});};
 try{
  const handler=executor||(claim.action.execution.startsWith('android-')?new AndroidComposeExecutor(actor,{env}):new LocalDraftExecutor());
  authorize();const evidence=await Promise.race([handler.execute(claim.action,{authorize,beforeEffect,verifying}),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new DomainError('실행 시간이 초과되었어요. 결과를 확인해 주세요.',504));},timeoutMs);})]);
  return store.transaction(s=>{
   const t=s.tasks.find(t=>t.id===taskId);if(!executingStatuses.includes(t.status)||t.executionId!==claim.executionId){t.result='중단 후 실행 응답을 받았어요. 기기에서 결과를 직접 확인해 주세요.';return t;}
   // The side effect already happened. If policy changed meanwhile, never report "failed"
   // (that invites a duplicate retry): record what happened and ask for a human check.
   try{guard();new PolicyEngine(s).execute(t);}catch(e){transition(s,t,'needs_verification');t.evidence=evidence??null;t.result='실행은 끝났지만 그 사이 권한이 바뀌었어요. 결과를 직접 확인해 주세요. 자동 재실행하지 않아요.';t.finishedAt=new Date().toISOString();log(s,actor,'실행 결과 확인이 필요해요',t.result);return t;}
   if(t.lifecycleVersion&&t.status==='executing')transition(s,t,'verifying');
   if(evidence?.kind==='local_draft'&&evidence.verified===true&&evidence.artifact?.body===claim.action.body){t.status='prepared';t.step=2;}
   else if(claim.action.type==='app.open'&&evidence?.kind==='app_opened'&&evidence.package===PHONE_APPS[claim.action.appId]?.package&&evidence.device===claim.action.device?.serial){t.status=evidence.verified===true?'completed':'needs_verification';if(evidence.verified===true)t.step=2;}
   else if(evidence?.kind==='sms_composed'&&claim.action.execution==='android-compose'&&evidence.device===claim.action.device?.serial&&evidence.verified===true&&evidence.messageSent===false)t.status='completed';
   else if((evidence?.kind==='screen_inspected'&&claim.action.execution==='android-inspect'||evidence?.kind==='navigation_completed'&&claim.action.execution==='android-navigation')&&evidence.device===claim.action.device?.serial&&evidence.verified===true)t.status='completed';
   else if(evidence?.kind==='memory_written'&&claim.action.execution==='memory'&&evidence.verified===true&&s.memories.some(m=>m.id===evidence.memoryId&&m.owner===actor&&m.text===claim.action.body))t.status='completed';
   else if(evidence?.kind==='intent_opened')t.status='needs_verification';
   else throw new DomainError('실행 결과를 검증할 수 없어요.',409);
   if(t.lifecycleVersion)transition(s,t,t.status);t.evidence=evidence;t.result=evidence.summary;t.finishedAt=new Date().toISOString();log(s,actor,'실행 결과를 기록했어요',t.result);return t;
  });
 }catch(e){return store.transaction(s=>{const t=s.tasks.find(t=>t.id===taskId);if(executingStatuses.includes(t.status)&&t.executionId===claim.executionId){transition(s,t,effectStarted?'needs_verification':'failed');t.result=e.status?e.message:'실행 결과를 확인하지 못했어요. 자동 재실행하지 않아요.';log(s,actor,'작업을 멈췄어요',t.result);}return t;});}
 finally{clearTimeout(timer);}
}
