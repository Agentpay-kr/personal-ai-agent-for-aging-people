import { now, log, DomainError } from './core.mjs';
import { PolicyEngine } from './policy.mjs';
import { PHONE_APPS } from './phone.mjs';

export class LocalDraftExecutor {
 async execute(action){
  const artifact={body:action.body,recipient:action.recipient??null,kind:action.type};
  return {kind:'local_draft',verified:!!artifact.body,artifact,summary:'초안을 준비했어요. 실제 주문·예약·메시지 전송은 하지 않았어요.'};
 }
}
export function recoverTasks(state){
 for(const t of state.tasks)if(t.status==='running'){t.status='needs_verification';t.result='실행 중 서버가 다시 시작되었어요. 기기에서 결과를 확인하고 필요한 경우 새로 부탁해 주세요.';log(state,t.owner,'실행 결과를 확인해 주세요',t.result);}
}
/** getState/persist allow durable hosts to reload after await, preserving concurrent edits. */
export async function executeTask(state,taskId,executor=new LocalDraftExecutor(),{getState=()=>state,persist=()=>{}}={}){
 let t=state.tasks.find(t=>t.id===taskId);if(!t||t.status!=='running'||t.executionStartedAt)return t;
 try{
  new PolicyEngine(state).execute(t);t.executionStartedAt=now();t.step=1;persist(state);
  const authorize=()=>{const currentState=getState(),current=currentState.tasks.find(t=>t.id===taskId);if(!current||current.status!=='running')throw new DomainError('작업이 중단되었어요.',403);new PolicyEngine(currentState).execute(current);};
  const beforeEffect=()=>{authorize();const current=getState(),task=current.tasks.find(t=>t.id===taskId);task.externalEffectStartedAt=now();persist(current);};
  const action=structuredClone(t.action);const evidence=await executor.execute(action,{authorize,beforeEffect});
  state=getState();t=state.tasks.find(t=>t.id===taskId);if(!t)return;
  // A cancellation during a device call cannot undo an already opened intent.
  if(t.status!=='running'){t.result='작업 중단을 요청했어요. 이미 열린 휴대폰 화면은 직접 확인해 주세요.';log(state,t.owner,'중단 후 실행 응답을 받았어요');persist(state);return t;}
  new PolicyEngine(state).execute(t);
  if(evidence?.kind==='local_draft'&&evidence.verified===true&&evidence.artifact?.body===action.body){t.status='prepared';t.step=2;}
  else if(action.type==='app.open'&&evidence?.kind==='app_opened'&&evidence.package===PHONE_APPS[action.appId]?.package&&evidence.device===action.device?.serial){t.status=evidence.verified===true?'completed':'needs_verification';if(evidence.verified)t.step=2;}
  else if(evidence?.kind==='intent_opened'){t.status='needs_verification';}
  else throw new Error('실행 결과를 검증할 수 없어요.');
  t.evidence=evidence;t.result=evidence.summary;t.finishedAt=now();log(state,t.owner,t.status==='prepared'?'초안을 준비했어요':'휴대폰에서 확인해 주세요',t.result);
 }catch(e){
  state=getState();t=state.tasks.find(t=>t.id===taskId);if(t&&t.status==='running'){t.status='failed';t.result=e.status?e.message:'작업 결과를 확인하지 못했어요. 자동으로 다시 실행하지 않아요.';log(state,t.owner,'작업을 멈췄어요',t.result);}
 }
 persist(state);return t;
}
