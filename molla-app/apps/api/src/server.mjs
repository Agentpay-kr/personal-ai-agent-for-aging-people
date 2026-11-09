import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DomainError, member, consent, snapshot, decide, fingerprint, interruptTask, LocalMemoryStore, addContact, log, execute, phoneBinding, PolicyEngine } from './core.mjs';
import { LocalDraftExecutor } from '../../../../molla-cli/runtime/orchestrator.mjs';
import { OwnerAuth, Tenants, rateLimit, receipt, digest } from './storage.mjs';
import { validateRequest } from './schema.mjs';
import { Agent, availableTools } from './agent.mjs';
import { modelStatus } from './provider.mjs';
import { AndroidExecutor } from './android.mjs';
import { CloudVMManager, cloudMappings, phoneRuntime, runtimePhoneEnv, vmLimits } from '../../../server/cloud-vm.mjs';
import { PhoneScreenService } from '../../../server/phone-screen.mjs';
import { FamilyLinks } from './family.mjs';

const loopback = ip => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
export function publicTask(task) {
  if (!task) return null;
  const result = structuredClone(task);
  result.approvalHash = fingerprint(task);
  if (result.action.device) result.action.device = { label: `${task.owner}의 Android`, platform: 'android', mode: task.action.device.mode };
  if (result.action.navigation) result.action.navigation = { operation: result.action.navigation.operation, text: result.action.navigation.text, element: result.action.navigation.node.label };
  if (result.evidence) { delete result.evidence.device; delete result.evidence.nodes; }
  delete result.approval; delete result.executionId; delete result.executionLeaseUntil;
  return result;
}
const visiblePhone = (s, actor, env) => {
  const { phoneId, ...cloud } = phoneRuntime(s, actor, env);
  const device = phoneBinding(actor, runtimePhoneEnv(s, env));
  return { ...cloud, configured: !!(cloud.configured || device), ...(device && !cloud.configured ? { provider: 'adb', state: 'configured' } : {}), connected: !!device,
    actions: availableTools(s, actor, runtimePhoneEnv(s, env)).filter(t => t.function.name.startsWith('phone_')).map(t => t.function.name) };
};
async function readBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new DomainError('JSON 요청이 필요해요.', 415);
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 24000) throw new DomainError('요청이 너무 커요.', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new DomainError('JSON 요청을 확인해 주세요.', 400); }
}
function send(res, status, data) {
  if (res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(JSON.stringify(data));
}

export function createApi({ env = process.env, provider, cloudCall, runner, dataDirectory, auth, tenants } = {}) {
  const directory = resolve(dataDirectory || env.MOLLA_API_DATA_DIR || resolve(import.meta.dirname, '../.data'));
  tenants ??= new Tenants(directory);
  auth ??= new OwnerAuth(env.MOLLA_API_AUTH_FILE || resolve(directory, 'owners.json'));
  const families = new FamilyLinks(directory);
  const services = new Map(), jobs = new Set(), networkLimits = new Map();
  const schedule = work => { const job = Promise.resolve().then(work).catch(() => {}).finally(() => jobs.delete(job)); jobs.add(job); };
  function service(identity) {
    if (services.has(identity.actor)) return services.get(identity.actor);
    const store = tenants.get(identity), load = () => store.read();
    const save = value => store.transaction(s => { for (const key of Object.keys(s)) delete s[key]; Object.assign(s, value); });
    const cloud = new CloudVMManager({ load, save, env, ...(cloudCall ? { call: cloudCall } : {}) });
    const agent = new Agent({ env, provider, getPhoneEnv: s => runtimePhoneEnv(s, env) });
    const screen = new PhoneScreenService({ load, env, ...(runner ? { runner } : {}) });
    const instance = { store, cloud, agent, screen }; services.set(identity.actor, instance); return instance;
  }
  function revokePhone(actor, svc) {
    const session = svc.store.read().cloudSessions?.[actor];
    if (session && !['stopped', 'error'].includes(session.state)) schedule(() => svc.cloud.stop(actor).catch(() => svc.store.transaction(s => log(s, actor, 'vm.cleanup_pending', '연결 확인 후 종료를 다시 요청해 주세요.'))));
  }
  async function mutation(path, input, identity, svc, guard) {
    const actor = identity.actor, { store, agent, cloud } = svc;
    if (path === '/family/invite') { if (member(store.read(), actor).consent !== 'active') throw new DomainError('주인의 도움 동의가 필요해요.', 403); return families.invite(actor); }
    if (path === '/family/join') return families.join(identity, input.code);
    if (path === '/family/decision') return families.decide(actor, input.id, input.accept, store);
    if (path === '/family/request') {
      const owner = families.target(actor, input.connectionId), row = auth.records().find(r => r.actor === owner && !r.revoked && Date.parse(r.expiresAt) > Date.now());
      if (!row) throw new DomainError('주인 연결 상태를 확인해 주세요.', 409);
      const target = service({ actor: owner, name: row.name || owner });
      const familyGuard = () => { guard(); if (families.target(actor, input.connectionId) !== owner || !target.store.read().familyLinks?.some(l => l.id === input.connectionId && l.helper === actor && l.requests)) throw new DomainError('가족 요청 권한이 철회되었어요.', 403); };
      familyGuard();
      const result = await receipt(target.store, digest(`${actor}:${input.requestId}`), '/chat', { text: input.text }, async () => {
        const plan = await target.agent.chat(target.store, owner, `${identity.name}의 가족 요청: ${input.text}`, familyGuard);
        target.store.transaction(s => { const task = s.tasks.find(t => t.id === plan.task?.id); if (task) task.requester = actor; });
        return { received: true, taskId: plan.task?.id || null };
      });
      // The helper gets only a receipt, not model replies, memories, resolved contacts or execution evidence.
      return result;
    }
    if (path === '/chat') { const result = await agent.chat(store, actor, input.text, guard); return { ...result, task: publicTask(result.task) }; }
    if (path === '/phone/quote') return cloud.quote(actor, input.durationMinutes);
    if (path === '/phone/start') { guard(); await cloud.start(actor, input.quoteId); try { guard(); } catch (error) { await cloud.stop(actor).catch(() => {}); throw error; } return visiblePhone(store.read(), actor, env); }
    if (path === '/phone/stop') { await cloud.stop(actor); return visiblePhone(store.read(), actor, env); }
    if (path === '/phone/diagnose') {
      new PolicyEngine(store.read()).request(actor, actor, 'phone');
      if (cloudMappings(env)[actor]) await cloud.diagnose(actor);
      else {
        const executor = new AndroidExecutor(actor, { getEnv: () => runtimePhoneEnv(store.read(), env), ...(runner ? { runner } : {}) });
        const device = executor.binding(), { stdout } = await executor.adb(device, ['get-state']);
        guard(); if (stdout.trim() !== 'device') throw new DomainError('Android가 연결되어 있지 않아요.', 409);
        new PolicyEngine(store.read()).request(actor, actor, 'phone');
        return { ...visiblePhone(store.read(), actor, env), state: 'ready' };
      }
      guard(); return visiblePhone(store.read(), actor, env);
    }
    const result = store.transaction(s => {
      const me = member(s, actor), memories = new LocalMemoryStore(s);
      if (path === '/consent') {
        if (me.consent !== input.value) consent(s, actor, input.value);
        if (input.value === 'revoked') me.cloudAI = { enabled: false, includeMemories: false, version: me.cloudAI.version + 1 };
      } else if (path === '/ai/consent') {
        if (input.enabled && me.consent !== 'active') throw new DomainError('먼저 주인의 도움 동의가 필요해요.', 403);
        me.cloudAI = { enabled: input.enabled, includeMemories: input.enabled && input.includeMemories, version: me.cloudAI.version + 1 };
        if (!input.enabled) for (const t of s.tasks) interruptTask(s, t, 'AI 동의가 철회되었어요.');
      } else if (path === '/preferences') {
        me.agentName = input.agentName;
        if (JSON.stringify([...me.scopes].sort()) !== JSON.stringify([...input.scopes].sort())) {
          me.scopes = input.scopes; me.policyVersion++;
          for (const t of s.tasks) interruptTask(s, t, '도움 범위가 변경되었어요.');
        }
      } else if (path === '/task/decision') {
        const t = s.tasks.find(t => t.id === input.id && t.owner === actor);
        if (!t) throw new DomainError('내 작업을 찾을 수 없어요.', 404);
        if (input.decision === 'approve' && (!input.expectedActionHash || input.expectedActionHash !== fingerprint(t))) throw new DomainError('검토한 작업 내용이 바뀌었어요. 다시 확인하고 승인해 주세요.', 409);
        return publicTask(decide(s, actor, t.id, input.decision));
      } else if (path === '/contacts') {
        const old = s.contacts.find(c => c.owner === actor && c.name === input.name.trim() && c.relation === input.relation.trim() && c.phone === input.phone.replace(/[\s()-]/g, ''));
        if (old) return old;
        return addContact(s, actor, input);
      } else if (path === '/contacts/delete') {
        const contact = s.contacts.find(c => c.id === input.id && c.owner === actor);
        if (!contact) throw new DomainError('내 연락처를 찾을 수 없어요.', 404);
        s.contacts = s.contacts.filter(c => c !== contact);
      } else if (path === '/memories') {
        if (me.consent !== 'active' || !me.scopes.includes('memory')) throw new DomainError('기억 도움 동의가 필요해요.', 403);
        return memories.remember(actor, { text: input.text });
      } else if (path === '/memories/delete') memories.forget(actor, input.id);
      else if (path === '/memories/correct') return memories.correct(actor, input.id, input.text);
      log(s, actor, `api${path}`, 'owner decision'); return { ok: true };
    });
    if (path === '/consent' && input.value === 'revoked') for (const link of families.list(actor).filter(l => l.direction === 'inbound')) families.decide(actor, link.id, false, store);
    if (path === '/consent' && input.value === 'revoked' || path === '/preferences' && !input.scopes.includes('phone')) revokePhone(actor, svc);
    if (path === '/task/decision' && input.decision === 'approve') {
      const task = store.read().tasks.find(t => t.id === input.id);
      const executor = task.action.execution.startsWith('android-') ? new AndroidExecutor(actor, { getEnv: () => runtimePhoneEnv(store.read(), env), ...(runner ? { runner } : {}) }) : task.action.execution === 'memory' ? {
        execute: async (action, hooks) => {
          hooks.authorize(); const memory = store.transaction(s => new LocalMemoryStore(s).remember(actor, { text: action.body })); hooks.verifying();
          return { kind: 'memory_written', verified: true, memoryId: memory.id, summary: '승인한 기억을 내 저장소에 남겼어요.' };
        },
      } : new LocalDraftExecutor();
      schedule(() => execute(store, actor, input.id, { executor, guard, env }));
    }
    return result;
  }
  const handler = async (req, res) => {
    try {
      const transportSecure = req.socket.encrypted || env.MOLLA_TRUST_LOOPBACK_PROXY === '1' && loopback(req.socket.remoteAddress) && req.headers['x-forwarded-proto'] === 'https';
      if (env.MOLLA_ENV !== 'development' && !transportSecure) throw new DomainError('HTTPS 연결이 필요해요.', 403);
      const hostname = new URL(`http://${req.headers.host || 'invalid'}`).hostname;
      const allowed = new Set((env.MOLLA_ALLOWED_HOSTS || 'localhost,127.0.0.1,[::1]').split(','));
      if (!allowed.has(hostname)) throw new DomainError('허용된 서버 주소를 사용해 주세요.', 403);
      const origin = req.headers.origin;
      if (origin && !(env.MOLLA_ALLOWED_ORIGINS || '').split(',').includes(origin)) throw new DomainError('허용되지 않은 출처예요.', 403);
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key' }); res.end(); return; }
      const ip = req.socket.remoteAddress, window = Math.floor(Date.now() / 60000), old = networkLimits.get(ip);
      if (networkLimits.size > 10000) networkLimits.clear();
      const count = old?.window === window ? old.count + 1 : 1; networkLimits.set(ip, { window, count });
      if (count > 600) throw new DomainError('연결 요청이 너무 많아요.', 429);
      const url = new URL(req.url, 'http://localhost');
      if (url.search || !url.pathname.startsWith('/api/')) throw new DomainError('지원하지 않는 주소예요.', 404);
      const path = url.pathname.slice(4), identity = auth.verify(req.headers.authorization);
      const guard = () => { if (auth.verify(req.headers.authorization).actor !== identity.actor) throw new DomainError('인증 정보가 변경되었어요.', 401); };
      const svc = service(identity), { store } = svc;
      rateLimit(store, Number(env.MOLLA_RATE_PER_MINUTE) || 120);
      if (req.method === 'GET') {
        const s = store.read(), me = member(s, identity.actor), llm = modelStatus(env);
        if (path === '/runtime') return send(res, 200, { mode: 'live', me: { id: me.id, name: me.name }, llm: { ...llm, consented: me.cloudAI.enabled, includeMemories: me.cloudAI.includeMemories, ready: !!(llm.enabled && llm.configured && me.consent === 'active' && me.cloudAI.enabled) }, phone: visiblePhone(s, me.id, env), limits: vmLimits(env), automaticSending: false });
        if (path === '/state') return send(res, 200, { ...snapshot(s, me.id), familyLinks: families.list(me.id), tasks: s.tasks.map(publicTask), mode: 'live' });
        if (path === '/phone/screen') return send(res, 200, await svc.screen.capture(me.id, guard));
        throw new DomainError('찾을 수 없어요.', 404);
      }
      if (req.method !== 'POST') throw new DomainError('지원하지 않는 요청 방식이에요.', 405);
      const input = await readBody(req); validateRequest(path, input); guard();
      if (input.requestId && req.headers['idempotency-key'] && input.requestId !== req.headers['idempotency-key']) throw new DomainError('요청 식별자가 일치하지 않아요.', 400);
      const key = input.requestId || req.headers['idempotency-key'];
      const work = () => mutation(path, input, identity, svc, guard);
      // Older clients may omit a receipt on naturally idempotent settings; effectful calls remain guarded by task/quote IDs.
      const result = key ? await receipt(store, key, path, input, work) : await work();
      guard(); return send(res, 200, result);
    } catch (error) { send(res, error instanceof DomainError ? error.status : 500, { error: error instanceof DomainError ? error.message : '요청을 처리하지 못했어요. 상태를 확인해 주세요.', ...(error instanceof DomainError && /^[a-z_]{1,60}$/.test(error.code || '') ? { code: error.code } : {}) }); }
  };
  const server = env.MOLLA_TLS_CERT && env.MOLLA_TLS_KEY ? https.createServer({ cert: readFileSync(env.MOLLA_TLS_CERT), key: readFileSync(env.MOLLA_TLS_KEY), minVersion: 'TLSv1.2' }, handler) : http.createServer(handler);
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  const cleanup = setInterval(() => {
    for (const [actor, svc] of services) {
      const s = svc.store.read(), session = s.cloudSessions?.[actor], me = member(s, actor);
      if (session && !['stopped', 'error'].includes(session.state) && (me.consent !== 'active' || !me.scopes.includes('phone') || Date.parse(session.expiresAt) <= Date.now())) revokePhone(actor, svc);
      else if (session && ['provisioning', 'unknown'].includes(session.state) && !svc.cloud.busy.has(actor)) schedule(() => svc.cloud.diagnose(actor));
    }
  }, 10000); cleanup.unref();
  return { server, tenants, services, jobs,
    async close() { clearInterval(cleanup); await new Promise(r => server.close(r)); await Promise.allSettled([...jobs]); families.close(); tenants.close(); },
  };
}
