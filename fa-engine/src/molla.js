// Molla-compatible domain on top of the FA engine.
// Implements what the Molla CLI / router skill expect from a "Molla app" API:
// cookie sessions, owner-approved tasks, owner memories, contacts, ontology,
// phone (VM) diagnose/plan, consent. Permission checks reuse policy.js, and
// approval requests created in the FA chat show up here as tasks too.

import { randomBytes } from 'node:crypto';
import * as engine from './engine.js';
import * as store from './store.js';
import { evaluate, approvalState, ACTIONS } from './policy.js';
import { nameOf, polish, getMember } from './family.js';
import { connections } from './vault.js';
import { vmState, won, appendVmLog } from './vm.js';
import { record } from './ontology.js';

export class MollaError extends Error {
  constructor(status, message) {
    super(polish(message));
    this.status = status;
  }
}

const TERMINAL = new Set(['rejected', 'cancelled', 'prepared', 'needs_verification', 'failed', 'completed']);
const RUN_MS = Number(process.env.MOLLA_RUN_MS ?? 150);
let S;

let epoch = 0;
export function resetMolla() {
  epoch += 1; // timers from before a reset see a different epoch and stop
  S = {
    sessions: new Map(), // sid -> { actor }
    tasks: new Map(),
    memories: new Map(),
    contacts: new Map(),
    invites: new Map(),
    seq: 0,
  };
}
resetMolla();

const fam = () => engine.family;
const N = (id) => nameOf(fam(), id);
const nextId = (prefix) => `${prefix}_${(++S.seq).toString(36)}${randomBytes(3).toString('hex')}`;

function member(id) {
  const m = getMember(fam(), id);
  if (!m || m.role === 'agent') return null;
  return { id: m.id, name: m.name, relation: m.relation, role: m.role };
}

function str(v, name, { required = true, max = 1000 } = {}) {
  if (v === undefined || v === null) {
    if (required) throw new MollaError(400, `Missing argument: ${name}`);
    return undefined;
  }
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new MollaError(400, `Invalid argument: ${name}`);
  return v.trim();
}

// ------------------------------------------------------------- sessions

export function sessionFromCookie(header) {
  const m = String(header ?? '').match(/(?:^|;\s*)molla_session=([a-f0-9]{48})(?:;|$)/);
  return m && S.sessions.has(m[1]) ? m[1] : null;
}

export function newSession(actor = 'son') {
  const sid = randomBytes(24).toString('hex');
  S.sessions.set(sid, { actor });
  return sid;
}

// Demo login for the chat UI (one session per phone). Not production auth.
export function login(actor) {
  const a = str(actor, 'actor', { max: 100 });
  if (!member(a)) throw new MollaError(400, `Unknown demo actor: ${a}`);
  return { session: newSession(a), me: member(a) };
}

export function actorOf(sid) {
  return S.sessions.get(sid)?.actor ?? null;
}

export function switchActor(sid, body) {
  const actor = str(body.actor, 'actor', { max: 100 });
  if (!member(actor)) throw new MollaError(400, `Unknown demo actor: ${actor}`);
  S.sessions.get(sid).actor = actor;
  return { me: member(actor), mode: 'demo' };
}

// ---------------------------------------------------------------- state

export function state(actor) {
  return {
    me: member(actor),
    mode: 'demo',
    members: Object.values(fam().members).filter((m) => m.role !== 'agent').map((m) => member(m.id)),
    tasks: visibleTasks(actor),
    contacts: [...S.contacts.values()].filter((c) => c.owner === actor),
    consent: fam().consent?.[actor] ?? 'active',
  };
}

// ---------------------------------------------------------------- tasks

