// Read-only UI/setup check. Never enables consent, calls an LLM or starts a VM.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
const root=resolve(import.meta.dirname,'..'),url='http://127.0.0.1:4318';
const env=parseEnv(await readFile(resolve(root,'.env'),'utf8'));
const owners=Object.fromEntries((await readFile(resolve(root,'.data/owner-access.txt'),'utf8')).trim().split(/\r?\n/).map(line=>line.split(': ')));
const states=[];
for(const [actor,token] of Object.entries(owners)){
 const headers={Authorization:`Bearer ${token}`};const runtime=await(await fetch(url+'/api/runtime',{headers})).json();const state=await(await fetch(url+'/api/state',{headers})).json();assert.equal(runtime.mode,'live');assert.equal(runtime.actor,actor);assert.equal(runtime.llm.provider,'letsur');assert.equal(runtime.llm.configured,true);assert.equal(runtime.phone.configured,actor==='mom');
 states.push({actor,consent:state.me.consent,model:runtime.llm.model,vmConfigured:runtime.phone.configured,vmState:runtime.phone.state});
}
const js=resolve(root,'live/mobile/_expo/static/js/web');const secrets=Object.entries(env).filter(([key,value])=>/KEY|TOKEN/.test(key)&&value.length>10).map(([,value])=>value).concat(Object.values(owners));
for(const file of await readdir(js)){if(!file.endsWith('.js'))continue;const source=await readFile(resolve(js,file),'utf8');assert(!secrets.some(secret=>source.includes(secret)),'A secret must never be included in the mobile bundle');}
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}});
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await expect(page.getByTestId('server-url')).toHaveValue(url);await page.getByTestId('connection-token').fill(owners.mom);await page.getByTestId('connect-account').click();
 if(states.find(s=>s.actor==='mom').consent==='pending')await expect(page.getByRole('button',{name:/함께|수락|시작/}).first()).toBeVisible();else await expect(page.getByTestId('message-input')).toBeVisible();
 await mkdir(resolve(root,'docs/live/screenshots'),{recursive:true});await page.screenshot({path:resolve(root,'docs/live/screenshots/live-owner-setup.png')});
 const report={passed:true,checkedAt:new Date().toISOString(),readOnly:true,modelCalls:0,vmStarts:0,bundledSecrets:false,localMobileUrl:url,states};
 await writeFile(resolve(root,'docs/live/live-setup-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch{console.error('Live setup UI verification failed; no credentials printed.');process.exitCode=1;}finally{await browser.close();}
