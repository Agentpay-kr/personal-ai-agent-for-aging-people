// Recording-only server. Synthetic data; never imports LLM, Cloud VM or ADB executors.
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { seed, planTask, planAppTask, decide, consent, snapshot } from './domain.mjs';
import { member, bounded, id, now, DomainError } from './core.mjs';
import { addContact } from './ontology.mjs';
import { LocalMemoryStore } from './memory.mjs';
import { PolicyEngine } from './policy.mjs';

const root=resolve(import.meta.dirname,'..');
const stateFile=process.env.MOLLA_DEMO_STATE||resolve(root,'.data/demo-state.json');
function fresh(){const s=seed();for(const m of s.members){m.consent='active';m.scopes.push('phone');m.cloudAI={enabled:true,includeMemories:false,version:1};}member(s,'son').name='자녀';s.demoPhones={};s.demoRequests=[];
 for(const actor of ['mom','dad','son'])s.demoPhones[actor]={state:'ready',screen:'home',title:'내 Android 공간',body:'이 화면은 데모용 가상 휴대폰입니다.',owner:actor};
 addContact(s,'mom',{name:'지민',relation:'딸',phone:'01000000000'});
 new LocalMemoryStore(s).remember('dad',{text:'오전 산책 후 일정을 확인해요.'});return s;}