function parseTask(owner, { text, draft, contactId }) {
  const t = text.replace(/\s+/g, ' ');
  if (contactId || draft) {
    const contact = contactId ? S.contacts.get(contactId) : null;
    if (contactId && (!contact || contact.owner !== owner)) throw new MollaError(404, '연락처를 찾을 수 없어요');
    return {
      kind: 'message',
      action: { type: 'sms_draft', contactId: contact?.id ?? null, to: contact?.name ?? null, draft: draft ?? t },
      policy: ['compose_message', {}],
    };
  }
  const amount = (() => {
    const m = t.match(/(\d[\d,]*)\s*(만)?\s*원/);
    return m ? Number(m[1].replace(/,/g, '')) * (m[2] ? 10000 : 1) : null;
  })();
  if (/(옮겨|보내|송금|이체)/.test(t) && amount) {
    const to = /(내|제)\s*(통장|계좌)|나한테|저한테/.test(t) ? null : (t.match(/(엄마|아빠|승빈|아들)\s*(한테|에게)/)?.[1] ?? null);
    const toId = to ? { 엄마: 'mom', 아빠: 'dad', 승빈: 'son', 아들: 'son' }[to] : undefined;
    return { kind: 'transfer', action: { type: 'transfer_money', to: toId ?? 'requester', amount }, policy: ['transfer_money', { amount }], needsTo: !toId };
  }
  if (/구독|정기\s*결제/.test(t)) {
    return { kind: 'subscription', action: { type: 'review_subscriptions' }, policy: ['scan_subscriptions', {}] };
  }
  if (/(주문|사\s*줘|시켜|장보기)/.test(t)) {
    const rice = /쌀/.test(t);
    const item = rice ? `쌀 ${t.match(/(\d+)\s*(kg|킬로)/i)?.[1] ?? 10}kg` : (t.match(/([가-힣A-Za-z0-9]+)\s*(좀\s*)?(주문|사\s*줘|시켜)/)?.[1] ?? '생필품');
    const price = rice ? 32900 : 15000;
    return {
      kind: 'order',
      action: { type: 'order_item', item, quantity: 1, price, deliverTo: `${N(owner)} 집` },
      policy: ['order_item', { price }],
    };
  }
  return { kind: 'general', action: { type: 'note', text: t }, policy: ['general_task', {}] };
}

const WHO_ID = { 엄마: 'mom', 어머니: 'mom', 아빠: 'dad', 아버지: 'dad', 승빈: 'son', 아들: 'son' };

export function createTask(actor, body) {
  const text = str(body.text, 'text');
  // "엄마 계좌에서 …" names the account owner when --owner isn't given.
  const fromText = text.match(/(엄마|어머니|아빠|아버지|승빈|아들)\s*(의)?\s*(통장|계좌)에서/)?.[1];
  const owner = str(body.owner, 'owner', { required: false, max: 100 }) ?? (fromText ? WHO_ID[fromText] : actor);
  const draft = str(body.draft, 'draft', { required: false });
  const contactId = str(body.contactId, 'contactId', { required: false, max: 100 });
  if (!member(owner)) throw new MollaError(400, '대상을 확인할 수 없어요');

  const parsed = parseTask(owner, { text, draft, contactId });
  if (parsed.needsTo) parsed.action.to = actor;
  const [policyAction, policyInput] = parsed.policy;
  const input = parsed.kind === 'transfer' ? { ...policyInput, to: parsed.action.to } : policyInput;
  const decision = evaluate(fam(), { requester: actor, owner, action: policyAction, input });
  record('fa:PolicyDecided', {
    actor, onBehalfOf: owner,
    payload: { source: 'molla', action: policyAction, actionLabel: ACTIONS[policyAction].label, decision: decision.decision, tier: decision.tier ?? null, reason: decision.reason },
  });
  if (decision.decision === 'deny') throw new MollaError(403, decision.reason);

  // Molla rule: every task waits for its owner. Money also needs a family co-signer.
  const approvals = decision.tier === 'money' ? decision.approvals : { required: [owner], anyOf: null };
  const now = Date.now();
  const task = {
    id: nextId('task'), owner, requester: actor, kind: parsed.kind, text, action: parsed.action,
    status: 'awaiting_approval', tier: decision.tier, approvals, votes: {},
    reason: polish(decision.reason), evidence: null, source: 'molla', createdAt: now, updatedAt: now,
  };
  S.tasks.set(task.id, task);
  return { task: viewTask(task, actor) };
}

function isApprover(task, viewer) {
  return task.approvals.required.includes(viewer) || Boolean(task.approvals.anyOf?.from.includes(viewer));
}

function viewTask(task, viewer) {
  const { action, evidence, ...rest } = task;
  const v = { ...rest, approvals: task.approvals, votes: { ...task.votes }, evidence: evidence ?? null };
  // The exact action and its artifact (address, amounts, recipients) are shown only to the people who decide.
  if (viewer === task.owner || isApprover(task, viewer)) v.action = action;
  else if (evidence) v.evidence = { kind: evidence.kind, verified: evidence.verified, note: evidence.note ?? evidence.message };
  return v;
}

const KIND_OF = {
  cancel_subscription: 'subscription', order_item: 'order', transfer_money: 'transfer',
};

// Chat request status -> Molla task status. Only a finished, successful run is "prepared".
function chatStatus(r) {
  switch (r.status) {
    case 'pending': return 'awaiting_approval';
    case 'approved': return 'running'; // executing, or waiting for an account connection
    case 'done': return 'prepared';
    default: return r.status; // rejected | cancelled | failed
  }
}

