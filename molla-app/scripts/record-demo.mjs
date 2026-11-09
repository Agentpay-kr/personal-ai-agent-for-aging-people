import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'demo/recordings');await mkdir(out,{recursive:true});
const check=process.argv.includes('--check'),url='http://127.0.0.1:4319';
const reset=await fetch(url+'/api/demo/reset',{method:'POST',headers:{Authorization:'Bearer demo-mom','Content-Type':'application/json'},body:'{}'});if(!reset.ok)throw new Error('Demo server must be running.');
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1,colorScheme:'light',...(check?{}:{recordVideo:{dir:out,size:{width:1600,height:1000}}})});
const page=await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',route=>{const u=new URL(route.request().url());if(['http:','https:'].includes(u.protocol)&&u.hostname!=='127.0.0.1'){external.push(u.origin);return route.abort();}return route.continue();});
const hold=ms=>page.waitForTimeout(check?80:ms);
const caption=async text=>page.locator('#recording-caption').evaluate((el,text)=>el.textContent=text,text);
try {
 await page.goto(url+'/stage',{waitUntil:'domcontentloaded'});const app=page.frameLocator('#app');await expect(app.getByTestId('message-input')).toBeVisible({timeout:30000});await hold(3500);
 await page.screenshot({path:resolve(out,'demo-stage.png')});
 await hold(1700);
 await app.getByTestId('message-input').fill('딸에게 내일 병원에 간다고 알려줘');await hold(2200);await app.getByTestId('send-message').click();await expect(app.getByRole('button',{name:'부탁 내용 확인하기'})).toBeVisible();await hold(3500);
 await caption('받는 사람과 문구, 엄마가 직접 확인해요.');await app.getByRole('button',{name:'부탁 내용 확인하기'}).click();await expect(app.getByRole('button',{name:'확인했어요, 작성 화면 열어 줘'})).toBeVisible();await hold(6000);
 await app.getByRole('button',{name:'확인했어요, 작성 화면 열어 줘'}).click();await expect(page.locator('#phone-body')).toContainText('지민아, 내일 병원에 다녀올게.');await expect(page.locator('#send-label')).toContainText('전송 전');await caption('승인한 내용 그대로. 전송 전 한 번 더 확인해요.');await hold(6000);await page.screenshot({path:resolve(out,'demo-message-result.png')});
 await page.locator('[data-owner="dad"]').click();await expect(app.getByTestId('message-input')).toBeVisible();await caption('아빠에게도, 아빠만의 독립된 공간.');await hold(3000);await app.getByTestId('message-input').fill('설정 앱 열어줘');await hold(2000);await app.getByTestId('send-message').click();await app.getByRole('button',{name:'부탁 내용 확인하기'}).click();await hold(3500);await app.getByRole('button',{name:'확인했어요, 앱 열어 줘'}).click();await expect(page.locator('#phone-title')).toHaveText('설정');await hold(4000);
 await page.locator('[data-owner="son"]').click();await expect(app.getByTestId('message-input')).toBeVisible();await expect(app.getByText('어떤 이야기든,')).toBeVisible();await expect(app.getByText('지민아, 내일 병원에 다녀올게.')).toHaveCount(0);await caption('가족이어도, 다른 사람의 대화는 보이지 않아요.');await hold(4500);
 await page.locator('[data-owner="mom"]').click();await expect(app.getByTestId('message-input')).toBeVisible();await caption('Molla. 내가 선택하고, 가족은 안심하고.');await hold(4500);
 if(errors.length||external.length)throw new Error(JSON.stringify({errors,blockedExternal:external}));
 await writeFile(resolve(out,'verification.json'),JSON.stringify({passed:true,surface:'React Native Web in Edge, desktop recording stage',simulation:true,externalRequests:external,checks:['mom request → exact recipient/content review → approval → simulated compose','no actual sending','dad independent app-opening simulation','son cannot see mom messages','family selection retains separate state'],recorded:!check},null,2));
 console.log(check?'Demo UI check passed.':'Demo recording captured.');
}catch(e){await page.screenshot({path:resolve(out,'demo-failure.png')});throw e;}
finally {await context.close();if(!check){const video=page.video();await video.saveAs(resolve(out,'molla-demo.webm'));console.log(resolve(out,'molla-demo.webm'));}await browser.close();}
