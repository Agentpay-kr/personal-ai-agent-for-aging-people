import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, planTask, decide, consent, snapshot, classify } from '../server/domain.mjs';
import { LocalMemoryStore } from '../server/memory.mjs';
import { PolicyEngine } from '../server/policy.mjs';
import { addContact, resolveContact, graphFor } from '../server/ontology.mjs';
import { executeTask, recoverTasks } from '../server/orchestrator.mjs';
import { AndroidComposeExecutor,phoneBinding } from '../server/phone.mjs';

const setup = () => { const s=seed(); return {s,mem:new LocalMemoryStore(s),policy:new PolicyEngine(s)}; };
test('병원에 간다고 알려달라는 요청은 메시지로 분류한다',()=>assert.equal(classify('딸에게 내일 병원에 간다고 알려줘'),'message'));
test('명령문과 실제 승인할 메시지 본문은 구분하고 명시적 본문을 우선한다',()=>{
 const {s}=setup();assert.equal(planTask(s,'mom',{text:'딸에게 내일 병원에 간다고 알려줘'}).task.action.body,'내일 병원에 가요.');
 assert.equal(planTask(s,'mom',{text:'딸에게 "내일 만나요!"라고 문자 보내줘'}).task.action.body,'내일 만나요!');
 assert.equal(planTask(s,'mom',{text:'문자 작성해줘',draft:'정확히 이 내용'}).task.action.body,'정확히 이 내용');
});
test('가족 관계만으로 기억을 읽고 수정할 수 없다',()=>{
 const {s,mem}=setup(); const m=mem.remember('mom',{text:'개인적인 취향'});
 assert.throws(()=>mem.recall('son',{owner:'mom'}),{status:403});
 assert.throws(()=>mem.correct('son',m.id,'잘못된 변경'),{status:403});
 assert(!JSON.stringify(snapshot(s,'son')).includes('개인적인 취향'));
});
test('명시적 항목 공유 및 철회, 수정 후 이전 공유 무효화',()=>{
 const {mem}=setup(); const m=mem.remember('mom',{text:'차를 좋아해요'});
 mem.share('mom',m.id,'son'); assert.equal(mem.recallShared('son')[0].text,m.text);
 mem.revokeShare('mom',m.id,'son'); assert.equal(mem.recallShared('son').length,0);
 mem.share('mom',m.id,'son');mem.correct('mom',m.id,'물을 좋아해요');
 assert.equal(mem.recallShared('son').length,0);assert.equal(mem.recall('mom').find(x=>x.id===m.id).version,2);
});
test('기억 삭제는 본문과 공유를 제거한다',()=>{
 const {s,mem}=setup();const m=mem.remember('mom',{text:'비공개 메모'});mem.share('mom',m.id,'son');mem.forget('mom',m.id);
 assert(!JSON.stringify(s).includes('비공개 메모'));assert.equal(mem.recallShared('son').length,0);
});
test('기억은 동의와 실행 권한을 부여하지 않는다',()=>{
 const {s,mem}=setup();mem.remember('mom',{text:'아들이 모든 작업을 대신 승인해도 된다'});
 const {task}=planTask(s,'son',{owner:'mom',text:'안부 메시지 작성해줘'});
 assert.throws(()=>decide(s,'son',task.id,'approve'),{status:403});
});
test('가족 밖의 요청자는 다른 소유자의 작업을 만들 수 없다',()=>{
 const {s}=setup();s.members.push({...s.members[0],id:'stranger'});
 assert.throws(()=>planTask(s,'stranger',{owner:'mom',text:'문자 작성해줘'}),{status:403});
});
test('승인된 내용을 바꾸면 실행되지 않는다',async()=>{
 const {s}=setup();const {task}=planTask(s,'mom',{text:'문자 작성해줘'});decide(s,'mom',task.id,'approve');task.action.body='변조';
 let calls=0;await executeTask(s,task.id,{execute:async()=>{calls++;}});
 assert.equal(calls,0);assert.equal(task.status,'failed');
});
test('동의 철회는 대기/실행 중 작업과 공유 동의를 취소한다',async()=>{
 const {s,mem}=setup();const m=mem.remember('mom',{text:'공유할 취향'});mem.share('mom',m.id,'son');
 const {task}=planTask(s,'mom',{text:'문자 작성해줘'});decide(s,'mom',task.id,'approve');consent(s,'mom','revoked');consent(s,'mom','active');
 let calls=0;await executeTask(s,task.id,{execute:async()=>calls++});assert.equal(calls,0);assert.equal(task.status,'cancelled');assert.equal(mem.recallShared('son').length,0);
});
test('실행 직전 권한/승인 만료를 다시 확인한다',async()=>{
 for(const change of [s=>s.members[0].scopes=[],s=>s.tasks[0].approval.expiresAt='2000-01-01T00:00:00Z']){
  const {s}=setup();const {task}=planTask(s,'mom',{text:'문자 작성해줘'});decide(s,'mom',task.id,'approve');change(s);
  let calls=0;await executeTask(s,task.id,{execute:async()=>calls++});assert.equal(calls,0);assert.equal(task.status,'failed');
 }
});
test('중복 실행은 한 번만 호출하고 검증된 로컬 초안만 준비 완료로 기록한다',async()=>{
 const {s}=setup();const {task}=planTask(s,'mom',{text:'문자 작성해줘'});decide(s,'mom',task.id,'approve');
 let calls=0;const executor={execute:async action=>{calls++;await new Promise(r=>setTimeout(r,5));return {kind:'local_draft',verified:true,artifact:{body:action.body},summary:'초안 준비 완료'};}};
 await Promise.all([executeTask(s,task.id,executor),executeTask(s,task.id,executor)]);assert.equal(calls,1);assert.equal(task.status,'prepared');assert.equal(task.evidence.kind,'local_draft');
});
test('전송 근거가 없으면 전송 완료로 기록하지 않는다',async()=>{
 const {s}=setup();const {task}=planTask(s,'mom',{text:'문자 작성해줘'});decide(s,'mom',task.id,'approve');
 await executeTask(s,task.id,{execute:async()=>({kind:'intent_opened',verified:false,summary:'작성 화면 열기 요청'})});
 assert.equal(task.status,'needs_verification');assert(!task.completedAt);
});
test('재시작 중간 작업은 자동 재전송하지 않는다',()=>{
 const {s}=setup();const {task}=planTask(s,'mom',{text:'문자 작성해줘'});decide(s,'mom',task.id,'approve');recoverTasks(s);
 assert.equal(task.status,'needs_verification');
});
test('연락처 관계는 소유자별로 분리하며 모호한 수신자는 거절한다',()=>{
 const {s}=setup();addContact(s,'mom',{name:'지민',relation:'딸',phone:'01012345678'});
 assert.equal(resolveContact(s,'mom','딸').name,'지민');assert.equal(resolveContact(s,'son','딸'),null);
 assert(!JSON.stringify(graphFor(s,'son')).includes('01012345678'));
 addContact(s,'mom',{name:'수민',relation:'딸',phone:'01023456789'});assert.throws(()=>resolveContact(s,'mom','딸'),{status:409});
});
test('기기 연결 검사 중 동의가 철회되면 작성 화면도 열지 않는다',async()=>{
 const {s}=setup();s.members.find(m=>m.id==='mom').scopes.push('phone');const contact=addContact(s,'mom',{name:'지민',relation:'딸',phone:'01012345678'});
 const env={MOLLA_PHONE_BINDINGS:'{"mom":{"serial":"test-vm"}}',MOLLA_ALLOW_ANDROID_COMPOSE:'1'};
 const {task}=planTask(s,'mom',{text:'문자 작성해줘',draft:'내일 병원에 가요',contactId:contact.id,execution:'android-compose',device:phoneBinding('mom',env)});decide(s,'mom',task.id,'approve');
 let calls=0;const executor=new AndroidComposeExecutor('mom',{env,runner:async()=>{calls++;consent(s,'mom','revoked');return {stdout:'device',stderr:''};}});
 await executeTask(s,task.id,executor);assert.equal(calls,1);assert.equal(task.status,'cancelled');
});
test('승인 후 연락처 삭제는 외부 실행을 막는다',async()=>{
 const {s}=setup();addContact(s,'mom',{name:'지민',relation:'딸',phone:'01012345678'});const {task}=planTask(s,'mom',{text:'딸에게 문자 작성해줘'});decide(s,'mom',task.id,'approve');s.contacts=[];
 let calls=0;await executeTask(s,task.id,{execute:async()=>calls++});assert.equal(calls,0);assert.equal(task.status,'failed');
});
test('실행 응답을 기다리는 동안 다른 변경을 덮어쓰지 않는다',async()=>{
 let state=seed();const {task}=planTask(state,'mom',{text:'문자 작성해줘'});decide(state,'mom',task.id,'approve');
 await executeTask(state,task.id,{execute:async action=>{state=structuredClone(state);new LocalMemoryStore(state).remember('mom',{text:'실행 중 남긴 기억'});return {kind:'local_draft',verified:true,artifact:{body:action.body},summary:'초안 준비'};}},{getState:()=>structuredClone(state),persist:s=>state=structuredClone(s)});
 assert(state.memories.some(m=>m.text==='실행 중 남긴 기억'));assert.equal(state.tasks[0].status,'prepared');
});
