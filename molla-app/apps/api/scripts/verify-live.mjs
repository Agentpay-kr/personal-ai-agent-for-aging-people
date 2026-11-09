// Real provider test. Never runs as part of `test`; every paid action needs explicit operator authorization.
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApi } from '../src/server.mjs';
import { CompatibleProvider } from '../src/provider.mjs';
import { digest, secureDirectory } from '../src/storage.mjs';
import { apiRequest } from '../../mobile/src/services/runtime.ts';

const android = process.argv.includes('--android');
const maxCalls = Number(process.env.MOLLA_CONFIRM_LIVE_MODEL_CALLS), minutes = Number(process.env.MOLLA_VERIFY_VM_MINUTES || 3);
if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 6) throw new Error('Explicit model call authorization required (1..6).');
if (android && (![1, 2, 3].includes(minutes) || Number(process.env.MOLLA_CONFIRM_VM_MAX_USD) !== Number((minutes * .05).toFixed(2)))) throw new Error('Explicit bounded VM authorization required; never reuse an exhausted budget.');
const directory = mkdtempSync(resolve(tmpdir(), 'molla-real-proof-')); secureDirectory(directory);
const token = randomBytes(32).toString('base64url'), authFile = resolve(directory, 'owners.json');
writeFileSync(authFile, JSON.stringify({ owners: [{ actor: 'mom', name: '검증용 엄마', hash: digest(token), expiresAt: new Date(Date.now() + 600000).toISOString() }] }), { mode: 0o600 });
const env = { ...process.env, MOLLA_ENV: 'development', MOLLA_API_AUTH_FILE: authFile, MOLLA_ALLOWED_HOSTS: 'localhost,127.0.0.1', MOLLA_VM_MAX_MINUTES: '3', MOLLA_RATE_PER_MINUTE: '300' };
const real = new CompatibleProvider({ env }); let calls = 0;
const provider = { complete: async args => { if (calls >= maxCalls) throw new Error('Model call budget exhausted'); calls++; return real.complete(args); } };
const app = createApi({ env, dataDirectory: directory, provider });
await new Promise(r => app.server.listen(0, '127.0.0.1', r));
const credentials = { baseUrl: `http://127.0.0.1:${app.server.address().port}`, token };
const request = (path, body) => apiRequest(credentials, path, body, { timeoutMs: 65000, ...(body?.requestId ? { requestId: body.requestId } : body ? { requestId: randomUUID() } : {}) });
const report = { at: new Date().toISOString(), testType: 'real_provider', surface: 'actual mobile HTTP transport through owner API; not native device rendering', scenarios: {}, modelCalls: 0, vmMaxMinutes: android ? minutes : 0, android: android ? 'pending' : 'not_requested', cleanup: 'not_needed', connectionErrors: [] };
let started = false, watchdog, watchdogStop;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitForTask(id) {
  for (let i = 0; i < 55; i++) {
    const state = await request('/state'), task = state.tasks.find(t => t.id === id);
    if (['completed', 'prepared', 'failed', 'needs_verification', 'rejected', 'cancelled'].includes(task.status)) return task;
    await sleep(1000);
  }
  throw new Error('Task observation timed out; never retry automatically');
}
async function scenario(name, text, execution) {
  try {
    const plan = await request('/chat', { text, requestId: randomUUID() });
    if (!execution) { if (plan.task || !plan.reply) throw new Error('Expected a real conversation response'); return report.scenarios[name] = { passed: true, model: plan.model, provider: plan.provider }; }
    if (plan.task?.action.execution !== execution) throw new Error('Model did not produce the expected executable plan');
    await request('/task/decision', { id: plan.task.id, decision: 'approve', expectedActionHash: plan.task.approvalHash });
    const result = await waitForTask(plan.task.id);
    report.scenarios[name] = { passed: result.status === 'completed' && result.evidence?.verified === true, status: result.status, result: result.result, evidence: result.evidence };
  } catch (error) { report.scenarios[name] = { passed: false, reason: error.status ? error.message : 'Expected real outcome was not observed' }; }
}
try {
  await request('/consent', { value: 'active' }); await request('/ai/consent', { enabled: true, includeMemories: true });
  await request('/preferences', { agentName: '몰라', scopes: ['phone', 'message', 'memory'] });
  await scenario('A_conversation', '안녕 몰라. 오늘 하루를 시작하는 짧은 인사를 해 줘.');
  if (android) {
    const quote = await request('/phone/quote', { durationMinutes: minutes });
    if (quote.estimatedMaxUsd > Number(process.env.MOLLA_CONFIRM_VM_MAX_USD)) throw new Error('Quote exceeds authorized budget');
    started = true; watchdog = setTimeout(() => { watchdogStop = request('/phone/stop', {}).catch(() => {}); }, minutes * 60000 - 15000);
    await request('/phone/start', { quoteId: quote.quoteId });
    let ready = false;
    const deadline = Date.now() + Math.min(45000, minutes * 60000 - 30000);
    while (Date.now() < deadline) {
      try { const phone = await request('/phone/diagnose', {}); if (phone.state === 'ready') { ready = true; break; } if (['stopped', 'error'].includes(phone.state)) break; }
      catch (error) { report.connectionErrors.push({ message: error.status ? error.message : 'Connection not observed', code: error.code }); }
      await sleep(2000); // Read-only status recovery, never another paid Start.
    }
    if (!ready) throw new Error('Android did not become ready within observation window');
    report.android = 'connected';
    await scenario('B_kakao_open', '카카오톡 열어줘.', 'android-app');
    // Reserved fictional NANP number; no Send operation exists in the executor.
    await request('/contacts', { name: '데모 아들', relation: '아들', phone: '+12025550123' });
    await scenario('C_sms_compose', '아들에게 "조금 늦어요."라고 문자 써줘. 전송하지 말고 작성 화면까지만 준비해줘.', 'android-compose');
  }
} catch { report.error = 'Live connection or verification did not finish. Inspect authorized owner state; no automatic retry.'; }
finally {
  clearTimeout(watchdog);
  if (started) {
    try {
      if (watchdogStop) await watchdogStop;
      let phone = await request('/phone/stop', {});
      for (let i = 0; phone.state !== 'stopped' && i < 10; i++) { await sleep(2000); phone = await request('/phone/diagnose', {}); }
      report.cleanup = phone.state;
    } catch { report.cleanup = 'needs_operator_verification'; }
  }
  report.modelCalls = calls;
  report.passed = Object.values(report.scenarios).every(s => s.passed) && !!report.scenarios.A_conversation && (!android || report.cleanup === 'stopped' && !!report.scenarios.B_kakao_open && !!report.scenarios.C_sms_compose);
  await app.close();
  const output = resolve(import.meta.dirname, '../../../docs/live'); mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'agent-upgrade-live-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('Private verification DB retained locally for uncertain-result review; no keys or session IDs were written to the report.');
  if (!report.passed) process.exitCode = 1;
}
