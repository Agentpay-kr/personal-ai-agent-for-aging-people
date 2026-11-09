import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '../lib/client.mjs';
import { invokeMolla } from '../docs/router-example.mjs';
const app=resolve(process.env.MOLLA_TEST_APP_DIR||resolve(import.meta.dirname,'../../molla-app'));
test('CLI routes through a real isolated Molla API and preserves ownership', {skip:!existsSync(resolve(app,'server/index.mjs')),timeout:20000},async()=>{
 const root=await mkdtemp(resolve(tmpdir(),'molla-cli-api-'));await mkdir(resolve(root,'app'),{recursive:true});
 await cp(resolve(app,'server'),resolve(root,'app/server'),{recursive:true});
 const child=spawn(process.execPath,[resolve(root,'app/server/index.mjs')],{cwd:root,env:{...process.env,PORT:'0',MOLLA_DB:resolve(root,'db.sqlite'),MOLLA_PHONE_BINDINGS:'{}',MOLLA_PHONE_OWNER:'',MOLLA_PHONE_SERIAL:'',MOLLA_ALLOW_ANDROID_COMPOSE:'0'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 const exit=new Promise(r=>child.once('exit',r));
 try{
  const url=await new Promise((res,rej)=>{let out='';const timer=setTimeout(()=>rej(new Error('API startup timeout')),7000);child.once('error',rej);child.stdout.on('data',b=>{out+=b;const m=out.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);res(m[0]);}});});
  const mom=new Client({baseUrl:url,session:resolve(root,'mom.json')}),son=new Client({baseUrl:url,session:resolve(root,'son.json')});
  await mom.login('mom');await son.login('son');
  await mom.run('memory.remember',{text:'라우팅 테스트 전용 기억'});
  const privateSearch=await son.run('memory.search',{query:'라우팅 테스트'});assert.equal(privateSearch.memories.length,0);
  const request=await son.run('task.create',{owner:'mom',text:'쌀 10kg 주문 준비해줘'});assert.equal(request.task.owner,'mom');assert.equal(request.task.action,undefined);
  const t=await mom.run('task.get',{id:request.task.id});assert.equal(t.status,'awaiting_approval');assert.ok(t.action);
  await assert.rejects(son.request('task/decision',{body:{id:t.id,decision:'approve'},mutating:true}),e=>e.code==='FORBIDDEN');
  await mom.run('task.decide',{id:t.id,decision:'approve',ownerConfirmed:true,expectedActionHash:t.approval_hash});
  let done;for(let i=0;i<20;i++){done=await mom.run('task.get',{id:t.id});if(done.status!=='running')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(done.status,'prepared');assert.equal(done.evidence.kind,'local_draft');assert.equal(done.evidence.verified,true);
  const routed=await invokeMolla({cliPath:resolve(import.meta.dirname,'../bin/molla.mjs'),baseUrl:url,sessionFile:resolve(root,'mom.json'),request:{schema_version:'1.0',request_id:'real-api-1',operation:'task.get',arguments:{id:t.id}}});
  assert.equal(routed.exitCode,0);assert.equal(routed.result.request_id,'real-api-1');assert.equal(routed.result.data.status,'prepared');
  await mom.run('consent.set',{value:'revoked',ownerConfirmed:true});await assert.rejects(son.run('task.create',{owner:'mom',text:'쌀 주문'}),e=>e.code==='FORBIDDEN');
 }finally{child.kill();await exit;}
});
