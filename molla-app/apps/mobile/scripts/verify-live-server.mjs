// Exercises the real server with temporary owners/data and external providers disabled.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRequest } from '../src/services/runtime.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const folder = await mkdtemp(path.join(tmpdir(), 'molla-mobile-contract-'));
const tokens = { mom: randomBytes(32).toString('base64url'), dad: randomBytes(32).toString('base64url') };
const authFile = path.join(folder, 'owners.json');
await writeFile(authFile, JSON.stringify({ owners: Object.entries(tokens).map(([actor, token]) => ({ actor, hash: createHash('sha256').update(token).digest('hex') })) }));
const environment = { ...process.env, PORT: '0', MOLLA_HOST: '127.0.0.1', MOLLA_LIVE_MODE: '1', MOLLA_LLM_ENABLED: '0', MOLLA_DB: path.join(folder, 'state.sqlite'), MOLLA_OWNER_AUTH_FILE: authFile, MOLLA_CLOUD_BINDINGS: '{}', MOLLA_PHONE_BINDINGS: '{}', MOLLA_ALLOWED_ORIGINS: 'http://127.0.0.1:4323', AI_GATEWAY_API_KEY: '', VERCEL_OIDC_TOKEN: '', MOLLA_PHONE_OWNER: '', MOLLA_PHONE_SERIAL: '' };
const child = spawn(process.execPath, [path.join(root, 'server/index.mjs')], { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = ''; child.stderr.on('data', () => {});
const checks = [];
try {
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Temporary server did not start')), 15000);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Temporary server exited: ${code}`)); });
    child.stdout.on('data', data => { serverOutput += data; const match = serverOutput.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timeout); resolve(match[0]); } });
  });
  const mom = { baseUrl, token: tokens.mom }, dad = { baseUrl, token: tokens.dad };
  const runtime = await apiRequest(mom, '/runtime');
  assert.equal(runtime.mode, 'live'); assert.equal(runtime.me.id, 'mom'); assert.equal(runtime.llm.ready, false); assert.equal(runtime.phone.configured, false);
  assert.equal((await apiRequest(mom, '/state')).me.id, 'mom');
  assert.equal((await apiRequest(dad, '/state')).me.id, 'dad');
  await assert.rejects(apiRequest({ baseUrl, token: 'wrong-owner-token-000000000000000000' }, '/state'), error => error.status === 401);
  checks.push('Real server Bearer identity matches native client contract; invalid token rejected');
  const preflight = await fetch(`${baseUrl}/api/runtime`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:4323', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4323');
  checks.push('Explicit browser review origin supports Bearer preflight');
  await apiRequest(mom, '/consent', { value: 'active' });
  const memory = await apiRequest(mom, '/memories', { text: '모바일 계약 검증 전용 기억' });
  assert.equal((await apiRequest(dad, '/state')).memories.some(row => row.id === memory.id), false);
  await apiRequest(mom, '/ai/consent', { enabled: true, includeMemories: false });
  const consented = await apiRequest(mom, '/runtime'); assert.equal(consented.llm.consented, true); assert.equal(consented.llm.includeMemories, false); assert.equal(consented.llm.ready, false);
  checks.push('Owner memory stays private; model processing and memory sharing are separate');
  await assert.rejects(apiRequest(mom, '/chat', { text: '연결되지 않은 모델 검사', requestId: randomUUID() }), error => [502, 503].includes(error.status));
  await assert.rejects(apiRequest(mom, '/demo/switch', { actor: 'dad' }), error => error.status === 403);
  await assert.rejects(apiRequest(mom, '/phone/quote', { durationMinutes: 5 }));
  checks.push('Missing real providers cannot produce demo replies, switch owners or start a VM');
  await apiRequest(mom, '/consent', { value: 'revoked' });
  assert.equal((await apiRequest(mom, '/state')).me.consent, 'revoked');
  assert.equal((await apiRequest(mom, '/runtime')).llm.consented, false);
  checks.push('Owner withdrawal is reflected in client state and AI consent');
  const report = { passed: true, scope: 'Actual local Node API + mobile HTTP client, isolated data, LLM/VM disabled; not external provider verification', checks };
  await mkdir(path.join(root, 'docs/live'), { recursive: true });
  await writeFile(path.join(root, 'docs/live/server-contract-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  child.kill();
  if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 3000); });
  const absolute = path.resolve(folder), temporaryRoot = path.resolve(tmpdir());
  if (path.dirname(absolute) === temporaryRoot && path.basename(absolute).startsWith('molla-mobile-contract-')) await rm(absolute, { recursive: true, force: true });
}