let state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):fresh();
const save=()=>{mkdirSync(resolve(stateFile,'..'),{recursive:true});writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});};save();
function runtime(actor){const m=member(state,actor);return {mode:'local-demo',simulation:true,me:{id:actor,name:m.name},llm:{enabled:true,configured:true,model:'demo-script',consented:m.cloudAI.enabled,includeMemories:m.cloudAI.includeMemories,ready:m.consent==='active'&&m.cloudAI.enabled},phone:{configured:true,provider:'local-simulation',phoneId:`demo-${actor}`,state:state.demoPhones[actor].state,actions:['open_app','message_compose'],simulated:true},limits:{vmMaxMinutes:5,vmPricePerMinuteUsd:0},automaticSending:false};}
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function input(req){let length=0,chunks=[];for await(const b of req){length+=b.length;if(length>24000)throw new DomainError('내용이 너무 길어요.',413);chunks.push(b);}try{const v=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!v||typeof v!=='object'||Array.isArray(v))throw 0;return v;}catch{throw new DomainError('요청 형식을 확인해 주세요.');}}
function chat(actor,body){const text=bounded(body.text),requestId=bounded(body.requestId,100);const old=state.demoRequests.find(r=>r.actor===actor&&r.requestId===requestId);if(old){if(old.text!==text)throw new DomainError('요청 식별자가 중복됐어요.',409);return {...old.response,task:old.taskId?state.tasks.find(t=>t.id===old.taskId):null};}
 if(!runtime(actor).llm.ready)throw new DomainError('먼저 데모 대화 도움을 허용해 주세요.',403);
 let response;const device={owner:actor,serial:`simulation-${actor}`,platform:'android',mode:'demo'};
 if(/설정.*열|열.*설정/.test(text)){if(state.demoPhones[actor].state!=='ready')throw new DomainError('가상 휴대폰을 먼저 시작해 주세요.',409);response=planAppTask(state,actor,{text,appId:'settings',device});}
 else if(/병원/.test(text)&&/딸|지민/.test(text)){
  const contact=state.contacts.find(c=>c.owner===actor&&c.relation==='딸');
  response=planTask(state,actor,{text,draft:'지민아, 내일 병원에 다녀올게. 끝나면 연락할게.',contactId:contact?.id,kindHint:'message',execution:contact?'android-compose':'local',device:contact?device:undefined});
 }else response=planTask(state,actor,{text});
 if(response.task){response.task.demo=true;response.task.simulation=true;response.task.summary='데모 · '+response.task.summary;}
 else response.reply=/기억|취향/.test(text)?response.reply:'네, 듣고 있어요. “딸에게 내일 병원에 간다고 알려줘”, “설정 앱 열어줘”라고 부탁해 보세요. 이 대화는 촬영용 시나리오입니다.';
 state.messages.push({id:id(),owner:actor,role:'user',text,at:now()},{id:id(),owner:actor,role:'assistant',text:response.reply,taskId:response.task?.id,at:now()});
 const output={...response,model:'demo-script',simulation:true};state.demoRequests.push({actor,requestId,text,response:{reply:output.reply,model:output.model,simulation:true},taskId:response.task?.id});return output;
}
function approve(actor,body){const task=decide(state,actor,body.id,body.decision);if(body.decision!=='approve')return task;new PolicyEngine(state).execute(task);
 const a=task.action,phone=state.demoPhones[actor];
 if(a.execution?.startsWith('android-')&&phone.state!=='ready')throw new DomainError('가상 휴대폰을 먼저 시작해 주세요.',409);
 if(a.type==='app.open'){Object.assign(phone,{screen:'settings',title:'설정',body:'네트워크 및 인터넷\n연결된 기기\n앱\n알림\n접근성'});task.status='completed';task.result='데모: 내 가상 휴대폰에 설정 화면을 표시했어요. 실제 Android를 조작한 결과가 아닙니다.';}
 else if(a.execution==='android-compose'){Object.assign(phone,{screen:'compose',title:a.recipient.name,recipient:a.recipient.phone,body:a.body});task.status='needs_verification';task.result='데모: 가상 휴대폰에 문자 작성 화면을 표시했어요. 메시지는 전송하지 않았어요.';}
 else {task.status='prepared';task.result='데모: 승인한 내용으로 초안을 준비했어요. 외부 앱 실행·전송은 없어요.';}
 task.step=2;task.finishedAt=now();task.evidence={kind:'simulation',verified:false,simulation:true,summary:task.result};return task;
}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),path=url.pathname;
 const host=new URL('http://'+(req.headers.host||'localhost')).hostname;if(!['localhost','127.0.0.1','[::1]'].includes(host))throw new DomainError('데모는 이 컴퓨터에서만 실행해요.',403);
 const origin=req.headers.origin;if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1):(4317|4319|4321|4323|4324|4325)$/.test(origin))throw new DomainError('허용되지 않은 요청이에요.',403);
 if(origin)res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});return res.end();}
 if(!path.startsWith('/api/')){
  const stage=path==='/stage'||path==='/stage.html';const publicRoot=stage?resolve(root,'demo'):resolve(root,'demo/mobile');const relative=stage?'/stage.html':path;let file=resolve(publicRoot,'.'+decodeURIComponent(relative));if(file!==publicRoot&&!file.startsWith(publicRoot+sep))throw new DomainError('Not found',404);if(!existsSync(file)||!extname(file))file=resolve(publicRoot,'index.html');
  if(!existsSync(file))throw new DomainError('데모 앱을 먼저 빌드해 주세요.',404);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf'};res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});return res.end(readFileSync(file));
 }
 if(path==='/api/health')return send(res,200,{ok:true,mode:'local-demo',simulation:true,externalCalls:false});
 const actor=req.headers.authorization?.match(/^Bearer demo-(mom|dad|son)$/)?.[1];if(!actor)throw new DomainError('데모 가족을 선택해 주세요.',401);
 if(req.method==='GET'){if(path==='/api/state')return send(res,200,{...snapshot(state,actor),mode:'local-demo',simulation:true});if(path==='/api/runtime')return send(res,200,runtime(actor));if(path==='/api/demo/phone')return send(res,200,{...state.demoPhones[actor],simulation:true});throw new DomainError('Not found',404);}
 if(req.method!=='POST')throw new DomainError('Not found',404);const body=await input(req);let result={ok:true,simulation:true};
 // A failed request cannot leave a partially approved demo action behind.
 const before=structuredClone(state);
 try{
  if(path==='/api/chat')result=chat(actor,body);
  else if(path==='/api/task/decision')result=approve(actor,body);
  else if(path==='/api/demo/reset'){state=fresh();}
  else if(path==='/api/ai/consent'){if(typeof body.enabled!=='boolean'||typeof body.includeMemories!=='boolean')throw new DomainError('동의 값을 확인해 주세요.');member(state,actor).cloudAI={enabled:body.enabled,includeMemories:body.enabled&&body.includeMemories,version:member(state,actor).cloudAI.version+1};}
  else if(path==='/api/preferences'){const m=member(state,actor);if(!Array.isArray(body.scopes)||body.scopes.some(x=>!['phone','message','calendar','shopping'].includes(x)))throw new DomainError('권한 값을 확인해 주세요.');m.agentName=bounded(body.agentName,20);m.scopes=[...new Set(body.scopes)];m.policyVersion++;}
  else if(path==='/api/consent'){consent(state,actor,body.value);if(body.value==='revoked')state.demoPhones[actor].state='stopped';}
  else if(path==='/api/contacts')result=addContact(state,actor,body);
  else if(path==='/api/memories')result=new LocalMemoryStore(state).remember(actor,{text:body.text});
  else if(path==='/api/phone/quote'){new PolicyEngine(state).request(actor,actor,'phone');const minutes=body.durationMinutes;if(!Number.isInteger(minutes)||minutes<1||minutes>5)throw new DomainError('1~5분을 선택해 주세요.');result={quoteId:id(),durationMinutes:minutes,estimatedMaxUsd:0,expiresAt:new Date(Date.now()+300000).toISOString(),simulation:true};state.demoPhones[actor].quote=result;}
  else if(path==='/api/phone/start'){new PolicyEngine(state).request(actor,actor,'phone');const phone=state.demoPhones[actor];if(body.quoteId!==phone.quote?.quoteId||Date.parse(phone.quote.expiresAt)<=Date.now())throw new DomainError('데모 시작 안내를 다시 확인해 주세요.',409);delete phone.quote;phone.state='ready';result=runtime(actor).phone;}
  else if(path==='/api/phone/stop'){state.demoPhones[actor].state='stopped';result=runtime(actor).phone;}
  else if(path==='/api/phone/diagnose')result=runtime(actor).phone;
  else throw new DomainError('Not found',404);
  save();return send(res,200,result);
 }catch(e){state=before;throw e;}
 }catch(e){send(res,e.status||500,{error:e.status?e.message:'데모 요청을 처리하지 못했어요.'});}
});
server.listen(Number(process.env.MOLLA_DEMO_PORT||4319),'127.0.0.1',()=>console.log(`Molla recording demo: http://127.0.0.1:${server.address().port} (SIMULATION, no external API/VM)`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
