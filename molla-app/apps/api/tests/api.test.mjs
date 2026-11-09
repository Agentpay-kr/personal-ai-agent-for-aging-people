import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApi } from '../src/server.mjs';
import { digest } from '../src/storage.mjs';
import { fingerprint, execute, decide } from '../src/core.mjs';
import { planTool } from '../src/agent.mjs';
import { apiRequest } from '../../mobile/src/services/runtime.ts';

const call = (name, args) => ({ call: { id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }, model: 'fixture/model', provider: 'fixture', usage: {} });
async function fixture(t, { provider = { complete: async () => call('respond', { text: '안녕하세요. 무엇을 도와드릴까요?' }) }, runner, env: overrides = {}, cloudCall } = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'molla-api-'));
  const tokens = Object.fromEntries(['mom', 'dad', 'son'].map(id => [id, randomBytes(32).toString('base64url')]));
  const records = { owners: Object.entries(tokens).map(([actor, token]) => ({ actor, name: actor, hash: digest(token), expiresAt: new Date(Date.now() + 3600000).toISOString() })) };
  const authFile = resolve(dir, 'owners.json'); writeFileSync(authFile, JSON.stringify(records));
  const env = { MOLLA_ENV: 'development', MOLLA_API_AUTH_FILE: authFile, MOLLA_LLM_ENABLED: '1', MOLLA_LLM_API_KEY: 'fixture-key', MOLLA_LLM_BASE_URL: 'https://example.invalid/v1', MOLLA_LLM_MODEL: 'fixture/model', MOLLA_ALLOW_ANDROID_APPS: '1', MOLLA_ALLOW_ANDROID_COMPOSE: '1', MOLLA_ALLOW_ANDROID_UI: '1', MOLLA_PHONE_BINDINGS: JSON.stringify({ mom: { serial: 'fixture-mom', mode: 'local' } }), ...overrides };
  let app = createApi({ env, dataDirectory: dir, provider, runner, cloudCall });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  let origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (actor, path, input, headers = {}) => {
    const response = await fetch(origin + '/api' + path, { method: input === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${tokens[actor] || actor}`, ...(input === undefined ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': input.requestId || randomUUID() }), ...headers }, body: input === undefined ? undefined : JSON.stringify(input) });
    return { status: response.status, body: await response.json() };
  };
  const ready = async (actor = 'mom') => {
    assert.equal((await request(actor, '/consent', { value: 'active' })).status, 200);
    assert.equal((await request(actor, '/ai/consent', { enabled: true, includeMemories: true })).status, 200);
    assert.equal((await request(actor, '/preferences', { agentName: '몰라', scopes: ['message', 'phone', 'memory'] })).status, 200);
  };
  const store = actor => app.services.get(actor).store;
  t.after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  return { get app() { return app; }, request, ready, store, env, dir, tokens, records, authFile, get origin() { return origin; },
    restart: async () => { await app.close(); app = createApi({ env, dataDirectory: dir, provider, runner, cloudCall }); await new Promise(r => app.server.listen(0, '127.0.0.1', r)); origin = `http://127.0.0.1:${app.server.address().port}`; },
  };
}
function androidRunner({ wrongForeground = false, sms = false } = {}) {
  const commands = [];
  const runner = async (_, args) => {
    const cmd = args.at(-1); commands.push(cmd);
    if (cmd === 'get-state') return { stdout: 'device', stderr: '' };
    if (cmd.startsWith('cmd package')) return { stdout: 'com.kakao.talk/.MainActivity', stderr: '' };
    if (cmd.startsWith('am start')) return { stdout: 'Status: ok', stderr: '' };
    if (cmd === 'dumpsys activity activities') return { stdout: `mResumedActivity: ActivityRecord{123 u0 ${sms ? 'com.android.messaging' : wrongForeground ? 'other.package' : 'com.kakao.talk'}/.Main t1}`, stderr: '' };
    if (cmd.startsWith('cat ')) return { stdout: '<?xml version="1.0"?><hierarchy><node resource-id="address" text="01012345678" package="com.android.messaging" bounds="[0,0][100,40]"/><node resource-id="body" text="조금 늦어요." package="com.android.messaging" bounds="[0,40][100,100]"/></hierarchy>', stderr: '' };
    return { stdout: '', stderr: '' };
  }; return { runner, commands };
}

test('owner auth is expiring, revocable, bearer-only; tenants have separate SQLite and reject identity injection', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('invalid-token', '/state')).status, 401);
  assert.equal((await f.request('mom', '/consent', { value: 'active', actor: 'dad' })).status, 400);
  assert.equal((await f.request('mom', '/state')).body.me.consent, 'pending');
  await f.ready(); await f.ready('dad');
  await f.request('mom', '/memories', { text: '엄마만의 비밀' });
  assert.equal((await f.request('dad', '/state')).body.memories.length, 0);
  assert.equal(readdirSync(f.dir).filter(n => n.endsWith('.sqlite') && n !== 'family-links.sqlite').length, 2);
  f.records.owners[0].expiresAt = '2000-01-01T00:00:00Z'; writeFileSync(f.authFile, JSON.stringify(f.records));
  assert.equal((await f.request('mom', '/state')).status, 401);
});
test('mobile HTTP client -> API -> tool planner -> approved VM fixture -> verified mobile state', async t => {
  const android = androidRunner(); let calls = 0;
  const f = await fixture(t, { runner: android.runner, provider: { complete: async () => { calls++; return call('phone_app_open', { appId: 'kakao' }); } } });
  await f.ready(); const credentials = { baseUrl: f.origin, token: f.tokens.mom }, requestId = randomUUID();
  const plan = await apiRequest(credentials, '/chat', { text: '카카오톡 열어줘.', requestId });
  assert.equal(plan.task.status, 'awaiting_approval'); assert.equal(android.commands.length, 0);
  assert.equal((await f.request('dad', '/task/decision', { id: plan.task.id, decision: 'approve', expectedActionHash: plan.task.approvalHash })).status, 404);
  assert.equal((await f.request('mom', '/task/decision', { id: plan.task.id, decision: 'approve' })).status, 409);
  await apiRequest(credentials, '/task/decision', { id: plan.task.id, decision: 'approve', expectedActionHash: plan.task.approvalHash });
  await Promise.all([...f.app.jobs]);
  const state = await apiRequest(credentials, '/state');
  assert.equal(state.tasks[0].status, 'completed'); assert.equal(state.tasks[0].evidence.verified, true);
  assert.deepEqual(state.tasks[0].history.map(h => h.status), ['created', 'planned', 'awaiting_approval', 'approved', 'executing', 'verifying', 'completed']);
  await apiRequest(credentials, '/chat', { text: '카카오톡 열어줘.', requestId }); assert.equal(calls, 1);
  assert.equal((await f.request('mom', '/task/decision', { id: plan.task.id, decision: 'approve', expectedActionHash: plan.task.approvalHash })).status, 409);
  assert.equal(android.commands.filter(c => c.startsWith('am start')).length, 1);
  const serialized = JSON.stringify(state); assert(!serialized.includes('fixture-mom')); assert(!serialized.includes(f.tokens.mom)); assert(!serialized.includes('fixture-key'));
});
test('SMS uses registered contact, exact reviewed body and verified compose UI; never sends', async t => {
  const android = androidRunner({ sms: true }); let step = 0, contact;
  const f = await fixture(t, { runner: android.runner, provider: { complete: async () => step++ === 0 ? call('contact_lookup', { query: '아들' }) : call('phone_sms_compose', { contactId: contact.id, body: '조금 늦어요.' }) } });
  await f.ready(); contact = (await f.request('mom', '/contacts', { name: '아들', relation: '아들', phone: '01012345678' })).body;
  const plan = (await f.request('mom', '/chat', { text: '아들에게 늦는다고 문자 써줘.', requestId: randomUUID() })).body.task;
  assert.equal(plan.action.recipient.phone, '01012345678'); assert.equal(plan.action.body, '조금 늦어요.');
  await f.request('mom', '/task/decision', { id: plan.id, decision: 'approve', expectedActionHash: plan.approvalHash }); await Promise.all([...f.app.jobs]);
  const task = (await f.request('mom', '/state')).body.tasks[0]; assert.equal(task.status, 'completed'); assert.equal(task.evidence.messageSent, false);
  assert(android.commands.some(c => c.includes('android.intent.action.SENDTO'))); assert(!android.commands.some(c => /input tap|keyevent|service call/.test(c)));
});
test('changed action/contact/device cannot reuse the reviewed approval', async t => {
  const f = await fixture(t, { provider: { complete: async () => call('phone_app_open', { appId: 'kakao' }) } }); await f.ready();
  const task = (await f.request('mom', '/chat', { text: '열어줘', requestId: randomUUID() })).body.task;
  f.store('mom').transaction(s => { s.tasks[0].action.appId = 'settings'; });
  assert.equal((await f.request('mom', '/task/decision', { id: task.id, decision: 'approve', expectedActionHash: task.approvalHash })).status, 409);
  await assert.rejects(execute(f.store('mom'), 'mom', task.id), { status: 403 });
});
test('bad tool names, additional fields, fabricated contacts and unadvertised tools fail without execution', async t => {
  let next = call('shell', { command: 'id' });
  const f = await fixture(t, { provider: { complete: async () => next } }); await f.ready();
  for (const invalid of [next, call('phone_app_open', { appId: 'kakao', owner: 'dad' }), call('phone_sms_compose', { contactId: 'fabricated', body: '안녕' })]) {
    next = invalid; assert((await f.request('mom', '/chat', { text: '실행', requestId: randomUUID() })).status >= 400);
  }
  await f.request('mom', '/preferences', { agentName: '몰라', scopes: ['message'] }); next = call('phone_app_open', { appId: 'kakao' });
  assert.equal((await f.request('mom', '/chat', { text: '실행', requestId: randomUUID() })).status, 502);
  assert.equal(f.store('mom').read().tasks.length, 0);
});
test('consented memory search is owner-only and memory writes need an exact owner approval', async t => {
  let step = 0, seen = '';
  const f = await fixture(t, { provider: { complete: async ({ messages }) => { seen = JSON.stringify(messages); return step++ === 0 ? call('memory_search', { query: '취향' }) : step === 2 ? call('respond', { text: '짧은 대화를 좋아하세요.' }) : call('memory_remember', { text: '새 기억' }); } } });
  await f.ready(); await f.ready('dad');
  await f.request('mom', '/memories', { text: '취향은 짧은 대화' }); await f.request('dad', '/memories', { text: '아빠 비밀 취향' });
  assert.equal((await f.request('mom', '/chat', { text: '내 취향', requestId: randomUUID() })).status, 200); assert(seen.includes('짧은 대화')); assert(!seen.includes('아빠 비밀'));
  const task = (await f.request('mom', '/chat', { text: '새 기억 남겨줘', requestId: randomUUID() })).body.task;
  assert(!seen.includes('짧은 대화를 좋아하세요.'), 'memory-derived replies must not resurrect old memories through history');
  assert.equal(f.store('mom').read().memories.length, 1);
  await f.request('mom', '/task/decision', { id: task.id, decision: 'approve', expectedActionHash: task.approvalHash }); await Promise.all([...f.app.jobs]);
  assert.equal(f.store('mom').read().tasks[0].status, 'completed'); assert.equal(f.store('mom').read().memories.length, 2);
});
test('pending duplicate model request is rejected and consent revocation discards late result', async t => {
  let release, entered; const started = new Promise(r => entered = r), wait = new Promise(r => release = r);
  const f = await fixture(t, { provider: { complete: async () => { entered(); await wait; return call('respond', { text: 'late private answer' }); } } }); await f.ready();
  const requestId = randomUUID(), input = { text: '안녕', requestId }, headers = { 'Idempotency-Key': requestId };
  const first = f.request('mom', '/chat', input, headers); await started;
  assert.equal((await f.request('mom', '/chat', input, headers)).status, 409);
  await f.request('mom', '/ai/consent', { enabled: false, includeMemories: false }); release(); assert.equal((await first).status, 409);
  assert.equal(f.store('mom').read().messages.length, 0);
});
test('restart recovers started work and pending receipts without rerunning effects', async t => {
  const f = await fixture(t); await f.ready();
  f.store('mom').transaction(s => {
    const task = planTool(s, 'mom', '앱 열기', 'phone_app_open', { appId: 'kakao' }, f.env); decide(s, 'mom', task.id, 'approve'); task.status = 'executing'; task.executionStartedAt = new Date().toISOString();
    s.requests.push({ key: 'pending-1234', status: 'pending', path: '/chat', hash: 'test' });
  });
  await f.restart(); const state = (await f.request('mom', '/state')).body;
  assert.equal(state.tasks[0].status, 'needs_verification'); assert.equal(f.store('mom').read().requests.find(r => r.key === 'pending-1234').status, 'interrupted'); assert.equal(f.app.jobs.size, 0);
});
test('timeout after external start is needs_verification and never retried', async t => {
  const f = await fixture(t); await f.ready(); const store = f.store('mom');
  const task = store.transaction(s => { const t = planTool(s, 'mom', '앱 열기', 'phone_app_open', { appId: 'kakao' }, f.env); return decide(s, 'mom', t.id, 'approve'); });
  let effects = 0; const executor = { execute: async (_, hooks) => { hooks.beforeEffect(); effects++; return new Promise(() => {}); } };
  const result = await execute(store, 'mom', task.id, { executor, timeoutMs: 15 }); assert.equal(result.status, 'needs_verification');
  await execute(store, 'mom', task.id, { executor, timeoutMs: 15 }); assert.equal(effects, 1);
});
test('cancellation after an external start records uncertainty; no completed UI fiction', async t => {
  const f = await fixture(t); await f.ready(); const store = f.store('mom');
  const task = store.transaction(s => { const t = planTool(s, 'mom', '앱 열기', 'phone_app_open', { appId: 'kakao' }, f.env); return decide(s, 'mom', t.id, 'approve'); });
  let release; const wait = new Promise(r => release = r);
  const work = execute(store, 'mom', task.id, { executor: { execute: async (_, hooks) => { hooks.beforeEffect(); await wait; return { kind: 'app_opened', verified: true, package: 'com.kakao.talk', device: 'fixture-mom' }; } } });
  await f.request('mom', '/task/decision', { id: task.id, decision: 'cancel' }); release(); assert.equal((await work).status, 'needs_verification');
});
test('production denies HTTP and spoofed proxy headers; rate limit persists', async t => {
  const f = await fixture(t, { env: { MOLLA_ENV: 'production' } });
  assert.equal((await f.request('mom', '/runtime', undefined, { 'X-Forwarded-Proto': 'https' })).status, 403);
  const g = await fixture(t, { env: { MOLLA_RATE_PER_MINUTE: '2' } });
  assert.equal((await g.request('mom', '/runtime')).status, 200); assert.equal((await g.request('mom', '/state')).status, 200);
  await g.restart(); assert.equal((await g.request('mom', '/state')).status, 429); assert.equal((await g.request('dad', '/state')).status, 200);
});
test('phone quote/start receipts cannot bill twice or select another owner session', async t => {
  let starts = 0;
  const f = await fixture(t, { env: { MOLLA_CLOUD_BINDINGS: JSON.stringify({ mom: { phoneId: 'saved-mom' } }) }, cloudCall: async input => {
    if (input.operation === 'start') { starts++; return { phoneId: input.phoneId, state: 'ready', sessionId: 'only-mom-session', serial: 'only-mom-device', expiresAt: Date.now() / 1000 + 180 }; }
    return { phoneId: input.phoneId, state: 'stopped' };
  } }); await f.ready(); await f.ready('dad');
  const quote = (await f.request('mom', '/phone/quote', { durationMinutes: 3 })).body; assert.equal(starts, 0);
  assert.equal((await f.request('dad', '/phone/start', { quoteId: quote.quoteId })).status, 409);
  const headers = { 'Idempotency-Key': randomUUID() };
  assert.equal((await f.request('mom', '/phone/start', { quoteId: quote.quoteId }, headers)).status, 200);
  assert.equal((await f.request('mom', '/phone/start', { quoteId: quote.quoteId }, headers)).status, 200); assert.equal(starts, 1);
  const runtime = (await f.request('mom', '/runtime')).body; assert(!JSON.stringify(runtime).includes('only-mom-session')); assert(!JSON.stringify(runtime).includes('only-mom-device'));
});

