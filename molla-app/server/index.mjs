import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { seed,member,own,id,log,planTask,decide,tick,consent,snapshot,DomainError,initializeLiveConsent } from './domain.mjs';
import { migrate, graphFor, addContact } from './ontology.mjs';
import { LocalMemoryStore } from './memory.mjs';
import { executeTask, recoverTasks, LocalDraftExecutor } from './orchestrator.mjs';
import { phoneBinding, AndroidComposeExecutor } from './phone.mjs';
import { loginOwner, liveMode, requireTrusted } from './auth.mjs';
import { aiStatus } from './llm.mjs';
import { ChatService } from './chat-service.mjs';
import { PhoneScreenService } from './phone-screen.mjs';
import { CloudVMManager, cloudMappings, phoneRuntime, runtimePhoneEnv, vmLimits } from './cloud-vm.mjs';
const base=resolve(import.meta.dirname,'..');mkdirSync(resolve(base,'.data'),{recursive:true});
const db=new DatabaseSync(process.env.MOLLA_DB||resolve(base,'.data/molla.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, actor TEXT NOT NULL);');
if(!db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='trusted'))db.exec('ALTER TABLE sessions ADD COLUMN trusted INTEGER NOT NULL DEFAULT 0');
if(!db.prepare('SELECT id FROM state WHERE id=1').get())db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(seed({live:liveMode()})));
const load=()=>migrate(JSON.parse(db.prepare('SELECT data FROM state WHERE id=1').get().data));
const save=s=>db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(s));
const recovered=load();if(liveMode())initializeLiveConsent(recovered);recoverTasks(recovered);for(const r of recovered.chatRequests??[])if(r.state==='pending')r.state='failed';for(const v of Object.values(recovered.cloudSessions??{}))if(v.state==='starting')v.state='unknown';save(recovered);
const cloud=new CloudVMManager({load,save}),chat=new ChatService({load,save});
const phoneScreen=new PhoneScreenService({load});
const binding=(s,actor)=>phoneBinding(actor,runtimePhoneEnv(s));
function runtime(s,actor){const ai=aiStatus(),m=member(s,actor);return {mode:liveMode()?'live':'local-demo',actor,me:{id:actor,name:m.name},llm:{...ai,verifiedAt:s.llmVerifiedAt??null,consented:m.cloudAI.enabled,includeMemories:m.cloudAI.includeMemories,ready:!!(ai.enabled&&ai.configured&&ai.model&&m.cloudAI.enabled&&m.consent==='active'),dailyRequestLimit:Number(process.env.MOLLA_LLM_DAILY_REQUEST_LIMIT)||40},phone:{...phoneRuntime(s,actor),connected:!!binding(s,actor),composeEnabled:process.env.MOLLA_ALLOW_ANDROID_COMPOSE==='1',appsEnabled:process.env.MOLLA_ALLOW_ANDROID_APPS==='1'},limits:vmLimits(),automaticSending:false};}
function stopAfterRevocation(actor){if(cloudMappings()[actor])cloud.stop(actor).catch(()=>{const s=load();log(s,actor,'VM 종료 여부를 확인해 주세요','연결 확인 후 종료를 다시 요청해 주세요.');save(s);});}
function send(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));}
async function body(req){
 if(!req.headers['content-type']?.startsWith('application/json'))throw new DomainError('JSON 형식으로 요청해 주세요.',415);
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>24000)throw new DomainError('내용이 너무 길어요.',413);chunks.push(chunk);}
 try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new DomainError('요청 형식이 올바르지 않아요.');}
}
function bounded(v,max=1000){if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new DomainError('내용을 확인해 주세요.');return v.trim();}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');const path=url.pathname;
  if(!path.startsWith('/api/')){
   const root=resolve(base,process.env.MOLLA_WEB_ROOT||'dist');const file=resolve(root,'.'+decodeURIComponent(path));
   if(!file.startsWith(root+ (process.platform==='win32'?'\\':'/'))&&file!==root)throw new DomainError('찾을 수 없어요.',404);
   const actual=existsSync(file)&&extname(file)?file:resolve(root,'index.html');
   if(!existsSync(actual)){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end('molla API ready. Open http://127.0.0.1:4317');}
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json'};
   res.writeHead(200,{'Content-Type':mime[extname(actual)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});return res.end(readFileSync(actual));
  }
  const host=new URL('http://'+(req.headers.host||'localhost')).hostname;
  const hosts=new Set(['localhost','127.0.0.1','[::1]',...(process.env.MOLLA_ALLOWED_HOSTS||'').split(',').filter(Boolean)]);
  if(!hosts.has(host))throw new DomainError('허용된 서버 주소를 사용해 주세요.',403);
  const listeningPort=server.address()?.port;
  const origins=['http://127.0.0.1:4317','http://localhost:4317',`http://127.0.0.1:${listeningPort}`,`http://localhost:${listeningPort}`,...(process.env.MOLLA_ALLOWED_ORIGINS||'').split(',').filter(Boolean)];
  if(req.headers.origin&&!origins.includes(req.headers.origin))throw new DomainError('허용되지 않은 요청이에요.',403);
  if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Credentials','true');}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});return res.end();}
  // Read the body BEFORE the state/session snapshot. No await may split a read-modify-save transaction.
  const input=req.method==='POST'?await body(req):{};
  if(path==='/api/health'&&req.method==='GET'){const ai=aiStatus();return send(res,200,{ok:true,mode:liveMode()?'live':'local-demo',schemaVersion:2,memory:'local-sqlite',llm:ai.enabled&&ai.configured,llmConfigured:ai.configured,automaticSending:false});}
  if(path==='/api/auth/login'&&req.method==='POST'){
   if(!liveMode())throw new DomainError('실제 연결 모드를 먼저 설정해 주세요.',409);
   const actor=loginOwner(input.code);member(load(),actor);const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions(token,actor,trusted) VALUES(?,?,1)').run(token,actor);
   return send(res,200,{ok:true,actor},{'Set-Cookie':`molla_session=${token}; HttpOnly; SameSite=Strict; Path=/`});
  }
  const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split('=')));
  const bearer=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  let token=cookies.molla_session;let session=bearer?{actor:loginOwner(bearer),trusted:1}:token?db.prepare('SELECT actor,trusted FROM sessions WHERE token=?').get(token):null;
  if(req.headers.authorization&&!bearer)throw new DomainError('접속 코드 형식을 확인해 주세요.',401);
  if(liveMode()&&session?.trusted!==1)throw new DomainError('내 개인 접속 코드로 로그인해 주세요.',401);
  if(!session){token=randomBytes(24).toString('hex');session={actor:'mom',trusted:0};db.prepare('INSERT INTO sessions(token,actor,trusted) VALUES(?,?,0)').run(token,session.actor);res.setHeader('Set-Cookie',`molla_session=${token}; HttpOnly; SameSite=Strict; Path=/`);}
  const actor=session.actor;const s=load();tick(s);save(s);const memories=new LocalMemoryStore(s);
  if(path==='/api/state'&&req.method==='GET'){const r=runtime(s,actor);return send(res,200,{...snapshot(s,actor),mode:r.mode,phone:r.phone,runtime:r});}
  if(path==='/api/runtime'&&req.method==='GET')return send(res,200,runtime(s,actor));
  if(path==='/api/phone/screen'&&req.method==='GET'){
   const authorize=()=>{const current=bearer?{actor:loginOwner(bearer),trusted:1}:db.prepare('SELECT actor,trusted FROM sessions WHERE token=?').get(token);requireTrusted(current);if(current.actor!==actor)throw new DomainError('로그인이 바뀌었어요.',401);};
   return send(res,200,await phoneScreen.capture(actor,authorize));
  }
  if(path==='/api/ontology'&&req.method==='GET')return send(res,200,graphFor(s,actor));
  if(path==='/api/memories/shared'&&req.method==='GET')return send(res,200,{memories:memories.recallShared(actor)});
  if(req.method!=='POST')throw new DomainError('찾을 수 없어요.',404);
  let result={ok:true},runTask=null,stopVM=false;
  if(path==='/api/auth/logout'){if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(token);return send(res,200,{ok:true},{'Set-Cookie':'molla_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  else if(path==='/api/demo/switch'){if(liveMode()||bearer)throw new DomainError('실제 모드에서는 사용자를 전환할 수 없어요.',403);member(s,input.actor);db.prepare('UPDATE sessions SET actor=? WHERE token=?').run(input.actor,token);return send(res,200,{ok:true});}
  else if(path==='/api/ai/consent'){
   requireTrusted(session);if(typeof input.enabled!=='boolean'||typeof input.includeMemories!=='boolean')throw new DomainError('AI 동의 설정을 확인해 주세요.');
   const m=member(s,actor);m.cloudAI={enabled:input.enabled,includeMemories:input.enabled&&input.includeMemories,version:(m.cloudAI?.version??0)+1};log(s,actor,input.enabled?'AI 대화에 동의했어요':'AI 대화 동의를 철회했어요');result=m.cloudAI;
  }
  else if(path==='/api/chat'||(path==='/api/tasks'&&liveMode())){
   requireTrusted(session);if(input.owner&&input.owner!==actor)throw new DomainError('AI 대화는 본인 실행 공간에서 부탁해 주세요.',403);
   const guard=()=>{const current=bearer?{actor:loginOwner(bearer),trusted:1}:db.prepare('SELECT actor,trusted FROM sessions WHERE token=?').get(token);requireTrusted(current);if(current.actor!==actor)throw new DomainError('로그인이 바뀌었어요.',401);};
   return send(res,200,await chat.send(actor,{text:input.text,requestId:input.requestId},guard));
  }
  else if(path==='/api/phone/quote'){requireTrusted(session);return send(res,200,cloud.quote(actor,input.durationMinutes));}
  else if(path==='/api/phone/start'){requireTrusted(session);return send(res,200,await cloud.start(actor,input.quoteId));}
  else if(path==='/api/phone/stop'){requireTrusted(session);return send(res,200,await cloud.stop(actor));}
  else if(path==='/api/tasks'){
   const text=bounded(input.text);result=planTask(s,actor,{owner:input.owner||actor,text,draft:input.draft,contactId:input.contactId});
   if((input.owner||actor)===actor){s.messages.push({id:id(),owner:actor,role:'user',text,at:new Date().toISOString()},{id:id(),owner:actor,role:'assistant',text:result.reply,at:new Date().toISOString(),taskId:result.task?.id});}
  }
  else if(path==='/api/task/decision'){
   if(!['approve','reject','cancel'].includes(input.decision))throw new DomainError('잘못된 선택이에요.');
   if(input.decision==='approve'&&s.tasks.find(t=>t.id===input.id)?.action?.execution?.startsWith('android-'))requireTrusted(session);
   result=decide(s,actor,input.id,input.decision);if(input.decision==='approve')runTask=result.id;
  }
  else if(path==='/api/consent'){
   if(!['active','revoked'].includes(input.value))throw new DomainError('잘못된 선택이에요.');consent(s,actor,input.value);if(input.value==='revoked'){member(s,actor).cloudAI={enabled:false,includeMemories:false,version:member(s,actor).cloudAI.version+1};stopVM=true;}
  }
  else if(path==='/api/preferences'){
   const m=member(s,actor);m.agentName=bounded(input.agentName,20);
   if(!Array.isArray(input.scopes)||input.scopes.some(v=>!['shopping','calendar','message','phone'].includes(v)))throw new DomainError('잘못된 권한이에요.');
   const nextScopes=[...new Set(input.scopes)];if(JSON.stringify([...m.scopes].sort())!==JSON.stringify([...nextScopes].sort())){m.policyVersion++;for(const t of s.tasks)if(t.owner===actor&&['running','awaiting_approval'].includes(t.status))t.status='cancelled';}
   stopVM=m.scopes.includes('phone')&&!nextScopes.includes('phone');m.scopes=nextScopes;tick(s);log(s,actor,'몰라 설정을 바꿨어요');
  }
  else if(path==='/api/memories'){
   result=memories.remember(actor,{text:input.text});
  }
  else if(path==='/api/memories/delete'){
   memories.forget(actor,input.id);
  }
  else if(path==='/api/memories/correct')result=memories.correct(actor,input.id,input.text);
  else if(path==='/api/memories/search')result={memories:memories.recall(actor,{owner:input.owner||actor,query:typeof input.query==='string'?input.query:''})};
  else if(path==='/api/memories/share')memories.share(actor,input.id,input.grantee);
  else if(path==='/api/memories/revoke')memories.revokeShare(actor,input.id,input.grantee);
  else if(path==='/api/contacts')result=addContact(s,actor,input);
  else if(path==='/api/contacts/delete'){
   const c=s.contacts.find(c=>c.id===input.id);if(!c)throw new DomainError('연락처를 찾을 수 없어요.',404);own(actor,c.owner);s.contacts=s.contacts.filter(c=>c.id!==input.id);log(s,actor,'연락처를 삭제했어요');
  }
  else if(path==='/api/phone/plan'){
   const device=binding(s,actor);if(!device||process.env.MOLLA_ALLOW_ANDROID_COMPOSE!=='1')throw new DomainError('내 Android 실행 공간을 먼저 연결해 주세요.',409);requireTrusted(session);
   if(!member(s,actor).scopes.includes('phone'))throw new DomainError('Android 실행 권한을 먼저 허용해 주세요.',403);
   result=planTask(s,actor,{text:'문자 작성 화면 열기',draft:bounded(input.draft),contactId:bounded(input.contactId,100),execution:'android-compose',device});
  }
  else if(path==='/api/connections'){
   if(!['coupang','google','kakao'].includes(input.app))throw new DomainError('지원하지 않는 앱이에요.');
   if(member(s,actor).consent!=='active')throw new DomainError('먼저 도움을 수락해 주세요.',403);
   const c=s.connections.find(c=>c.owner===actor&&c.app===input.app);
   if(c)s.connections=s.connections.filter(v=>v!==c);else s.connections.push({id:id(),owner:actor,app:input.app,status:'demo',at:new Date().toISOString()});
   log(s,actor,c?'체험 연결을 해제했어요':'체험 연결을 추가했어요',input.app);
  }
  else if(path==='/api/invites'){
   const inv={id:id(),code:randomBytes(4).toString('hex').toUpperCase(),name:bounded(input.name,20),createdBy:actor,expiresAt:new Date(Date.now()+86400000).toISOString(),used:false};s.invites.push(inv);result=inv;
  }
  else if(path==='/api/invites/accept'){
   if(liveMode())throw new DomainError('운영자에게 새 가족의 개인 접속 코드 발급을 요청해 주세요.',409);
   const inv=s.invites.find(i=>i.code===String(input.code).toUpperCase()&&!i.used&&Date.parse(i.expiresAt)>Date.now());if(!inv)throw new DomainError('초대 코드가 만료되었거나 올바르지 않아요.');
   const next={id:id(),name:inv.name,initial:inv.name.slice(0,1),color:'peach',consent:'pending',agentName:'몰라',role:'owner',subtitle:'가족이 준비한 작은 친구',vm:id(),scopes:['shopping','calendar','message'],policyVersion:1};s.members.push(next);
   let family=s.families.find(f=>f.members.includes(inv.createdBy));if(!family){family={id:id(),name:'우리 가족',members:[inv.createdBy]};s.families.push(family);}family.members.push(next.id);
   inv.used=true;save(s);db.prepare('UPDATE sessions SET actor=? WHERE token=?').run(next.id,token);return send(res,200,{ok:true});
  }
  else if(path==='/api/phone/diagnose'){
   if(cloudMappings()[actor]){requireTrusted(session);return send(res,200,await cloud.diagnose(actor));}
   const device=binding(s,actor);if(!device)throw new DomainError('이 사용자의 Android 실행 공간이 아직 연결되지 않았어요. 연결 안내를 확인해 주세요.',409);requireTrusted(session);
   if(member(s,actor).consent!=='active')throw new DomainError('주인의 동의가 필요해요.',403);
   try{const {stdout}=await promisify(execFile)(process.env.MOLLA_PYTHON||'python',[resolve(base,'workers/phone_bridge.py'),'diagnose'],{timeout:15000,maxBuffer:100000,windowsHide:true,env:{...process.env,MOLLA_PHONE_OWNER:actor,MOLLA_PHONE_SERIAL:device.serial,PHONE_HARNESS_TELEMETRY:'0',DO_NOT_TRACK:'1'}});return send(res,200,JSON.parse(stdout));}catch{throw new DomainError('휴대폰 진단에 실패했어요. Python·ADB와 기기 연결을 확인해 주세요.',503);}
  }
  else throw new DomainError('찾을 수 없어요.',404);
  save(s);send(res,200,result);
  if(stopVM)queueMicrotask(()=>stopAfterRevocation(actor));
  if(runTask)queueMicrotask(()=>{
   const fresh=load(),task=fresh.tasks.find(t=>t.id===runTask);
   const executor=task?.action?.execution?.startsWith('android-')?new AndroidComposeExecutor(task.owner,{getEnv:()=>runtimePhoneEnv(load())}):new LocalDraftExecutor();
   executeTask(fresh,runTask,executor,{getState:load,persist:save}).catch(e=>console.error('Task persistence failed:',e.message));
  });
 }catch(e){send(res,e.status||500,{error:e.status?e.message:'잠시 문제가 생겼어요. 다시 시도해 주세요.'});if(!e.status)console.error(e);}
});
const listenHost=process.env.MOLLA_HOST||'127.0.0.1';
if(!['127.0.0.1','localhost','::1'].includes(listenHost)&&(!liveMode()||!existsSync(process.env.MOLLA_OWNER_AUTH_FILE||resolve(base,'.data/owner-auth.json'))))throw new Error('LAN binding requires live owner authentication.');
server.listen(Number(process.env.PORT??4318),listenHost,()=>console.log(`molla API: http://127.0.0.1:${server.address().port} (${liveMode()?'live':'local demo'}; bind ${listenHost})`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