// Approval requests raised in the FA chat, presented as Molla tasks.
function chatTasks() {
  return store.allRequests().filter((r) => r.kind === 'approval').map((r) => ({
    id: r.id,
    owner: r.owner,
    requester: r.requester,
    kind: KIND_OF[r.action] ?? 'general',
    text: polish(r.summary.title),
    action: { type: r.action, ...r.input },
    status: chatStatus(r),
    tier: r.decision.tier,
    approvals: r.decision.approvals,
    votes: { ...r.votes },
    reason: r.decision.reason,
    evidence: r.status === 'done'
      ? { kind: 'local_draft', verified: true, artifact: r.result, note: '모의 VM 실행 기록이에요.' }
      : r.status === 'failed'
        ? { kind: 'error', verified: false, message: r.result?.reason ?? '실행하지 못했어요.' }
        : null,
    source: 'chat',
    roomId: r.roomId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? r.createdAt,
  }));
}

function visibleTasks(viewer) {
  return [...S.tasks.values(), ...chatTasks()]
    .filter((t) => t.owner === viewer || t.requester === viewer || isApprover(t, viewer))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((t) => viewTask(t, viewer));
}

export async function decideTask(actor, body) {
  const id = str(body.id, 'id', { max: 100 });
  const decision = str(body.decision, 'decision', { max: 10 });
  if (!['approve', 'reject', 'cancel'].includes(decision)) throw new MollaError(400, 'Invalid argument: decision');

  if (store.getRequest(id)?.kind === 'approval') return decideChatTask(actor, id, decision);

  const task = S.tasks.get(id);
  if (!task || !(task.owner === actor || task.requester === actor || isApprover(task, actor))) {
    throw new MollaError(404, '작업을 찾을 수 없어요');
  }
  if (task.status === 'running' || TERMINAL.has(task.status)) throw new MollaError(409, `이미 처리된 작업이에요 (${task.status})`);

  if (decision === 'cancel') {
    if (actor !== task.requester && actor !== task.owner) throw new MollaError(403, '요청한 사람이나 계정 주인만 취소할 수 있어요');
    return finish(task, 'cancelled', actor);
  }

  if (!isApprover(task, actor)) {
    throw new MollaError(403, `${N(task.owner)}님만 결정할 수 있어요. 가족 도우미는 대신 승인할 수 없어요.`);
  }
  if (task.votes[actor]) throw new MollaError(409, '이미 결정했어요');
  const a = task.approvals;
  if (a.anyOf && !a.required.includes(actor) && a.anyOf.from.filter((x) => task.votes[x] === 'approve').length >= a.anyOf.count) {
    throw new MollaError(409, '함께 승인할 가족 몫은 이미 채워졌어요');
  }

  task.votes[actor] = decision;
  task.updatedAt = Date.now();
  const s = approvalState({ decision: { approvals: a }, votes: task.votes });
  record('fa:VoteCast', { actor, onBehalfOf: task.owner, payload: { source: 'molla', requestId: task.id, vote: decision, state: s } });
  if (s === 'rejected') return finish(task, 'rejected', actor);
  if (s === 'pending') return { task: viewTask(task, actor) };

  task.status = 'running';
  const started = epoch;
  setTimeout(() => {
    if (started !== epoch) return; // the demo was reset meanwhile
    runTask(task).catch((err) => {
      task.status = 'failed';
      task.evidence = { kind: 'error', verified: false, message: err.message };
    });
  }, RUN_MS);
  return { task: viewTask(task, actor) };
}

function finish(task, status, actor) {
  task.status = status;
  task.updatedAt = Date.now();
  return { task: viewTask(task, actor) };
}

async function decideChatTask(actor, id, decision) {
  try {
    if (decision === 'cancel') engine.cancelRequest({ requestId: id, userId: actor });
    else await engine.vote({ requestId: id, userId: actor, vote: decision });
  } catch (err) {
    if (err instanceof engine.EngineError) throw new MollaError(err.status, err.message);
    throw err;
  }
  const task = chatTasks().find((t) => t.id === id);
  return { task: viewTask(task, actor) };
}

