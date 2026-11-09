import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import http from 'node:http';

test('HTTP API: 세션 격리·기억 공유·승인·동시 쓰기·입력 검증',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'molla-api-test-'));
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,PORT:'0',MOLLA_HOST:'127.0.0.1',MOLLA_LIVE_MODE:'0',MOLLA_DB:join(dir,'test.sqlite'),MOLLA_CLOUD_BINDINGS:'{}',MOLLA_PHONE_BINDINGS:'{}',MOLLA_PHONE_OWNER:'',MOLLA_PHONE_SERIAL:'',MOLLA_ALLOW_ANDROID_COMPOSE:'0'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let stderr='';child.stderr.on('data',b=>stderr+=b);
 t.after(async()=>{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));const resolved=resolve(dir);assert(resolved.startsWith(resolve(tmpdir()))&&resolved.includes('molla-api-test-'));await rm(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
 const port=await new Promise((done,reject)=>{const timer=setTimeout(()=>reject(new Error(`Server start timeout: ${stderr}`)),10000);let output='';child.stdout.on('data',b=>{output+=b;const m=output.match(/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);done(Number(m[1]));}});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}: ${stderr}`));});});
 const url=`http://127.0.0.1:${port}`;
 async function client(actor='mom'){
  const res=await fetch(url+'/api/state');const cookie=res.headers.get('set-cookie').split(';')[0];
  const api=async(path,body,expected=200,headers={})=>{const r=await fetch(url+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{cookie,...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const result=await r.json();assert.equal(r.status,expected,JSON.stringify(result));return result;};
  if(actor!=='mom')await api('demo/switch',{actor});return {api,cookie};
 }
 const mom=await client(),son=await client('son');
 let memory,contact,task;
 await t.test('사칭한 owner/source를 무시하고 세션 소유자로 기억을 저장한다',async()=>{
  memory=await mom.api('memories',{text:'엄마만 아는 취향',owner:'son',source:{type:'system'}});
  assert.equal(memory.owner,'mom');assert.equal(memory.source.type,'user_statement');
  assert(!(await son.api('state')).memories.some(m=>m.id===memory.id));
  await son.api('memories/search',{owner:'mom'},403);await son.api('memories/correct',{id:memory.id,text:'변조'},403);await son.api('memories/delete',{id:memory.id},403);
 });
 await t.test('특정 기억만 공유되고 철회·정정은 재조회에 즉시 반영된다',async()=>{
  await mom.api('memories/share',{id:memory.id,grantee:'son'});
  assert.equal((await son.api('memories/shared')).memories[0].text,memory.text);
  await mom.api('memories/correct',{id:memory.id,text:'수정한 취향'});assert.equal((await son.api('memories/shared')).memories.length,0);
  await mom.api('memories/share',{id:memory.id,grantee:'son'});await mom.api('memories/revoke',{id:memory.id,grantee:'son'});assert.equal((await son.api('state')).sharedMemories.length,0);
 });
 await t.test('다른 가족에게는 접수증만 반환하며 연락처를 노출하지 않는다',async()=>{
  contact=await mom.api('contacts',{name:'지민',relation:'딸',phone:'01012345678'});
  const result=await son.api('tasks',{owner:'mom',text:'딸에게 내일 병원에 간다고 알려줘'});task=result.task;
  assert.equal(result.task.action,undefined);assert(!JSON.stringify(result).includes(contact.phone));
  const owned=(await mom.api('state')).tasks.find(x=>x.id===task.id);assert.equal(owned.kind,'message');assert.equal(owned.action.recipient.name,'지민');
  assert(!(await son.api('ontology')).contacts.length);
 });
 await t.test('주인만 승인하고 로컬 초안 준비 결과가 저장된다',async()=>{
  await son.api('task/decision',{id:task.id,decision:'approve',actor:'mom'},403);
  await mom.api('task/decision',{id:task.id,decision:'approve'});
  let result;for(let i=0;i<30;i++){result=(await mom.api('state')).tasks.find(x=>x.id===task.id);if(result.status!=='running')break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(result.status,'prepared');assert.equal(result.evidence.kind,'local_draft');assert.match(result.result,/전송은 하지 않았어요/);
  await mom.api('task/decision',{id:task.id,decision:'approve'},409);
 });
 await t.test('도움 범위 변경은 대기 중인 승인을 무효화한다',async()=>{
  const {task}=await mom.api('tasks',{text:'일정 정리해줘'});await mom.api('preferences',{agentName:'몰라',scopes:['message']});
  await mom.api('task/decision',{id:task.id,decision:'approve'},409);
 });
 await t.test('동시 요청의 기억 저장이 서로 덮어쓰지 않는다',async()=>{
  await Promise.all(Array.from({length:12},(_,i)=>mom.api('memories',{text:`동시 저장 ${i}`})));
  assert.equal((await mom.api('state')).memories.filter(m=>m.text.startsWith('동시 저장 ')).length,12);
 });
 await t.test('UTF-8이 청크 사이에서 나뉘어도 한국어가 보존된다',async()=>{
  const payload=Buffer.from(JSON.stringify({text:'분할된 한국어 기억'}));const split=payload.indexOf(Buffer.from('한'))+1;
  const saved=await new Promise((done,reject)=>{const req=http.request(url+'/api/memories',{method:'POST',headers:{cookie:mom.cookie,'content-type':'application/json'}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>done(JSON.parse(data)));});req.on('error',reject);req.write(payload.subarray(0,split));setTimeout(()=>req.end(payload.subarray(split)),15);});
  assert.equal(saved.text,'분할된 한국어 기억');
 });
 await t.test('명시적 연결 없는 기기는 실행하지 않고 외부 origin과 잘못된 입력을 차단한다',async()=>{
  await mom.api('phone/plan',{contactId:contact.id,draft:'안녕하세요'},409);
  await mom.api('phone/diagnose',{},409);
  await mom.api('memories',{text:'CSRF'},403,{origin:'https://attacker.example'});
  await mom.api('memories',{text:'wrong type'},415,{'content-type':'text/plain'});
  await mom.api('memories',null,400);await mom.api('memories',[],400);
  const health=await mom.api('health');assert.equal(health.automaticSending,false);assert.equal(health.memory,'local-sqlite');
 });
 await t.test('철회는 공유를 삭제하고 재동의해도 자동 복원하지 않는다',async()=>{
  await mom.api('memories/share',{id:memory.id,grantee:'son'});await mom.api('consent',{value:'revoked'});await mom.api('consent',{value:'active'});
  assert.equal((await son.api('memories/shared')).memories.length,0);
 });
});
