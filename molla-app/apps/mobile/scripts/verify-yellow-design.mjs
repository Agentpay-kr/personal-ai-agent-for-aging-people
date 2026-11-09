import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { palettes } from '../src/design/tokens.ts';

const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const output = fileURLToPath(new URL('../../../docs/design/screenshots/yellow/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.MOLLA_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
const errors = [], checks = [], targets = [];
const state = {
  me: { id:'design', name:'현수님', initial:'현', role:'owner', consent:'active', agentName:'몰라', scopes:['message','calendar'] },
  members: [{id:'design',name:'현수',initial:'현',role:'owner',consent:'active'}],
  messages: [
    {id:'user-1',role:'user',text:'엄마한테 안부 전하고 싶어'},
    {id:'assistant-1',role:'assistant',text:'좋아요. 이렇게 보내면 어떨까요?'},
    {id:'assistant-2',role:'assistant',text:'엄마, 오늘 하루 어때요?\n문득 생각나서 연락했어요.\n오늘도 맛있는 거 꼭 챙겨 드세요.'},
  ], tasks:[], memories:[], contacts:[],
};
const runtime = { mode:'live', me:state.me, llm:{enabled:true,configured:true,model:'design-fixture',consented:true,includeMemories:false,ready:true}, phone:{configured:false,state:'stopped'},limits:{vmMaxMinutes:5,vmPricePerMinuteUsd:.05} };
function luminance(hex) { const c = hex.slice(1).match(/../g).map(n => parseInt(n,16)/255).map(n => n<=.04045?n/12.92:((n+.055)/1.055)**2.4); return c[0]*.2126+c[1]*.7152+c[2]*.0722; }
const contrasts = [];
for (const [theme,p] of Object.entries(palettes)) for (const [fg,bg] of [['ink','canvas'],['ink','quiet'],['muted','canvas'],['muted','quiet'],['accentInk','accent'],['onAction','action'],['danger','surface']]) {
  const a=luminance(p[fg]),b=luminance(p[bg]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  contrasts.push({theme,fg,bg,ratio:Number(ratio.toFixed(2))}); assert.ok(ratio>=4.5,`${theme} ${fg}/${bg}: ${ratio}`);
}
try {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page = await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://design.molla.test/api/**',async route=>{
    const endpoint=new URL(route.request().url()).pathname;
    let value;
    if(endpoint==='/api/state') value=state;
    else if(endpoint==='/api/runtime') value=runtime;
    else if(endpoint==='/api/chat') {
      const body=route.request().postDataJSON();
      state.messages.push({id:'sent',role:'user',text:body.text},{id:'reply',role:'assistant',text:'화면 검증용 응답입니다.'});
      value={reply:'화면 검증용 응답입니다.'};
    } else return route.fulfill({status:404,body:'{}'});
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  });
  await page.goto(process.env.MOLLA_PREVIEW_URL||'http://127.0.0.1:4323');
  await page.getByTestId('server-url').fill('https://design.molla.test');
  await page.getByTestId('connection-token').fill('design-fixture-key');
  await page.getByTestId('connect-account').click();
  await expect(page.getByTestId('message-input')).toBeVisible();
  async function capture(name) {
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:path.join(output,`${name}.png`)});
    const result=await page.locator('[role="button"], [role="tab"], [role="radio"]').evaluateAll(elements=>elements.filter(el=>{
      const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return !el.closest('[aria-hidden="true"]')&&el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&hit&&el.contains(hit);
    }).map(el=>{const r=el.getBoundingClientRect();return{label:el.getAttribute('aria-label')||el.textContent,width:r.width,height:r.height};}));
    targets.push({screen:name,targets:result});
    for(const t of result) assert.ok(t.width>=48&&t.height>=48,`${name}: ${t.label} ${t.width}x${t.height}`);
  }
  for(const size of [{width:390,height:844},{width:360,height:800},{width:320,height:700}]) {
    await page.setViewportSize(size);
    await page.getByTestId('nav-chat').click(); await capture(`chat-${size.width}`);
    await page.getByTestId('nav-home').click(); await capture(`explore-${size.width}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'가족',exact:true}).click();
  await expect(page.getByText('휴대폰 사용이 궁금할 때',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'가족에게 안부를 전해요. 대화 시작하기'}).click();
  await expect(page.getByTestId('message-input')).toHaveValue('가족에게 보낼 다정한 안부 메시지를 써 줘');
  checks.push('Explore filter and draft handoff work');
  await page.getByTestId('message-input').fill('입력창 전송 검증');
  await page.getByTestId('send-message').click();
  await expect(page.getByText('화면 검증용 응답입니다.',{exact:true})).toBeVisible();
  await expect(page.getByTestId('message-input')).toHaveValue('');
  checks.push('Chat send preserves the real API/store flow with intercepted fixture');
  await page.getByRole('button',{name:'메뉴 열기'}).click();
  await expect(page.getByRole('button',{name:'부탁한 일',exact:true})).toBeVisible(); await capture('drawer-390');
  await page.getByRole('button',{name:'부탁한 일',exact:true}).click();
  await expect(page.getByText('아직 부탁한 일이 없어요',{exact:true})).toBeVisible(); await capture('tasks-390');
  await page.getByTestId('nav-profile').click(); await capture('profile-390');
  await page.getByRole('radio',{name:'어둡게',exact:true}).click();
  await expect(page.getByRole('radio',{name:'어둡게',exact:true})).toBeChecked();
  await page.getByTestId('nav-chat').click(); await capture('chat-dark-390');
  checks.push('Drawer navigation, empty state, light/dark selection work');
  // Inspect the inline mockup independently from the native app fixture.
  const previewUrl = new URL('../../../.output/yellow-preview-check.html',import.meta.url);
  if (existsSync(previewUrl)) {
  const preview=await browser.newPage({viewport:{width:736,height:1100}});
  await preview.goto(previewUrl.href);
  const frame=preview.frameLocator('iframe');
  await expect(frame.locator('[data-panel="chat"]')).toBeVisible();
  await frame.locator('.m-nav [data-destination="explore"]').click();
  await expect(frame.locator('[data-panel="explore"]')).toBeVisible();
  await frame.locator('[data-category="family"]').click();
  await expect(frame.locator('[data-idea="daily"]')).toBeHidden();
  await frame.locator('[data-idea="family"] button').click();
  await expect(frame.locator('input')).toHaveValue('가족에게 보낼 안부 메시지를 써 줘');
  await preview.screenshot({path:path.join(output,'inline-preview.png'),fullPage:true});
  checks.push('Interactive inline mockup tabs, filter, draft handoff work');
  }
  assert.deepEqual(errors,[]);
  const report={passed:true,surface:'React Native Web at mobile viewports; authenticated API fixture. No real AI/VM calls.',checks,contrasts,targets,limits:['iOS/Android native bundles exported; physical device, native keyboard, VoiceOver/TalkBack not exercised.']};
  await writeFile(path.join(output,'../../yellow-review.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:true,checks,minContrast:Math.min(...contrasts.map(c=>c.ratio)),screenshots:output}));
} finally { await browser.close(); }