// Approved Molla tasks produce a local draft. Nothing is bought, sent, or transferred.
async function runTask(task) {
  const a = task.action;
  // Draft steps go to the owner's VM log only, not into chat rooms (other members may not see the action).
  const logToRooms = (text) => appendVmLog(task.owner, `[Molla] ${text}`);
  let artifact;
  let note;
  switch (a.type) {
    case 'order_item':
      logToRooms(`쿠팡 장바구니 초안: ${a.item} · ${won(a.price)}`);
      artifact = { type: 'cart_draft', item: a.item, quantity: a.quantity, price: a.price, deliverTo: a.deliverTo };
      note = '결제하지 않았어요. 장바구니 초안이에요.';
      break;
    case 'transfer_money':
      logToRooms(`이체 초안: ${N(task.owner)} → ${N(a.to)} ${won(a.amount)}`);
      artifact = { type: 'transfer_draft', from: task.owner, to: a.to, amount: a.amount };
      note = '이체하지 않았어요. 이체 초안이에요.';
      break;
    case 'sms_draft':
      logToRooms(`문자 초안 작성: ${a.to ?? '받는 사람 미정'}`);
      artifact = { type: 'sms_draft', to: a.to, draft: a.draft };
      note = '보내지 않았어요. 문자 초안이에요.';
      break;
    case 'review_subscriptions': {
      const subs = vmState(task.owner)?.subscriptions.filter((s) => s.status === 'active') ?? [];
      logToRooms(`정기결제 검토 초안: ${subs.length}건`);
      artifact = { type: 'subscription_review', items: subs.map(({ id, name, monthly, usage, recommend }) => ({ id, name, monthly, usage, recommend })) };
      note = '해지하지 않았어요. 검토용 목록이에요.';
      break;
    }
    default:
      artifact = { type: 'note', text: a.text };
      note = '메모로 정리했어요.';
  }
  task.evidence = { kind: 'local_draft', verified: true, artifact, note, createdAt: Date.now() };
  task.status = 'prepared';
  task.updatedAt = Date.now();
  record('fa:TaskPrepared', { actor: task.requester, onBehalfOf: task.owner, payload: { taskId: task.id, text: task.text } });
}

// ------------------------------------------------------------- memories

function ownMemory(actor, id) {
  const m = S.memories.get(id);
  if (!m || m.owner !== actor) throw new MollaError(404, '기억을 찾을 수 없어요');
  return m;
}
const normalize = (s) => s.toLowerCase().replace(/\s+/g, '');

export function rememberMemory(actor, body) {
  const text = str(body.text, 'text', { max: 300 });
  const m = { id: nextId('mem'), owner: actor, text, sharedWith: [], createdAt: Date.now(), updatedAt: Date.now() };
  S.memories.set(m.id, m);
  record('fa:FactStated', { actor, payload: { memoryId: m.id, text } });
  return { memory: m };
}

export function searchMemories(actor, body) {
  const query = str(body.query, 'query', { required: false, max: 300 });
  const q = query ? normalize(query) : '';
  const memories = [...S.memories.values()].filter((m) => m.owner === actor && (!q || normalize(m.text).includes(q)));
  return { memories };
}

export function correctMemory(actor, body) {
  const m = ownMemory(actor, str(body.id, 'id', { max: 100 }));
  m.text = str(body.text, 'text', { max: 300 });
  m.updatedAt = Date.now();
  record('fa:FactCorrected', { actor, payload: { memoryId: m.id, text: m.text } });
  return { memory: m };
}

export function forgetMemory(actor, body) {
  const m = ownMemory(actor, str(body.id, 'id', { max: 100 }));
  S.memories.delete(m.id);
  record('fa:FactRetracted', { actor, payload: { key: `memory:${m.id}` } });
  return { deleted: m.id };
}

export function sharedMemories(actor) {
  const all = [...S.memories.values()];
  return {
    shared_with_me: all.filter((m) => m.sharedWith.includes(actor)).map((m) => ({ ...m, ownerName: N(m.owner) })),
    shared_by_me: all.filter((m) => m.owner === actor && m.sharedWith.length > 0),
  };
}

export function shareMemory(actor, body) {
  const m = ownMemory(actor, str(body.id, 'id', { max: 100 }));
  const grantee = str(body.grantee, 'grantee', { max: 100 });
  if (!member(grantee) || grantee === actor) throw new MollaError(400, '공유할 가족을 확인할 수 없어요');
  if (!m.sharedWith.includes(grantee)) {
    m.sharedWith.push(grantee);
    record('fa:FactShared', { actor, payload: { memoryId: m.id, grantee } });
  }
  return { memory: m };
}

export function revokeMemory(actor, body) {
  const m = ownMemory(actor, str(body.id, 'id', { max: 100 }));
  const grantee = str(body.grantee, 'grantee', { max: 100 });
  if (m.sharedWith.includes(grantee)) {
    m.sharedWith = m.sharedWith.filter((g) => g !== grantee);
    record('fa:FactUnshared', { actor, payload: { memoryId: m.id, grantee } });
  }
  return { memory: m };
}

// ------------------------------------------------------------- contacts

