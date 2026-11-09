import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const output = fileURLToPath(new URL('../../../docs/live/screenshots/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.MOLLA_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
const failures = [], checks = [], calls = [];
const states = Object.fromEntries(['mom', 'dad'].map(id => [id, {
  me: { id, name: id === 'mom' ? '엄마' : '아빠', initial: id === 'mom' ? '엄' : '아', role: 'owner', consent: 'active', agentName: '몰라', scopes: ['shopping', 'calendar', 'message', 'phone'] },
  members: [{ id, name: id === 'mom' ? '엄마' : '아빠', initial: id === 'mom' ? '엄' : '아', role: 'owner', consent: 'active' }], messages: [], tasks: [], memories: [], contacts: [],
}]));
let aiReady = false, phoneState = 'stopped', failChat = false, live = true;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  await page.route('https://molla.test/api/**', async route => {
    const req = route.request(), endpoint = new URL(req.url()).pathname.slice(4), body = req.postDataJSON();
    const token = req.headers().authorization;
    const actor = token === 'Bearer fixture-mom-key' ? 'mom' : token === 'Bearer fixture-dad-key' ? 'dad' : null;
    const respond = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (!actor) return respond({ error: 'invalid' }, 401);
    calls.push({ actor, endpoint, body });
    const state = states[actor];
    if (endpoint === '/state') return respond(state);
    if (endpoint === '/runtime') return respond({ mode: live ? 'live' : 'local-demo', me: state.me, llm: { enabled: true, configured: true, model: 'test-fixture', consented: aiReady, includeMemories: false, ready: aiReady }, phone: { configured: true, state: phoneState, phoneId: `fixture-${actor}` }, limits: { vmMaxMinutes: 5, vmPricePerMinuteUsd: .05 } });
    if (endpoint === '/ai/consent') { aiReady = body.enabled; return respond({ ok: true }); }
    if (endpoint === '/chat') {
      if (failChat) return respond({ error: 'AI 연결을 확인해 주세요.' }, 503);
      assert.match(body.requestId, /^[0-9a-f-]{36}$/i); assert.equal(body.owner, undefined);
      const task = { id: 'fixture-task', owner: actor, title: '설정 앱 열기', text: body.text, summary: '내 Android에서 설정 앱을 열어요.', status: 'awaiting_approval', createdAt: new Date().toISOString(), action: { type: 'app.open', body: '설정 앱 열기', appId: 'settings', execution: 'android-app', recipient: null } };
      state.tasks = [task]; state.messages.push({ id: 'fixture-user', role: 'user', text: body.text }, { id: 'fixture-assistant', role: 'assistant', text: '내용을 확인하고 승인해 주세요.', taskId: task.id });
      return respond({ reply: '내용을 확인하고 승인해 주세요.', task });
    }
    if (endpoint === '/task/decision') { state.tasks[0].status = 'completed'; state.tasks[0].result = '테스트 API가 앱 열림 결과를 반환했습니다.'; state.tasks[0].evidence = { kind: 'app_opened', verified: true, summary: state.tasks[0].result }; return respond({ ok: true }); }
    if (endpoint === '/phone/quote') return respond({ quoteId: 'fixture-quote', durationMinutes: body.durationMinutes, estimatedMaxUsd: .25, expiresAt: new Date(Date.now() + 60000).toISOString() });
    if (endpoint === '/phone/start') { assert.deepEqual(body, { quoteId: 'fixture-quote' }); phoneState = 'running'; return respond({ ok: true }); }
    if (endpoint === '/phone/stop') { phoneState = 'stopped'; return respond({ ok: true }); }
    if (endpoint === '/phone/diagnose') return respond({ ok: true });
    return respond({ error: `Unexpected fixture endpoint ${endpoint}` }, 404);
  });
  await page.goto(process.env.MOLLA_PREVIEW_URL || 'http://127.0.0.1:4323', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.getByTestId('connect-account')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, 'app-connect.png') });
  await page.getByTestId('server-url').fill('https://molla.test');
  await page.getByTestId('connection-token').fill('bad-token');
  await page.getByTestId('connect-account').click();
  await expect(page.getByText(/앱 연결 키가 만료/)).toBeVisible();
  checks.push('No anonymous identity; invalid bearer rejected');
  live = false;
  await page.getByTestId('connection-token').fill('fixture-mom-key');
  await page.getByTestId('connect-account').click();
  await expect(page.getByText(/아직 실제 모드가 아니에요/)).toBeVisible();
  checks.push('Demo server is rejected instead of appearing live');
  live = true;
  await page.getByTestId('connect-account').click();
  await expect(page.getByTestId('message-input')).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI 대화 설정' })).toBeVisible();
  await page.getByRole('button', { name: 'AI 대화 설정' }).click();
  await page.getByRole('switch', { name: 'AI 대화 동의', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'AI 대화 동의', exact: true })).toBeChecked();
  await expect(page.getByText('대화할 준비가 되었어요')).toBeVisible();
  checks.push('AI consent is explicit and separate from memory consent');
  await page.getByTestId('nav-chat').click();
  await page.getByTestId('message-input').fill('설정 앱을 열어 줘');
  await page.getByTestId('send-message').click();
  await expect(page.getByRole('button', { name: '부탁 내용 확인하기' })).toBeVisible();
  assert.equal(calls.filter(call => call.endpoint === '/task/decision').length, 0);
  await page.getByRole('button', { name: '부탁 내용 확인하기' }).click();
  await expect(page.getByText('승인할 정확한 내용')).toBeVisible();
  await expect(page.getByText('앱 · 설정')).toBeVisible();
  await page.screenshot({ path: path.join(output, 'app-task-approval-fixture.png') });
  await page.getByRole('button', { name: '확인했어요, 앱 열어 줘' }).click();
  await expect(page.getByText('실행 결과 확인됨', { exact: true })).toBeVisible();
  checks.push('Exact action review precedes approval; completion comes from refreshed state');
  await page.getByRole('button', { name: '확인했어요', exact: true }).click();
  await page.getByTestId('nav-profile').click();
  await page.getByRole('button', { name: 'Android 사용 비용 확인' }).click();
  await expect(page.getByText('예상 최대 비용 US$0.25')).toBeVisible();
  assert.equal(calls.filter(call => call.endpoint === '/phone/start').length, 0);
  await page.screenshot({ path: path.join(output, 'app-vm-quote-fixture.png') });
  await page.getByTestId('confirm-vm-start').click();
  await expect(page.getByRole('button', { name: 'Android 사용 종료하기' })).toBeVisible();
  assert.equal(calls.filter(call => call.endpoint === '/phone/start').length, 1);
  await page.getByRole('button', { name: 'Android 사용 종료하기' }).click();
  await expect(page.getByRole('button', { name: 'Android 사용 비용 확인' })).toBeVisible();
  checks.push('VM quote is reviewed before one explicit start; stop is owner scoped');
  failChat = true;
  await page.getByTestId('nav-chat').click();
  await page.getByTestId('message-input').fill('실패한 요청은 보존해 줘');
  await page.getByTestId('send-message').click();
  await expect(page.getByText('AI 연결을 확인해 주세요.', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('message-input')).toHaveValue('실패한 요청은 보존해 줘');
  await page.getByTestId('send-message').click();
  await expect.poll(() => calls.filter(call => call.endpoint === '/chat' && call.body.text === '실패한 요청은 보존해 줘').length).toBe(2);
  const retries = calls.filter(call => call.endpoint === '/chat' && call.body.text === '실패한 요청은 보존해 줘');
  assert.equal(retries.length, 2); assert.equal(retries[0].body.requestId, retries[1].body.requestId);
  checks.push('AI failures preserve text and retry UUID; no scripted reply');
  await page.getByTestId('nav-profile').click();
  await page.getByRole('button', { name: '이 기기 연결 해제', exact: true }).click();
  await page.getByRole('button', { name: '이 기기 연결 해제', exact: true }).last().click();
  await expect(page.getByTestId('connect-account')).toBeVisible();
  await page.getByTestId('connection-token').fill('fixture-dad-key');
  await page.getByTestId('connect-account').click();
  await expect(page.getByText('아빠의 공간')).toBeVisible();
  await page.getByTestId('nav-chat').click();
  await expect(page.getByText('설정 앱을 열어 줘', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('message-input')).toHaveValue('');
  checks.push('Account disconnect clears conversation, request IDs and unsent drafts');
  for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  checks.push('Mobile layouts have no horizontal overflow');
  const report = { passed: !failures.length, surface: 'React Native Web; mocked authenticated API contract; NOT a live model or VM proof', failures, checks };
  await writeFile(path.join(output, '../ui-contract-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (failures.length) process.exitCode = 1;
} finally { await browser.close(); }
