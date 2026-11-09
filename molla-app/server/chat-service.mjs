import { createHash } from 'node:crypto';
import { bounded, id, now, member, DomainError, log } from './core.mjs';
import { classify, planTask, planAppTask } from './domain.mjs';
import { LLMPlanner, cloudContext } from './llm.mjs';
import { phoneBinding } from './phone.mjs';
import { runtimePhoneEnv } from './cloud-vm.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const privacyVersion=(s,actor)=>digest([member(s,actor).policyVersion,member(s,actor).cloudAI,s.memories.filter(m=>m.owner===actor).map(m=>[m.id,m.version]),s.contacts.filter(c=>c.owner===actor)]);

export class ChatService {
 constructor({load,save,env=process.env,planner=new LLMPlanner({env})}){Object.assign(this,{load,save,env,planner});this.pending=new Set();}
 async send(actor,{text,requestId},guard=()=>{}){
  text=bounded(text);if(typeof requestId!=='string'||!/^[-A-Za-z0-9_]{8,100}$/.test(requestId))throw new DomainError('유효한 요청 식별자가 필요해요.');
  guard();let s=this.load(),m=member(s,actor);const hash=digest(text);
  s.chatRequests??=[];const old=s.chatRequests.find(r=>r.actor===actor&&r.requestId===requestId);
  if(old){if(old.hash!==hash)throw new DomainError('같은 요청 식별자에 다른 내용을 보낼 수 없어요.',409);if(old.state==='done'){return {...old.response,task:old.taskId?s.tasks.find(t=>t.id===old.taskId&&t.owner===actor)??null:null};}throw new DomainError(old.state==='pending'?'AI 요청을 처리 중이에요.':'이 요청은 중단됐어요. 새 요청으로 다시 시도해 주세요.',409);}
  if(this.pending.has(actor))throw new DomainError('앞선 AI 답변을 기다려 주세요.',409);
  if(classify(text)==='finance')throw new DomainError('금융 거래는 지원하지 않아요.',403);
  const context=cloudContext(s,actor,actor,text),version=privacyVersion(s,actor);
  const limit=Math.max(1,Math.min(500,Number(this.env.MOLLA_LLM_DAILY_REQUEST_LIMIT)||40));
  if(s.chatRequests.filter(r=>r.actor===actor&&Date.parse(r.startedAt)>Date.now()-86400000).length>=limit)throw new DomainError('오늘의 AI 사용 한도에 도달했어요.',429);
  const record={actor,requestId,hash,state:'pending',startedAt:now()};s.chatRequests.push(record);this.save(s);this.pending.add(actor);
  try{
   const generated=await this.planner.plan(context);guard();s=this.load();m=member(s,actor);
   if(m.consent!=='active'||!m.cloudAI.enabled||privacyVersion(s,actor)!==version)throw new DomainError('대기 중 동의나 개인 정보가 바뀌었어요. 새로 부탁해 주세요.',409);
   const p=generated.plan;let result;
   if(p.intent==='unsupported')result={reply:'이 요청은 자동으로 처리할 수 없어요. 금융·결제·인증 정보 입력은 직접 진행해 주세요.',task:null};
   else if(p.intent==='conversation')result={reply:/전송했|보냈어요|예약했|주문했|결제했|실행했/.test(p.reply)?'아직 실행한 작업은 없어요. 필요한 작업을 구체적으로 알려주시면 승인할 내용을 준비할게요.':p.reply,task:null};
   else if(p.intent==='open_app'){
    const device=phoneBinding(actor,runtimePhoneEnv(s,this.env));
    if(this.env.MOLLA_ALLOW_ANDROID_APPS!=='1')throw new DomainError('Android 앱 실행 설정을 먼저 켜 주세요.',409);
    result=planAppTask(s,actor,{text,appId:p.app,device});
   }else{
    if(!p.draft?.trim())throw new DomainError('AI가 실행할 초안을 만들지 못했어요. 내용을 구체적으로 알려주세요.',502);
    const device=phoneBinding(actor,runtimePhoneEnv(s,this.env));
    const recipient=p.recipient?s.contacts.filter(c=>c.owner===actor&&(c.name===p.recipient||c.relation===p.recipient)):[];
    if(recipient.length>1)throw new DomainError('같은 관계의 연락처가 여러 명이에요. 정확한 이름을 알려주세요.',409);
    const compose=p.intent==='message'&&recipient.length===1&&device&&this.env.MOLLA_ALLOW_ANDROID_COMPOSE==='1';
    if(compose&&!m.scopes.includes('phone'))throw new DomainError('내 설정에서 Android 실행 권한을 허용해 주세요.',403);
    result=planTask(s,actor,{text,draft:p.draft,kindHint:p.intent,contactId:recipient[0]?.id,execution:compose?'android-compose':'local',device:compose?device:undefined});
   }
   const response={reply:result.reply,model:generated.model,provider:generated.provider,usage:generated.usage,...(generated.estimatedCost?{estimatedCost:generated.estimatedCost}:{}),...(generated.responseId?{responseId:generated.responseId}:{})};
   s.messages.push({id:id(),owner:actor,role:'user',text,at:now()},{id:id(),owner:actor,role:'assistant',text:response.reply,at:now(),taskId:result.task?.id,model:generated.model});
   const saved=s.chatRequests.find(r=>r.actor===actor&&r.requestId===requestId);Object.assign(saved,{state:'done',response,taskId:result.task?.id??null});
   s.llmVerifiedAt=now();log(s,actor,'AI 답변을 받았어요',generated.model);this.save(s);return {...response,task:result.task};
  }catch(e){s=this.load();const saved=s.chatRequests?.find(r=>r.actor===actor&&r.requestId===requestId);if(saved){saved.state='failed';this.save(s);}throw e;}
  finally{this.pending.delete(actor);}
 }
}
