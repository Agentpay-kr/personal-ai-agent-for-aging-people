import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneBinding, composeCommand, AndroidComposeExecutor } from '../server/phone.mjs';
const env={MOLLA_PHONE_BINDINGS:JSON.stringify({mom:{serial:'127.0.0.1:5555',mode:'cloud'},dad:{serial:'127.0.0.1:5557',mode:'cloud'}}),MOLLA_ALLOW_ANDROID_COMPOSE:'1'};
const action=()=>({type:'message.draft',body:'내일 병원에 가요.',recipient:{phone:'01012345678'},execution:'android-compose',device:phoneBinding('mom',env)});
test('기기 설정은 소유자를 분리하며 중복 VM 배정은 거절한다',()=>{
 assert.notEqual(phoneBinding('mom',env).serial,phoneBinding('dad',env).serial);assert.equal(phoneBinding('son',env),null);
 assert.throws(()=>phoneBinding('mom',{MOLLA_PHONE_BINDINGS:'{"mom":{"serial":"same"},"dad":{"serial":"same"}}'}),{status:503});
 assert.throws(()=>phoneBinding('mom',{MOLLA_PHONE_BINDINGS:'invalid'}),{status:503});
});
test('Android는 지정된 VM에 작성 화면만 열고 전송 성공을 주장하지 않는다',async()=>{
 const calls=[];const executor=new AndroidComposeExecutor('mom',{env,runner:async(cmd,args)=>{calls.push({cmd,args});return {stdout:args.includes('get-state')?'device\n':'Status: ok\n',stderr:''};}});
 const evidence=await executor.execute(action());assert.equal(evidence.kind,'intent_opened');assert.equal(evidence.verified,false);
 assert.equal(calls.length,2);assert(calls.every(c=>c.args[1]==='127.0.0.1:5555'));assert.match(calls[1].args[3],/android.intent.action.SENDTO/);assert(!calls[1].args[3].includes('input tap'));
});
test('꺼진 기능/변경된 기기/다른 소유자는 ADB 호출 전에 차단한다',async()=>{
 for(const [owner,config] of [['mom',{...env,MOLLA_ALLOW_ANDROID_COMPOSE:'0'}],['dad',env],['mom',{...env,MOLLA_PHONE_BINDINGS:'{"mom":{"serial":"other"}}'}]]){
  let called=false;const executor=new AndroidComposeExecutor(owner,{env:config,runner:async()=>{called=true;}});
  await assert.rejects(executor.execute(action()),{status:403});assert.equal(called,false);
 }
});
test('ADB 오류/연결 끊김은 결과 근거로 인정하지 않는다',async()=>{
 for(const response of ['offline','Error: Activity not found']){
  const executor=new AndroidComposeExecutor('mom',{env,runner:async(cmd,args)=>({stdout:response==='offline'?response:args.includes('get-state')?'device':response,stderr:''})});
  await assert.rejects(executor.execute(action()));
 }
});
test('메시지의 셸 문자는 따옴표로 보존하고 전화번호 주입은 거절한다',()=>{
 const a=action();a.body="안녕'; echo hacked; $(whoami)";assert.match(composeCommand(a),/sms_body '안녕'\\''; echo hacked; \$\(whoami\)'$/);
 a.recipient.phone='010;id';assert.throws(()=>composeCommand(a),{status:400});
});
