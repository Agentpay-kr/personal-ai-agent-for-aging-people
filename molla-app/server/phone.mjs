import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DomainError, bounded } from './core.mjs';
const run = promisify(execFile);
export const PHONE_APPS=Object.freeze({settings:{name:'설정',package:'com.android.settings'},browser:{name:'Chrome',package:'com.android.chrome'},kakao:{name:'카카오톡',package:'com.kakao.talk'},coupang:{name:'쿠팡',package:'com.coupang.mobile'},calendar:{name:'캘린더',package:'com.google.android.calendar'}});
export function adbPath(env=process.env){const local=resolve(import.meta.dirname,'../.tools/platform-tools/adb.exe');return env.MOLLA_ADB&&env.MOLLA_ADB!=='adb'?env.MOLLA_ADB:existsSync(local)?local:'adb';}

export function phoneBinding(actor,env=process.env){
 let bindings={};try{bindings=JSON.parse(env.MOLLA_PHONE_BINDINGS||'{}');}catch{throw new DomainError('서버의 기기 연결 설정을 확인해 주세요.',503);}
 if(!bindings||typeof bindings!=='object'||Array.isArray(bindings))throw new DomainError('서버의 기기 연결 설정을 확인해 주세요.',503);
 const configured=Object.hasOwn(bindings,actor)?bindings[actor]:null;
 const serial=configured?.serial||(env.MOLLA_PHONE_OWNER===actor?env.MOLLA_PHONE_SERIAL:null);
 if(!serial)return null;
 if(configured?.expiresAt&&(!Number.isFinite(Date.parse(configured.expiresAt))||Date.parse(configured.expiresAt)<=Date.now()))return null;
 if(typeof serial!=='string'||serial.length>200||!/^[-A-Za-z0-9_.:\[\]]+$/.test(serial))throw new DomainError('서버의 기기 식별자를 확인해 주세요.',503);
 const otherBindings=Object.entries(bindings).filter(([owner])=>owner!==actor).map(([,value])=>value?.serial);
 if(env.MOLLA_PHONE_OWNER&&env.MOLLA_PHONE_OWNER!==actor)otherBindings.push(env.MOLLA_PHONE_SERIAL);
 if(otherBindings.includes(serial))throw new DomainError('한 Android 실행 공간을 여러 사용자에게 배정할 수 없어요.',503);
 return {owner:actor,serial,platform:'android',mode:configured?.mode==='local'?'local':'cloud',...(configured?.sessionId?{sessionId:configured.sessionId,phoneId:configured.phoneId,expiresAt:configured.expiresAt}:{})};
}
// adb shell itself parses a command. execFile alone is not enough to quote its arguments.
export const shellQuote = value => "'"+value.replace(/'/g,"'\\''")+"'";
export function composeCommand(action){
 const body=bounded(action.body,1000),phone=action.recipient?.phone;
 if(!/^\+?\d{8,15}$/.test(phone||'')||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body))throw new DomainError('수신자와 메시지 내용을 확인해 주세요.');
 return `am start -W -a android.intent.action.SENDTO -d ${shellQuote('smsto:'+phone)} --es sms_body ${shellQuote(body)}`;
}
export class AndroidComposeExecutor {
 constructor(owner,{env=process.env,runner=run,getEnv=()=>env}={}){this.owner=owner;this.env=env;this.getEnv=getEnv;this.runner=runner;}
 async execute(action,{authorize=()=>{}}={}){
  const env=this.getEnv(),binding=phoneBinding(this.owner,env),compose=action.type==='message.draft'&&action.execution==='android-compose',open=action.type==='app.open'&&action.execution==='android-app'&&Object.hasOwn(PHONE_APPS,action.appId);
  if((compose?env.MOLLA_ALLOW_ANDROID_COMPOSE!=='1':env.MOLLA_ALLOW_ANDROID_APPS!=='1')||!binding||(!compose&&!open)||JSON.stringify(binding)!==JSON.stringify(action.device))throw new DomainError('기기 설정이 바뀌었거나 실행 기능이 꺼져 있어요.',403);
  const options={timeout:15000,maxBuffer:64000,windowsHide:true};
  const adb=adbPath(env);const {stdout:state}=await this.runner(adb,['-s',binding.serial,'get-state'],options);
  if(state.trim()!=='device')throw new DomainError('Android 실행 공간이 연결되어 있지 않아요.',409);
  let component;
  if(open){const {stdout}=await this.runner(adb,['-s',binding.serial,'shell',`cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p ${PHONE_APPS[action.appId].package}`],options);component=stdout.trim().split(/\r?\n/).at(-1);if(!/^[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+$/.test(component)||component.split('/')[0]!==PHONE_APPS[action.appId].package)throw new DomainError('이 실행 공간에 해당 앱이 설치되어 있지 않아요.',409);}
  authorize(); // Recheck after the asynchronous connection probe, immediately before the side effect.
  const latest=this.getEnv();if(JSON.stringify(phoneBinding(this.owner,latest))!==JSON.stringify(binding)||(compose?latest.MOLLA_ALLOW_ANDROID_COMPOSE!=='1':latest.MOLLA_ALLOW_ANDROID_APPS!=='1'))throw new DomainError('기기 연결이나 허용 설정이 변경되었어요.',403);
  const {stdout,stderr}=await this.runner(adb,['-s',binding.serial,'shell',compose?composeCommand(action):`am start -W -n ${shellQuote(component)}`],options);
  if(!/Status:\s*ok/i.test(stdout)||/Error:|Exception/i.test(stdout+'\n'+stderr))throw new DomainError('요청한 앱 화면을 열지 못했어요.',503);
  if(open){
   const {stdout:foreground}=await this.runner(adb,['-s',binding.serial,'shell','dumpsys activity activities'],options);
   const pkg=PHONE_APPS[action.appId].package;const verified=foreground.split(/\r?\n/).some(line=>/mResumedActivity|topResumedActivity/.test(line)&&line.includes(pkg+'/'));
   return {kind:'app_opened',verified,package:pkg,device:binding.serial,summary:verified?`${PHONE_APPS[action.appId].name} 앱이 열린 것을 확인했어요.`:'앱을 열었지만 화면을 확인하지 못했어요. 실행 공간에서 확인해 주세요.'};
  }
  return {kind:'intent_opened',verified:false,device:binding.serial,summary:'Android에 문자 작성 화면 열기를 요청했어요. 전송하지 않았어요. 휴대폰에서 수신자·내용과 전송 여부를 직접 확인해 주세요.'};
 }
}
