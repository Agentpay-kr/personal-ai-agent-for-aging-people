// Opt-in external integration check: uses Gateway credits, synthetic owners and a temporary DB.
// Run from molla-app: node --env-file=.env apps/mobile/scripts/verify-gateway-model.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRequest } from '../src/services/runtime.ts';

if (!process.env.AI_GATEWAY_API_KEY) throw new Error('AI_GATEWAY_API_KEY must be loaded on the server.');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const folder = await mkdtemp(path.join(tmpdir(), 'molla-gateway-check-'));
const tokens = { mom: randomBytes(32).toString('base64url'), dad: randomBytes(32).toString('base64url') };
const authFile = path.join(folder, 'owners.json');
await writeFile(authFile, JSON.stringify({ owners: Object.entries(tokens).map(([actor, token]) => ({ actor, hash: createHash('sha256').update(token).digest('hex') })) }));
const model = process.env.MOLLA_GATEWAY_CHECK_MODEL || 'openai/gpt-5-mini';
const environment = { ...process.env, PORT: '0', MOLLA_HOST: '127.0.0.1', MOLLA_ALLOWED_HOSTS: '127.0.0.1', MOLLA_LIVE_MODE: '1', MOLLA_LLM_ENABLED: '1', MOLLA_LLM_PROVIDER: 'vercel', MOLLA_MODEL: model, MOLLA_DB: path.join(folder, 'state.sqlite'), MOLLA_OWNER_AUTH_FILE: authFile, MOLLA_CLOUD_BINDINGS: '{}', MOLLA_PHONE_BINDINGS: '{}', MOLLA_PHONE_OWNER: '', MOLLA_PHONE_SERIAL: '', MOLLA_ALLOW_ANDROID_APPS: '0', MOLLA_ALLOW_ANDROID_COMPOSE: '0', LETSUR_API_KEY: '' };
const child = spawn(process.execPath, [path.join(root, 'server/index.mjs')], { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; child.stderr.on('data', () => {});
const checks = [], responses = [];
try {
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Temporary server did not start')), 15000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Temporary server exited: ${code}`)); });
    child.stdout.on('data', data => { output += data; const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timer); resolve(match[0]); } });
  });
  const owner = { baseUrl, token: tokens.mom }, other = { baseUrl, token: tokens.dad };
  const initial = await apiRequest(owner, '/runtime');
  assert.equal(initial.mode, 'live'); assert.equal(initial.llm.provider, 'vercel'); assert.equal(initial.llm.configured, true); assert.equal(initial.llm.consented, false);
  await assert.rejects(apiRequest(owner, '/chat', { text: '동의 이전 검사', requestId: randomUUID() }), error => error.status === 403);
  await apiRequest(owner, '/consent', { value: 'active' });
  await apiRequest(owner, '/ai/consent', { enabled: true, includeMemories: false });
  checks.push('External AI requires synthetic owner consent; memories excluded');
  const conversation = { text: '안녕 몰라. 오늘 하루를 시작하는 따뜻한 인사 한 문장 해 줘.', requestId: randomUUID() };
  const reply = await apiRequest(owner, '/chat', conversation, { timeoutMs: 45000 });
  assert.equal(reply.model, model); assert.equal(reply.provider, 'vercel'); assert.ok(reply.reply.length > 0); assert.ok(reply.usage.inputTokens > 0); assert.ok(reply.usage.outputTokens > 0); assert.equal(reply.task, null);
  responses.push({ kind: 'conversation', reply: reply.reply, usage: reply.usage });
  assert.deepEqual(await apiRequest(owner, '/chat', conversation), reply);
  const state = await apiRequest(owner, '/state');
  assert.equal(state.messages.length, 2); assert.equal((await apiRequest(other, '/state')).messages.length, 0);
  checks.push('Mobile HTTP client → real Node server → real Gateway model → persisted Korean reply');
  checks.push('Identical request ID reuses the response; another owner cannot read it');
  const draft = await apiRequest(owner, '/chat', { text: '내일 병원에 다녀올게요. 걱정하지 마세요. 이 내용으로 가족에게 보낼 문자 초안을 만들어 줘.', requestId: randomUUID() }, { timeoutMs: 45000 });
  assert.equal(draft.model, model); assert.equal(draft.task?.status, 'awaiting_approval'); assert.equal(draft.task.action.execution, 'local'); assert.ok(draft.task.action.body.length > 0);
  responses.push({ kind: 'message-draft', body: draft.task.action.body, status: draft.task.status, usage: draft.usage });
  checks.push('Real model creates a reviewable draft; no message sent or Android VM started');
  assert.ok((await apiRequest(owner, '/runtime')).llm.verifiedAt);
  const report = { passed: true, checkedAt: new Date().toISOString(), provider: 'vercel', model, scope: 'Actual mobile HTTP client + actual Node API + external AI Gateway; synthetic owners, temporary DB, no VM or physical device', checks, responses };
  await mkdir(path.join(root, 'docs/live'), { recursive: true });
  await writeFile(path.join(root, 'docs/live/gateway-model-smoke-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(JSON.stringify({ passed: false, name: error.name, message: error.message }));
  process.exitCode = 1;
} finally {
  child.kill();
  if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 3000); });
  const absolute = path.resolve(folder);
  if (path.dirname(absolute) === path.resolve(tmpdir()) && path.basename(absolute).startsWith('molla-gateway-check-')) await rm(absolute, { recursive: true, force: true });
}