test('family linking needs parent acceptance; helper receives receipts only, cannot approve, and revocation blocks requests', async t => {
  const f = await fixture(t, { provider: { complete: async () => call('phone_app_open', { appId: 'kakao' }) } });
  await f.ready(); await f.ready('son');
  const invite = (await f.request('mom', '/family/invite', {})).body;
  assert.equal((await f.request('son', '/family/join', { code: invite.code })).status, 200);
  assert.equal((await f.request('dad', '/family/join', { code: invite.code })).status, 409);
  const link = (await f.request('mom', '/state')).body.familyLinks[0];
  assert.equal((await f.request('son', '/family/request', { connectionId: link.id, text: '카카오톡 열어줘', requestId: randomUUID() })).status, 403);
  assert.equal((await f.request('son', '/family/decision', { id: link.id, accept: true })).status, 404);
  assert.equal((await f.request('mom', '/family/decision', { id: link.id, accept: true })).status, 200);
  const result = await f.request('son', '/family/request', { connectionId: link.id, text: '카카오톡 열어줘', requestId: randomUUID() });
  assert.equal(result.status, 200); assert.deepEqual(Object.keys(result.body).sort(), ['received', 'taskId']);
  const task = (await f.request('mom', '/state')).body.tasks[0]; assert.equal(task.requester, 'son'); assert.equal(task.status, 'awaiting_approval');
  assert.equal((await f.request('son', '/state')).body.tasks.length, 0);
  assert.equal((await f.request('son', '/task/decision', { id: task.id, decision: 'approve', expectedActionHash: task.approvalHash })).status, 404);
  await f.request('mom', '/family/decision', { id: link.id, accept: false });
  assert.equal((await f.request('mom', '/state')).body.tasks[0].status, 'cancelled');
  assert.equal((await f.request('son', '/family/request', { connectionId: link.id, text: '다시', requestId: randomUUID() })).status, 403);
  const nextInvite = (await f.request('mom', '/family/invite', {})).body;
  await f.request('son', '/family/join', { code: nextInvite.code });
  const nextLink = (await f.request('mom', '/state')).body.familyLinks[0];
  await f.request('mom', '/family/decision', { id: nextLink.id, accept: true });
  await f.request('mom', '/consent', { value: 'revoked' }); await f.request('mom', '/consent', { value: 'active' });
  assert.equal((await f.request('son', '/family/request', { connectionId: nextLink.id, text: '철회된 요청', requestId: randomUUID() })).status, 403);
});
