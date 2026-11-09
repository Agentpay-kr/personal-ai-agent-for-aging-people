import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { Client, actionHash, endpoint } from '../lib/client.mjs';
import { validate } from '../lib/operations.mjs';
const run=promisify(execFile),bin=resolve(import.meta.dirname,'../bin/molla.mjs');
async function fixture(fn){
 const root=await mkdtemp(resolve(tmpdir(),'molla-cli-test-')),session=resolve(root,'session.json');
 const calls=[];let changed=false;
 const task={id:'task-1',owner:'mom',requester:'mom',kind:'message',text:'안부 작성',status:'awaiting_approval',action:{body:'안녕하세요',recipient:null,execution:'local'}};
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):{};calls.push({path:req.url,method:req.method,body});
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/health'){res.setHeader('Set-Cookie','molla_session='+ 'a'.repeat(48)+'; HttpOnly');return res.end(JSON.stringify({ok:true}));}
  if(req.url==='/api/state')return res.end(JSON.stringify({me:{id:'mom'},mode:'demo',members:[],tasks:[changed?{...task,action:{...task.action,body:'changed'}}:task],contacts:[]}));
  if(req.url==='/api/tasks'&&body.owner==='dad'){res.statusCode=403;return res.end(JSON.stringify({error:'owner consent required'}));}
  res.end(JSON.stringify({ok:true,task:{id:'task-2'},...body}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 try{await fn({root,session,url,calls,task,change:()=>changed=true});}finally{await new Promise(r=>server.close(r));}
}
test('CLI discovery requires no server and emits one JSON value',async()=>{const {stdout,stderr}=await run(process.execPath,[bin,'capabilities']);const v=JSON.parse(stdout);assert.equal(v.ok,true);assert.ok(v.data.operations.some(o=>o.name==='task.create'));assert.equal(stdout.trim().split('\n').length,1);assert.equal(stderr,'');});
test('unknown routing arguments and injected actor are rejected',()=>{assert.throws(()=>validate('task.create',{text:'hi',actor:'mom'}),/Unknown argument/);assert.throws(()=>validate('shell.exec',{command:'whoami'}),/Unknown operation/);});
test('CLI rejects remote URLs and credentials',()=>{for(const u of ['https://example.com','http://127.0.0.1@evil.test','http://localhost/?token=x','file:///tmp/x'])assert.throws(()=>endpoint(u));});
test('missing session does not create an implicit owner context',async()=>fixture(async({session,url,calls})=>{const c=new Client({baseUrl:url,session});await assert.rejects(c.run('task.create',{text:'hello'}),e=>e.code==='AUTH_REQUIRED');assert.equal(calls.length,0);}));
test('explicit demo login, task creation, owner hash and approval',async()=>fixture(async({session,url,calls})=>{const c=new Client({baseUrl:url,session});await c.login('mom');const saved=JSON.parse(await readFile(session,'utf8'));assert.equal(saved.baseUrl,url);await c.run('task.create',{text:'문자 작성',draft:'안녕하세요'});const t=await c.run('task.get',{id:'task-1'});await c.run('task.decide',{id:t.id,decision:'approve',ownerConfirmed:true,expectedActionHash:t.approval_hash});const decision=calls.find(v=>v.path==='/api/task/decision');assert.deepEqual(decision.body,{id:'task-1',decision:'approve'});}));
test('owner confirmation and changed action block approval before POST',async()=>fixture(async({session,url,calls,task,change})=>{const c=new Client({baseUrl:url,session});await c.login('mom');await assert.rejects(c.run('task.decide',{id:task.id,decision:'approve'}),e=>e.code==='OWNER_CONFIRMATION_REQUIRED');change();await assert.rejects(c.run('task.decide',{id:task.id,decision:'approve',ownerConfirmed:true,expectedActionHash:actionHash(task)}),e=>e.code==='APPROVAL_CHANGED');assert.equal(calls.filter(v=>v.path==='/api/task/decision').length,0);}));
test('session file is bound to its original endpoint',async()=>fixture(async({session,url,calls})=>{await writeFile(session,JSON.stringify({version:1,baseUrl:'http://localhost:1',cookie:'molla_session='+'a'.repeat(48)}));await assert.rejects(new Client({baseUrl:url,session}).run('family.list'),e=>e.code==='AUTH_REQUIRED');assert.equal(calls.length,0);}));
test('server policy rejection is preserved for the router',async()=>fixture(async({session,url})=>{const c=new Client({baseUrl:url,session});await c.login('mom');await assert.rejects(c.run('task.create',{owner:'dad',text:'쌀 주문'}),e=>e.code==='FORBIDDEN'&&e.http_status===403);}));
test('stale identity session is detected before mutation',async()=>fixture(async({session,url,calls})=>{await writeFile(session,JSON.stringify({version:1,baseUrl:url,cookie:'molla_session='+'b'.repeat(48)})); // A fresh server responds with a different Set-Cookie on health.
 const c=new Client({baseUrl:url,session});await c.loadSession();await assert.rejects(c.request('health'),e=>e.code==='AUTH_REQUIRED');assert.equal(calls.filter(v=>v.method==='POST').length,0);}));
test('JSON stdin route preserves correlation and data without shell interpolation',async()=>fixture(async({session,url})=>{const c=new Client({baseUrl:url,session});await c.login('mom');const input={schema_version:'1.0',request_id:'r-1',operation:'task.create',arguments:{text:'문자 작성',draft:'가격은 $5, `문자` 그대로'}};
 const child=spawn(process.execPath,[bin,'route','--input','-','--base-url',url,'--session',session],{stdio:['pipe','pipe','pipe']});let stdout='';child.stdout.on('data',b=>stdout+=b);child.stdin.end(JSON.stringify(input));const code=await new Promise(r=>child.on('exit',r));assert.equal(code,0);const value=JSON.parse(stdout);assert.equal(value.request_id,'r-1');assert.equal(value.data.draft,input.arguments.draft);
}));
test('request_id cannot bypass validation and unknown keys produce usage exit',async()=>{const root=await mkdtemp(resolve(tmpdir(),'molla-cli-bad-'));const file=resolve(root,'request.json');await writeFile(file,JSON.stringify({schema_version:'1.0',operation:'task.create',arguments:{text:'hi',actor:'dad'}}));await assert.rejects(run(process.execPath,[bin,'route','--input',file]),e=>e.code===2&&JSON.parse(e.stdout).error.code==='USAGE');});
test('mutations with unknown network result are never marked safe to retry',async()=>{const c=new Client({baseUrl:'http://127.0.0.1:1',session:'unused',timeoutMs:100});c.cookie='molla_session='+'a'.repeat(48);await assert.rejects(c.request('tasks',{body:{text:'hi'},mutating:true}),e=>e.retryable===false&&e.outcome==='unknown');});
