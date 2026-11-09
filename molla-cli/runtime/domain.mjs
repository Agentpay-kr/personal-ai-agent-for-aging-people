import { id, member, own, log, DomainError, bounded } from './core.mjs';
import { migrate, resolveContact, isFamily } from './ontology.mjs';
import { PolicyEngine } from './policy.mjs';
import { LocalMemoryStore } from './memory.mjs';
import { messageDraft } from './drafts.mjs';
import { PHONE_APPS } from './phone.mjs';
import { activeStatuses, interruptTask, transition } from './lifecycle.mjs';
export { id, member, own, log, DomainError } from './core.mjs';
export function seed({live=false}={}){
  const now=new Date().toISOString();
  return migrate({ members: [
    {id:'mom',name:'엄마',subtitle:'다정한 일상 메이트',color:'peach',initial:'엄',consent:live?'pending':'active',agentName:'몰라',role:'owner',vm:'mom-private',scopes:['shopping','calendar','message']},
    {id:'dad',name:'아빠',subtitle:'새로운 친구를 기다려요',color:'blue',initial:'아',consent:'pending',agentName:'몰라',role:'owner',vm:'dad-private',scopes:['shopping','calendar','message']},
    {id:'son',name:'나',subtitle:'우리 가족의 든든한 연결',color:'mint',initial:'나',consent:live?'pending':'active',agentName:'몰라',role:'helper',vm:'son-private',scopes:['shopping','calendar','message']}
  ], tasks:[], messages:[], memories:live?[]:[{id:id(),owner:'mom',text:'짧고 다정하게 이야기하는 걸 좋아해요.',createdAt:now},{id:id(),owner:'mom',text:'생필품을 살 때는 가격을 먼저 알려주세요.',createdAt:now}], connections:[], invites:[], events:[] });
}
export function initializeLiveConsent(s){
 if(s.liveConsentVersion===1)return;
 for(const m of s.members){m.consent='pending';m.policyVersion++;m.cloudAI={enabled:false,includeMemories:false,version:m.cloudAI.version+1};}
 s.memoryGrants=[];
 for(const t of s.tasks)if(['running','awaiting_approval'].includes(t.status)){t.status='cancelled';t.result='실제 연결 모드의 주인 동의를 새로 확인해 주세요.';}
 s.liveConsentVersion=1;
}
export function classify(text){
 if(/송금|이체|계좌|transfer|bank|remit/i.test(text))return 'finance';
 if(/연동|로그인|connect|login/i.test(text))return 'connection';
 if(/알려줘|전해줘|메시지|문자|카톡|메일|이메일|message|email|send/i.test(text))return 'message';
 if(/쌀|주문|구매|장보기|사줘|쇼핑|buy|order|purchase/i.test(text))return 'shopping';
 if(/일정|병원|약속|예약|calendar|schedule|book/i.test(text))return 'calendar';
 if(/메시지|문자|카톡|메일|이메일|message|email|send/i.test(text))return 'message';
 return 'conversation';
}
export function planTask(s,actor,{owner=actor,text,draft,contactId,execution='local',device,kindHint}){
 text=bounded(text);if(!['local','android-compose'].includes(execution))throw new DomainError('지원하지 않는 실행 방식이에요.');
 member(s,actor); const target=member(s,owner); const classified=classify(text);const kind=classified==='finance'?'finance':['message','shopping','calendar'].includes(kindHint)?kindHint:classified;
 if(kind==='finance')throw new DomainError('계좌 이체는 지원하지 않아요. 가족의 계좌에도 접근할 수 없어요.',403);
 if(kind==='connection'){own(actor,owner);return {reply:'연결된 앱에서 내 계정의 연결 상태를 확인해 주세요. 실제 로그인은 계정 주인이 직접 진행해야 해요.',task:null};}
 if(target.consent!=='active')throw new DomainError('먼저 주인이 에이전트 도움을 수락해야 해요.',403);
 if(kind==='conversation'){
   own(actor,owner);
   if(/기억|취향/.test(text)){
    const memories=new LocalMemoryStore(s).recall(actor);
    return {reply:memories.length?`직접 알려주신 기억이에요.\n${memories.map(m=>`• ${m.text}`).join('\n')}\n몰라의 기억 화면에서 수정하거나 지울 수 있어요.`:'아직 알려주신 기억이 없어요. 몰라의 기억 화면에서 남겨 주세요.',task:null};
   }
   return {reply:'네, 듣고 있어요. 지금은 체험 모드예요. “쌀 10kg 주문해줘”, “병원 일정 정리해줘”처럼 부탁해 보세요. 실제 계정 연결 후에는 더 많은 일을 도울 수 있어요.',task:null};
 }
 if(!target.scopes.includes(kind))throw new DomainError('주인이 이 작업의 도움 권한을 꺼 두었어요.',403);
 new PolicyEngine(s).request(actor,owner,kind);
 const recipientQuery=contactId||text.match(/([^\s]+?)(?:에게|한테)/)?.[1];
 const recipient=kind==='message'&&recipientQuery?resolveContact(s,owner,recipientQuery):null;
 if(execution==='android-compose'){
  own(actor,owner);
  if(kind!=='message'||!recipient||!device)throw new DomainError('문자 작성 화면을 열려면 내 연락처와 연결된 Android 기기가 필요해요.',409);
  if(!draft)throw new DomainError('휴대폰에 넣을 정확한 메시지 내용을 먼저 작성해 주세요.');
 }
 const action={type:kind==='message'?'message.draft':`${kind}.draft`,body:draft?bounded(draft,1000):kind==='message'?messageDraft(text):text,recipient:recipient?{id:recipient.id,name:recipient.name,phone:recipient.phone}:null,execution,device:execution==='android-compose'?device:null};
 const task={id:id(),owner,requester:actor,kind,text,status:'awaiting_approval',createdAt:new Date().toISOString(),demo:true,
   title:kind==='shopping'?'장보기 도와드리기':kind==='calendar'?'일정 정리하기':'메시지 초안 만들기',
   summary:kind==='shopping'?'요청한 물건을 찾고 주문 확인 화면까지 살펴봐요.':kind==='calendar'?'요청한 일정을 확인하고 달력에 추가할 준비를 해요.':'요청한 내용으로 메시지 초안을 준비해요.',
   steps:['요청과 권한 확인','개인 공간에서 준비','결과 확인'],step:0,result:null,action,
   context:{memoryReferences:new LocalMemoryStore(s).recall(owner).map(m=>({id:m.id,version:m.version,source:m.source}))}};
 if(execution==='android-compose'){task.demo=false;task.title='휴대폰에서 문자 작성하기';task.summary='아래 수신자와 내용으로 문자 작성 화면을 열어요. 전송은 휴대폰에서 직접 확인해 주세요.';}
 s.tasks.unshift(task);log(s,owner,'새로운 부탁이 도착했어요',text);
 // A requesting family member receives a receipt, never the owner's resolved contacts.
 return {task:actor===owner?task:{id:task.id,status:task.status,owner},reply:`${target.name}의 개인 공간에서 준비할게요. 먼저 ${target.name}의 확인이 필요해요. 실제 주문·예약·전송은 자동으로 하지 않아요.`};
}
export function planAppTask(s,actor,{text,appId,device}){
 new PolicyEngine(s).request(actor,actor,'phone');
 if(!device||!Object.hasOwn(PHONE_APPS,appId))throw new DomainError('연결된 실행 공간과 지원하는 앱을 확인해 주세요.',409);
 const task={id:id(),owner:actor,requester:actor,kind:'phone',text:bounded(text),title:`${PHONE_APPS[appId].name} 열기`,summary:'내 Android 실행 공간에서 이 앱을 열어요.',status:'awaiting_approval',createdAt:new Date().toISOString(),demo:false,steps:['요청과 권한 확인','내 실행 공간에서 앱 열기','열린 앱 확인'],step:0,result:null,action:{type:'app.open',appId,body:`${PHONE_APPS[appId].name} 앱 열기`,recipient:null,execution:'android-app',device}};
 s.tasks.unshift(task);log(s,actor,'앱 실행 요청을 준비했어요');return {task,reply:'실행할 앱과 내 실행 공간을 확인한 뒤 승인해 주세요.'};
}
export function decide(s,actor,taskId,decision){
 if(!['approve','reject','cancel'].includes(decision))throw new DomainError('잘못된 선택이에요.');
 const t=s.tasks.find(t=>t.id===taskId);if(!t)throw new DomainError('작업을 찾을 수 없어요.',404);own(actor,t.owner);
 if(decision==='cancel'){
   if(!activeStatuses.includes(t.status))throw new DomainError('이미 끝난 작업이에요.',409);
   interruptTask(s,t,'주인이 작업 중단을 요청했어요. 이미 열린 화면은 직접 확인해 주세요.');return t;
 }
 if(t.status!=='awaiting_approval')throw new DomainError('이미 확인한 요청이에요.',409);
 const m=member(s,actor);if(m.consent!=='active'||!m.scopes.includes(t.kind))throw new DomainError('도움 권한이 해제되었어요.',403);
 if(decision==='approve')t.approval=new PolicyEngine(s).approve(actor,t);
 transition(s,t,decision==='approve'?(t.lifecycleVersion?'approved':'running'):'rejected');t.startedAt=new Date().toISOString();
 log(s,actor,decision==='approve'?'승인한 작업을 시작했어요':'요청을 거절했어요',t.text);return t;
}
export function tick(s){
 for(const t of s.tasks.filter(t=>activeStatuses.includes(t.status))){
   const owner=member(s,t.owner);
   if(owner.consent!=='active'||!owner.scopes.includes(t.kind)){interruptTask(s,t,'도움 권한이 철회되었어요.');continue;}
 }
}
export function consent(s,actor,value){
 if(!['active','revoked'].includes(value))throw new DomainError('잘못된 동의 값이에요.');
 const m=member(s,actor);m.consent=value;m.policyVersion++;
 if(value!=='active')s.memoryGrants=s.memoryGrants.filter(g=>g.owner!==actor);
 if(value!=='active')for(const t of s.tasks)if(t.owner===actor)interruptTask(s,t,'도움 동의가 철회되었어요.');
 log(s,actor,value==='active'?'몰라의 도움을 수락했어요':'몰라의 도움을 중단했어요');
}
export function snapshot(s,actor){
 const me=member(s,actor);
 return {me,members:s.members.filter(m=>isFamily(s,actor,m.id)).map(({id,name,initial,color,consent,role,subtitle})=>({id,name,initial,color,consent,role,subtitle})),tasks:s.tasks.filter(t=>t.owner===actor),messages:s.messages.filter(m=>m.owner===actor),memories:new LocalMemoryStore(s).recall(actor),sharedMemories:new LocalMemoryStore(s).recallShared(actor),memoryGrants:s.memoryGrants.filter(g=>g.owner===actor),contacts:s.contacts.filter(c=>c.owner===actor),connections:s.connections.filter(c=>c.owner===actor),events:s.events.filter(e=>e.owner===actor).slice(0,60),invites:s.invites.filter(i=>i.createdBy===actor&&!i.used&&Date.parse(i.expiresAt)>Date.now()),mode:'demo'};
}
