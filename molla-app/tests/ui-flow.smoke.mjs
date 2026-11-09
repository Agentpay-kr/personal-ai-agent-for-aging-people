// Run after pnpm build: node --test tests/ui-flow.smoke.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('브라우저: 요청 → 승인 → 저장된 초안 표시 → 사용자 격리',{timeout:45000},async t=>{
 const cwd=resolve(import.meta.dirname,'..'),dir=await mkdtemp(join(tmpdir(),'molla-browser-test-'));
 const server=spawn(process.execPath,['server/index.mjs'],{cwd,env:{...process.env,PORT:'0',MOLLA_DB:join(dir,'browser.sqlite'),MOLLA_PHONE_BINDINGS:'{}',MOLLA_PHONE_OWNER:'',MOLLA_PHONE_SERIAL:'',MOLLA_ALLOW_ANDROID_COMPOSE:'0'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 t.after(async()=>{server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));const path=resolve(dir);assert(path.startsWith(resolve(tmpdir()))&&path.includes('molla-browser-test-'));await rm(path,{recursive:true,force:true,maxRetries:3});});
 const port=await new Promise((done,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('server timeout')),10000);server.stdout.on('data',b=>{out+=b;const m=out.match(/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);done(m[1]);}});server.once('error',reject);});
 const browser=await chromium.launch({headless:true,...(process.env.MOLLA_TEST_BROWSER?{channel:process.env.MOLLA_TEST_BROWSER}:{})});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}`);
 await page.getByLabel('몰라에게 부탁하기',{exact:true}).fill('딸에게 내일 병원에 간다고 알려줘');
 await page.getByRole('button',{name:'부탁 보내기',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 assert.match(await dialog.innerText(),/딸에게 내일 병원에 간다고 알려줘/);
 await dialog.getByText('내일 병원에 가요.',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'좋아요, 도와줘요',exact:true}).click();
 await dialog.getByText('초안 준비 완료',{exact:true}).waitFor({timeout:10000});
 assert.match(await dialog.innerText(),/실제 주문·예약·메시지 전송은 하지 않았어요/);
 const state=await page.request.get(`http://127.0.0.1:${port}/api/state`).then(r=>r.json());
 assert.equal(state.tasks[0].status,'prepared');assert.equal(state.tasks[0].evidence.kind,'local_draft');
 const evidenceDir=join(cwd,'test-results');await mkdir(evidenceDir,{recursive:true});await page.screenshot({path:join(evidenceDir,'agent-approved-draft.png'),fullPage:true});
 await dialog.getByRole('button',{name:'확인했어요',exact:true}).click();
 await page.getByRole('button',{name:'체험 사용자 바꾸기',exact:true}).click();
 await page.getByRole('dialog').getByRole('button').filter({hasText:'나의 공간'}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 const other=await page.request.get(`http://127.0.0.1:${port}/api/state`).then(r=>r.json());assert.equal(other.me.id,'son');assert.equal(other.tasks.length,0);assert.equal(other.memories.length,0);
 assert.deepEqual(errors,[]);
});