export function addContact(actor, body) {
  const name = str(body.name, 'name', { max: 40 });
  const relation = str(body.relation, 'relation', { max: 20 });
  const phone = str(body.phone, 'phone', { max: 24 });
  if (!/^[0-9+\-\s()]{7,24}$/.test(phone)) throw new MollaError(400, 'Invalid argument: phone');
  const c = { id: nextId('contact'), owner: actor, name, relation, phone, createdAt: Date.now() };
  S.contacts.set(c.id, c);
  return { contact: c };
}

export function removeContact(actor, body) {
  const c = S.contacts.get(str(body.id, 'id', { max: 100 }));
  if (!c || c.owner !== actor) throw new MollaError(404, '연락처를 찾을 수 없어요');
  S.contacts.delete(c.id);
  return { deleted: c.id };
}

// ------------------------------------------------- ontology / phone / consent

export function ontology(actor) {
  const f = fam();
  const delegatedToMe = Object.fromEntries(
    Object.entries(f.delegations).filter(([, d]) => d[actor]).map(([owner, d]) => [owner, d[actor]]),
  );
  return {
    owner: actor,
    me: member(actor),
    family: Object.values(f.members).filter((m) => m.role !== 'agent').map((m) => member(m.id)),
    consent: f.consent?.[actor] ?? 'active',
    delegated_by_me: f.delegations[actor] ?? {},
    delegated_to_me: delegatedToMe,
    rules: {
      read: '조회: 본인 또는 read 위임을 받은 가족',
      setup: '계정 연결: 비밀번호는 계정 주인만 입력',
      act: '실행: 계정 주인의 승인',
      money: '돈이 나가는 행동: 계정 주인 + 가족 1명 승인 (요청자·수혜자 제외), 위임 불가',
    },
  };
}

export function phoneDiagnose(actor) {
  return {
    owner: actor,
    binding: { type: 'mock_vm', status: 'ready', android: false, connections: connections(actor) },
    can_send_sms: false,
    note: '데모용 모의 VM이에요. 실제 Android 기기 바인딩은 없어요.',
  };
}

export function phonePlan(actor, body) {
  const c = S.contacts.get(str(body.contactId, 'contactId', { max: 100 }));
  if (!c || c.owner !== actor) throw new MollaError(404, '연락처를 찾을 수 없어요');
  const draft = str(body.draft, 'draft');
  const masked = c.phone.replace(/\d(?=\d{4})/g, '*');
  return {
    plan: {
      steps: ['문자 앱 열기', `받는 사람: ${c.name} (${masked})`, '본문 입력', '보내기 버튼 앞에서 멈춤 · 주인이 직접 확인'],
      will_send: false,
      contact: { id: c.id, name: c.name },
      draft,
    },
  };
}

export function setConsent(actor, body) {
  const value = str(body.value, 'value', { max: 10 });
  if (!['active', 'revoked'].includes(value)) throw new MollaError(400, 'Invalid argument: value');
  fam().consent[actor] = value;
  if (value === 'revoked') {
    // Pending requests from others stop too, on both surfaces.
    engine.cancelRequestsFor(actor);
    for (const t of S.tasks.values()) {
      if (t.owner === actor && t.requester !== actor && t.status === 'awaiting_approval') {
        t.status = 'cancelled';
        t.updatedAt = Date.now();
      }
    }
  }
  record('fa:ConsentChanged', { actor, payload: { value } });
  return { consent: value };
}

// -------------------------------------------------------------- invites

export function createInvite(actor, body) {
  const name = str(body.name, 'name', { max: 20 });
  const code = randomBytes(4).toString('hex').toUpperCase();
  const invite = { code, name, createdBy: actor, expiresAt: Date.now() + 24 * 3600 * 1000 };
  S.invites.set(code, invite);
  return { invite };
}

export function acceptInvite(sid, body) {
  const code = str(body.code, 'code', { max: 8 }).toUpperCase();
  const invite = S.invites.get(code);
  if (!invite || invite.expiresAt < Date.now()) throw new MollaError(404, '초대 코드를 찾을 수 없어요');
  const id = `m_${code.toLowerCase()}`;
  const f = fam();
  if (!f.members[id]) {
    // Guests can chat and own their own data, but don't count as family for
    // money co-signing or family transfers until the elders admit them.
    f.members[id] = { id, name: invite.name, relation: '초대 손님', role: 'guest', avatar: '🙂' };
    f.delegations[id] = {};
    f.consent[id] = 'active';
  }
  S.invites.delete(code);
  S.sessions.get(sid).actor = id;
  return { me: member(id), mode: 'demo' };
}
