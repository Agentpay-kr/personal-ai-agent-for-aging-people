// FA engine: rooms, the action gateway (policy -> VM), approvals, secure inputs,
// and per-viewer views of chat cards.
//
// Security rules enforced here (not in the LLM):
//   - `requester` is always the authenticated message sender; the LLM cannot pick it.
//   - Every action goes through policy.evaluate before anything runs.
//   - Credentials are only accepted from the account owner, and never echoed back.

import { seedFamily, FA_ID, nameOf, polish, getMember, isPerson } from './family.js';
import { evaluate, ACTIONS, canVote, approvalState, approverRole } from './policy.js';
import { SERVICES, storeCredentials, isConnected, connections, resetVault } from './vault.js';
import { runInVm, resetVms, won, vmState, catalogPrice } from './vm.js';
import * as store from './store.js';
import { remember, logDecision } from './memory.js';
import { replyAsFa, agentMode } from './agent.js';

export let family = seedFamily();

export class EngineError extends Error {
  constructor(status, message) {
    super(polish(message));
    this.status = status;
  }
}

const N = (id) => nameOf(family, id);

export function resetAll() {
  family = seedFamily();
  store.resetStore();
  resetVault();
  resetVms();
  vmLocks.clear();
}

// One action at a time per owner VM, so concurrent approvals can't both act on the same state.
const vmLocks = new Map();
function withVmLock(owner, fn) {
  const run = (vmLocks.get(owner) ?? Promise.resolve()).then(fn, fn);
  vmLocks.set(owner, run.catch(() => {}));
  return run;
}

// ---------------------------------------------------------------- rooms

const FA_GREETING =
  '안녕하세요, 우리 가족 AI 비서 FA예요 🙂\n' +
  '구독 정리, 장보기 주문, 계정 연결을 도와드려요.\n' +
  '비밀번호는 각자 화면에서만 입력하니 안심하세요.';

function requireMember(id) {
  if (!getMember(family, id)) throw new EngineError(400, `unknown member: ${id}`);
}

function requireRoom(roomId) {
  const room = store.getRoom(roomId);
  if (!room) throw new EngineError(404, 'room not found');
  return room;
}

export function createRoom({ name, members = [], createdBy }) {
  requireMember(createdBy);
  const ids = [...new Set([createdBy, ...members])];
  ids.forEach(requireMember);
  const room = {
    id: store.newId('room'),
    name: name || ids.filter((id) => id !== createdBy).map(N).join(', ') || '나와의 채팅',
    members: ids,
    createdBy,
    createdAt: Date.now(),
    events: [],
  };
  store.putRoom(room);
  const invited = ids.filter((id) => id !== createdBy);
  store.emit(room.id, { type: 'system', text: `${N(createdBy)}님이 ${invited.map((id) => `${N(id)}님`).join(', ')}을 초대했어요.` });
  if (ids.includes(FA_ID)) faSay(room.id, FA_GREETING);
  return summary(room);
}

export function invite({ roomId, by, members = [] }) {
  const room = requireRoom(roomId);
  if (!room.members.includes(by)) throw new EngineError(403, '방 멤버만 초대할 수 있어요');
  const added = members.filter((id) => !room.members.includes(id));
  added.forEach(requireMember);
  if (added.length === 0) return summary(room);
  room.members.push(...added);
  store.emit(roomId, { type: 'system', text: `${N(by)}님이 ${added.map((id) => `${N(id)}님`).join(', ')}을 초대했어요.` });
  if (added.includes(FA_ID)) faSay(roomId, FA_GREETING);
  return summary(room);
}

export function leave({ roomId, userId }) {
  const room = requireRoom(roomId);
  if (!room.members.includes(userId)) throw new EngineError(400, '이 방의 멤버가 아니에요');
  store.emit(roomId, { type: 'system', text: `${N(userId)}님이 나갔어요.` });
  room.members = room.members.filter((id) => id !== userId);
  return summary(room);
}

export function rename({ roomId, by, name }) {
  const room = requireRoom(roomId);
  if (!room.members.includes(by)) throw new EngineError(403, '방 멤버만 이름을 바꿀 수 있어요');
  if (!name?.trim()) throw new EngineError(400, 'name is required');
  room.name = name.trim();
  store.emit(roomId, { type: 'system', text: `${N(by)}님이 방 이름을 '${room.name}'(으)로 바꿨어요.` });
  return summary(room);
}

function summary(room) {
  const last = [...room.events].reverse().find((e) => e.type === 'text');
  return {
    id: room.id,
    name: room.name,
    members: room.members,
    createdBy: room.createdBy,
    createdAt: room.createdAt,
    lastMessage: last ? { from: last.from, text: last.text, ts: last.ts } : null,
  };
}

export function listRooms(viewer) {
  return store.allRooms().filter((r) => r.members.includes(viewer)).map(summary);
}

export function roomMessages(roomId, viewer) {
  const room = requireRoom(roomId);
  if (!room.members.includes(viewer)) throw new EngineError(403, '이 방의 멤버가 아니에요');
  return room.events.map((e) => viewFor(e, viewer));
}

// ------------------------------------------------------------- messages

function faSay(roomId, text) {
  if (!text) return null;
  return store.emit(roomId, { type: 'text', from: FA_ID, text });
}

function system(roomId, text) {
  return store.emit(roomId, { type: 'system', text });
}

export function postMessage({ roomId, from, text }) {
  const room = requireRoom(roomId);
  requireMember(from);
  if (!room.members.includes(from)) throw new EngineError(403, '이 방의 멤버가 아니에요');
  if (!text?.trim()) throw new EngineError(400, 'text is required');
  const e = store.emit(roomId, { type: 'text', from, text: text.trim() });
  if (from !== FA_ID && room.members.includes(FA_ID)) {
    // One FA turn at a time per room, so replies never interleave.
    room.faQueue = (room.faQueue ?? Promise.resolve())
      .then(() => handleFa(roomId, from, text.trim()))
      .catch((err) => console.error('[FA] turn failed:', err));
  }
  return e;
}

async function handleFa(roomId, requester, text) {
  store.emit(roomId, { type: 'typing', from: FA_ID, on: true }, { persist: false });
  try {
    const reply = await replyAsFa({
      family,
      requester,
      text,
      context: buildContext(roomId),
      // The requester is bound here: the model can choose the action, never who is asking.
      requestAction: ({ action, input }) => requestAction({ roomId, requester, action, input }),
    });
    faSay(roomId, reply);
  } finally {
    store.emit(roomId, { type: 'typing', from: FA_ID, on: false }, { persist: false });
  }
}

function buildContext(roomId) {
  const room = store.getRoom(roomId);
  const recent = room.events
    .filter((e) => e.type === 'text')
    .slice(-12)
    .map((e) => `[${N(e.from)}] ${e.text}`)
    .join('\n');
  const conn = ['mom', 'dad', 'son']
    .map((id) => `${N(id)}: ${connections(id).filter((c) => c.connected).map((c) => c.label).join(', ') || '없음'}`)
    .join(' / ');
  const pending = store
    .allRequests()
    .filter((r) => r.roomId === roomId && r.status === 'pending')
    .map((r) => `- ${r.kind === 'input' ? `${N(r.owner)} ${SERVICES[r.service]?.label} 연결 대기` : `${ACTIONS[r.action]?.label} 승인 대기`}`)
    .join('\n');
  return [
    `방 이름: ${room.name} · 멤버: ${room.members.map(N).join(', ')}`,
    `연결된 계정 — ${conn}`,
    pending ? `대기 중인 요청:\n${pending}` : '대기 중인 요청: 없음',
    `최근 대화:\n${recent}`,
  ].join('\n');
}

// -------------------------------------------------------------- gateway

export async function requestAction({ roomId, requester, action, input = {} }) {
  const room = requireRoom(roomId);
  if (!room.members.includes(requester)) throw new EngineError(403, '이 방의 멤버가 아니에요');
  input = { ...input };
  const owner = input.owner ?? requester;
  if (action === 'order_item') {
    // Price comes from the VM catalog when known, never just from the request.
    input.price = catalogPrice(input.item) ?? input.price;
  }
  const decision = evaluate(family, { requester, owner, action, input });
  decision.reason = polish(decision.reason);
  logDecision(`${N(requester)} → ${ACTIONS[action]?.label ?? action} @ ${N(owner)} 계정: ${decision.decision} — ${decision.reason}`);

  // Cards that need the owner must land where the owner can see them.
  if ((decision.decision === 'needs_input' || decision.decision === 'needs_approval') && !room.members.includes(owner)) {
    const reason = polish(`${N(owner)}님이 이 방에 없어요. ${N(owner)}님이 있는 방에서 요청해 주세요.`);
    store.emit(roomId, { type: 'card.blocked', from: FA_ID, action, actionLabel: ACTIONS[action]?.label ?? action, owner, requester, reason });
    return out('denied', { reason }, `🔒 ${reason}`);
  }

  switch (decision.decision) {
    case 'deny':
      store.emit(roomId, { type: 'card.blocked', from: FA_ID, action, actionLabel: ACTIONS[action]?.label ?? action, owner, requester, reason: decision.reason });
      return out('denied', { reason: decision.reason }, `🔒 ${decision.reason}`);
    case 'needs_input':
      return createInputRequest({ roomId, requester, owner, service: input.service, decision });
    case 'needs_approval':
      return createApprovalRequest({ roomId, requester, owner, action, input, decision });
    case 'allow':
      return execute({ roomId, requester, owner, action, input });
    default:
      throw new Error(`unexpected decision ${decision.decision}`);
  }
}

function out(status, data, say) {
  return { status, ...data, say: polish(say), forModel: { status, ...data } };
}

function execute(args) {
  return withVmLock(args.owner, () => executeNow(args));
}

async function executeNow({ roomId, requester, owner, action, input, approvalId = null }) {
  const spec = ACTIONS[action];
  // Re-check right before running: consent or delegation may have changed while it waited.
  const recheck = evaluate(family, { requester, owner, action, input });
  if (recheck.decision === 'deny') {
    const reason = polish(recheck.reason);
    store.emit(roomId, { type: 'card.blocked', from: FA_ID, action, actionLabel: spec.label, owner, requester, reason });
    return out('denied', { reason }, `🔒 ${reason}`);
  }
  if (spec.service && !isConnected(owner, spec.service)) {
    const connectDecision = evaluate(family, { requester, owner, action: 'connect_account', input: { service: spec.service } });
    if (connectDecision.decision !== 'needs_input') {
      return out('blocked', { reason: `${N(owner)}님 ${SERVICES[spec.service].label}이 아직 연결되지 않았어요.` },
        `${N(owner)}님 ${SERVICES[spec.service].label}이 아직 연결되지 않았어요.`);
    }
    return createInputRequest({
      roomId, requester, owner, service: spec.service, decision: connectDecision,
      then: { requester, owner, action, input, approvalId },
    });
  }

  const log = (text) => store.emit(roomId, { type: 'vm.log', owner, text: `[${N(owner)} VM] ${text}` });
  let result;
  try {
    result = await runInVm(owner, action, input, log);
  } catch (err) {
    store.emit(roomId, { type: 'card.result', from: FA_ID, ok: false, title: `${spec.label} 실패`, lines: [err.message] });
    return out('failed', { reason: err.message }, `${spec.label} 중에 문제가 생겼어요: ${err.message}`);
  }
  return present({ roomId, requester, owner, action, result });
}

function present({ roomId, requester, owner, action, result }) {
  switch (action) {
    case 'scan_subscriptions': {
      const items = result.subscriptions;
      store.emit(roomId, {
        type: 'card.subscriptions', from: FA_ID, owner, requester,
        title: `${N(owner)}님 정기결제 ${items.length}건`,
        items, totalMonthly: result.totalMonthly,
        selectableBy: [...new Set([requester, owner])],
      });
      const unused = items.filter((s) => s.recommend === 'cancel').map((s) => s.name);
      remember(N(owner), `정기결제 ${items.length}건 확인 (월 ${won(result.totalMonthly)})`);
      return out('done', {
        subscriptions: items.map(({ id, name, monthly, usage, recommend }) => ({ id, name, monthly, usage, recommend })),
        totalMonthly: result.totalMonthly,
      },
      `${N(owner)}님 메일에서 정기결제 ${items.length}건을 찾았어요. 매달 ${won(result.totalMonthly)}이 나가고 있어요.` +
        (unused.length ? ` 잘 안 쓰는 건 ${unused.join(', ')}이에요. 해지할 항목을 골라주세요.` : ''));
    }
    case 'cancel_subscription': {
      if (result.cancelled.length === 0) {
        store.emit(roomId, { type: 'card.result', from: FA_ID, ok: false, owner, title: '해지할 항목 없음', lines: ['이미 해지됐거나 찾을 수 없는 구독이에요.'] });
        return out('failed', { reason: '이미 해지됐거나 찾을 수 없는 구독이에요.' }, '이미 해지됐거나 찾을 수 없는 구독이에요.');
      }
      const names = result.cancelled.map((s) => s.name);
      store.emit(roomId, {
        type: 'card.result', from: FA_ID, ok: true, owner,
        title: '해지 완료',
        lines: result.cancelled.map((s) => `${s.name} · 월 ${won(s.monthly)}`),
        highlight: `매달 ${won(result.monthlySaved)} 절약`,
      });
      remember(N(owner), `구독 해지: ${names.join(', ')} (월 ${won(result.monthlySaved)} 절약, 요청: ${N(requester)})`);
      return out('done', { cancelled: names, monthlySaved: result.monthlySaved },
        `✅ ${names.join(', ')} 해지했어요! 이제 매달 ${won(result.monthlySaved)}씩 아껴요.`);
    }
    case 'order_item': {
      const o = result.order;
      store.emit(roomId, {
        type: 'card.result', from: FA_ID, ok: true, owner,
        title: '주문 완료', lines: [`${o.item} × ${o.quantity}`, won(o.price), o.eta],
      });
      remember(N(owner), `주문: ${o.item} (${won(o.price)}, 요청: ${N(requester)})`);
      return out('done', { order: o }, `🛒 ${o.item} 주문했어요. ${o.eta}이에요.`);
    }
    case 'transfer_money': {
      const t = result.transfer;
      store.emit(roomId, {
        type: 'card.result', from: FA_ID, ok: true, owner,
        title: '이체 완료', lines: [`${N(owner)} → ${N(t.to)}`, won(t.amount)],
      });
      remember(N(owner), `이체: ${N(t.to)}에게 ${won(t.amount)} (요청: ${N(requester)}, 가족 승인 완료)`);
      return out('done', { transfer: t }, `💸 ${N(owner)}님 계좌에서 ${N(t.to)}님에게 ${won(t.amount)}을 보냈어요.`);
    }
    default:
      return out('done', { result }, '완료했어요.');
  }
}

// --------------------------------------------------------- secure input

function createInputRequest({ roomId, requester, owner, service, decision, then = null }) {
  const svc = SERVICES[service];
  if (!svc) return out('denied', { reason: `연결할 수 없는 서비스예요 (${service}).` }, '그 서비스는 아직 연결할 수 없어요.');
  if (isConnected(owner, service) && !then) {
    return out('done', { alreadyConnected: true }, `${N(owner)}님 ${svc.label}은 이미 연결돼 있어요.`);
  }
  const r = {
    id: store.newId('req'), kind: 'input', roomId, requester, owner, service,
    decision, then, status: 'pending', votes: {}, createdAt: Date.now(),
  };
  store.putRequest(r);
  emitInputCard(r);
  const who = requester === owner ? '' : `${N(owner)}님 화면에 `;
  const say =
    (then ? `먼저 ${N(owner)}님 ${svc.label} 연결이 필요해요. ` : '') +
    `${who}${svc.label} 연결 버튼을 보냈어요 📩 비밀번호는 ${N(owner)}님만 입력하고, 가족에게도 보이지 않아요.`;
  return out('waiting_input', { requestId: r.id, waitingFor: owner, service }, say);
}

function emitInputCard(r, extra = {}) {
  const svc = SERVICES[r.service];
  store.emit(r.roomId, {
    id: r.id, type: 'card.input_request', from: FA_ID,
    owner: r.owner, requester: r.requester, service: r.service, serviceLabel: svc.label,
    title: `${N(r.owner)}님 ${svc.label} 연결`,
    body: r.requester === r.owner
      ? '아래 버튼을 눌러 직접 로그인해 주세요.'
      : `${N(r.requester)}님이 ${N(r.owner)}님 ${svc.label} 연결을 부탁했어요. 비밀번호는 ${N(r.owner)}님만 입력할 수 있어요.`,
    fields: svc.fields,
    status: r.status,
    ...extra,
  });
}

export async function submitInput({ requestId, userId, values = {} }) {
  const r = store.getRequest(requestId);
  if (!r || r.kind !== 'input') throw new EngineError(404, 'request not found');
  if (r.status !== 'pending') throw new EngineError(409, '이미 처리된 요청이에요');
  if (userId !== r.owner) throw new EngineError(403, `${N(r.owner)}님만 입력할 수 있어요. 가족도 대신 입력할 수 없어요.`);
  if (!values.id || !values.password) throw new EngineError(400, '아이디와 비밀번호를 모두 입력해 주세요');

  const svc = SERVICES[r.service];
  r.status = 'connecting';
  emitInputCard(r);
  const log = (text) => store.emit(r.roomId, { type: 'vm.log', owner: r.owner, text: `[${N(r.owner)} VM] ${text}` });
  try {
    await runInVm(r.owner, 'connect_account', { service: r.service, serviceLabel: svc.label }, log);
  } catch (err) {
    r.status = 'pending'; // let the owner try again
    emitInputCard(r);
    throw new EngineError(502, `연결에 실패했어요: ${err.message}`);
  }
  const { maskedId } = storeCredentials(r.owner, r.service, { id: values.id, password: values.password });
  r.status = 'done';
  emitInputCard(r, { maskedId });
  remember(N(r.owner), `${svc.label} 연결됨 (${maskedId})`);
  faSay(r.roomId, `✅ ${N(r.owner)}님 ${svc.label} 연결 완료! 비밀번호는 ${N(r.owner)}님 전용 공간의 금고에만 있고, 가족에게도 보이지 않아요.`);

  if (r.then) {
    // Resume the action that was waiting for this account. execute() re-checks the policy first.
    const result = await execute({ roomId: r.roomId, ...r.then });
    if (r.then.approvalId) settleApproval(store.getRequest(r.then.approvalId), result);
    faSay(r.roomId, result.say);
  }
  return { ok: true, maskedId };
}

// Record what actually happened to an approved request (done / failed / still waiting).
function settleApproval(r, result) {
  if (!r) return;
  r.result = result.forModel;
  r.updatedAt = Date.now();
  if (['failed', 'denied', 'blocked'].includes(result.status)) r.status = 'failed';
  else if (result.status === 'done') r.status = 'done';
  emitApprovalCard(r);
}

// ------------------------------------------------------------ approvals

function approvalSummary({ requester, owner, action, input }) {
  switch (action) {
    case 'cancel_subscription': {
      const subs = vmState(owner).subscriptions.filter((s) => (input.subscription_ids ?? []).includes(s.id) && s.status === 'active');
      const saved = subs.reduce((a, s) => a + s.monthly, 0);
      return {
        title: `${N(requester)}님이 구독 ${subs.length}개 해지를 부탁했어요`,
        lines: subs.map((s) => `${s.name} · 월 ${won(s.monthly)} · ${s.usage}`),
        highlight: `해지하면 매달 ${won(saved)} 아껴요`,
        approveLabel: '네, 해지해 주세요',
        valid: subs.length > 0,
      };
    }
    case 'order_item':
      return {
        title: `${N(requester)}님이 주문을 부탁했어요`,
        lines: [`${input.item} × ${input.quantity ?? 1}`, won(input.price ?? 0), `배송지: ${N(owner)}님 집`],
        approveLabel: '네, 주문해 주세요',
        valid: true,
      };
    case 'transfer_money':
      return {
        title: `${N(requester)}님이 ${N(owner)}님 계좌에서 돈을 보내달래요`,
        lines: [`${N(owner)} → ${input.to === 'external' ? '가족 외 계좌' : N(input.to)}`, won(input.amount ?? 0)],
        highlight: '돈이 나가는 요청 · 가족 2명 승인 필요',
        approveLabel: '네, 보내 주세요',
        valid: Number(input.amount) > 0,
      };
    default:
      return { title: ACTIONS[action]?.label ?? action, lines: [], approveLabel: '네', valid: true };
  }
}

function createApprovalRequest({ roomId, requester, owner, action, input, decision }) {
  const s = approvalSummary({ requester, owner, action, input });
  if (!s.valid) return out('denied', { reason: '요청 내용을 확인할 수 없어요.' }, '요청 내용을 확인할 수 없어요. 다시 말씀해 주세요.');
  const r = {
    id: store.newId('req'), kind: 'approval', roomId, requester, owner, action, input,
    decision, summary: s, status: 'pending', votes: {}, createdAt: Date.now(),
  };
  store.putRequest(r);
  emitApprovalCard(r);
  const money = decision.tier === 'money';
  const say = money
    ? `🔒 ${decision.reason}`
    : `${N(owner)}님께 확인 요청을 보냈어요. '네'를 누르시면 바로 진행할게요.`;
  return out('waiting_approval', {
    requestId: r.id,
    needs: { required: decision.approvals.required, anyOf: decision.approvals.anyOf },
    reason: decision.reason,
  }, say);
}

function emitApprovalCard(r) {
  store.emit(r.roomId, {
    id: r.id, type: 'card.approval_request', from: FA_ID,
    action: r.action, actionLabel: ACTIONS[r.action].label, tier: r.decision.tier,
    owner: r.owner, requester: r.requester,
    ...r.summary,
    rejectLabel: '아니요',
    approvals: r.decision.approvals,
    reason: r.decision.reason,
    votes: { ...r.votes },
    status: r.status,
  });
}

export async function vote({ requestId, userId, vote: v }) {
  const r = store.getRequest(requestId);
  if (!r || r.kind !== 'approval') throw new EngineError(404, 'request not found');
  if (!['approve', 'reject'].includes(v)) throw new EngineError(400, "vote must be 'approve' or 'reject'");
  if (r.status !== 'pending') throw new EngineError(409, '이미 처리된 요청이에요');
  if (!canVote(r, userId)) {
    const why = r.decision.beneficiary === userId
      ? '돈을 받는 사람은 승인할 수 없어요.'
      : userId === r.requester ? '요청한 사람은 승인할 수 없어요.' : '이 요청을 승인할 사람이 아니에요.';
    throw new EngineError(403, why);
  }
  r.votes[userId] = v;
  const state = approvalState(r);
  system(r.roomId, `${N(userId)}님이 ${v === 'approve' ? '승인' : '거절'}했어요.`);
  logDecision(`${N(userId)} ${v} → ${r.actionLabel ?? ACTIONS[r.action].label} (${r.id}) → ${state}`);

  if (state === 'rejected') {
    r.status = 'rejected';
    emitApprovalCard(r);
    faSay(r.roomId, `알겠어요. ${ACTIONS[r.action].label}은 진행하지 않을게요.`);
    return { status: r.status };
  }
  if (state === 'pending') {
    emitApprovalCard(r);
    const a = r.decision.approvals;
    const waiting = [
      ...a.required.filter((id) => r.votes[id] !== 'approve').map(N),
      ...(a.anyOf && a.anyOf.from.filter((id) => r.votes[id] === 'approve').length < a.anyOf.count
        ? [a.anyOf.from.map(N).join(' 또는 ')]
        : []),
    ];
    faSay(r.roomId, `${N(userId)}님 승인 ✅ 이제 ${waiting.join(', ')}님 승인만 남았어요.`);
    return { status: r.status };
  }

  r.status = 'approved';
  emitApprovalCard(r);
  const result = await execute({
    roomId: r.roomId, requester: r.requester, owner: r.owner, action: r.action, input: r.input, approvalId: r.id,
  });
  settleApproval(r, result);
  faSay(r.roomId, result.say);
  return { status: r.status, result: result.forModel };
}

export function cancelRequest({ requestId, userId }) {
  const r = store.getRequest(requestId);
  if (!r) throw new EngineError(404, 'request not found');
  if (r.status !== 'pending') throw new EngineError(409, '이미 처리된 요청이에요');
  if (userId !== r.requester && userId !== r.owner) throw new EngineError(403, '요청한 사람이나 계정 주인만 취소할 수 있어요');
  r.status = 'cancelled';
  r.updatedAt = Date.now();
  if (r.kind === 'input') emitInputCard(r);
  else emitApprovalCard(r);
  system(r.roomId, `${N(userId)}님이 요청을 취소했어요.`);
  return { status: r.status };
}

// When an owner switches family help off, drop everything others asked of them.
export function cancelRequestsFor(owner) {
  for (const r of store.allRequests()) {
    if (r.owner === owner && r.requester !== owner && r.status === 'pending') {
      r.status = 'cancelled';
      r.updatedAt = Date.now();
      if (r.kind === 'input') emitInputCard(r);
      else emitApprovalCard(r);
      system(r.roomId, polish(`${N(owner)}님이 가족 도움을 꺼서 요청이 취소됐어요.`));
    }
  }
}

// ---------------------------------------------------------------- views

export function viewFor(e, viewer) {
  if (e.type === 'card.input_request') {
    const r = store.getRequest(e.id);
    const isOwner = viewer === e.owner;
    return {
      ...e,
      canAct: Boolean(r) && r.status === 'pending' && isOwner,
      hint: isOwner ? null : polish(`${N(e.owner)}님 화면에서만 입력할 수 있어요`),
      fields: isOwner ? e.fields : [],
    };
  }
  if (e.type === 'card.approval_request') {
    const r = store.getRequest(e.id);
    return {
      ...e,
      canAct: Boolean(r) && canVote(r, viewer),
      myRole: r ? approverRole(r, viewer) : null,
    };
  }
  if (e.type === 'card.subscriptions') {
    return { ...e, canAct: e.selectableBy.includes(viewer) };
  }
  return e;
}

export function isVisibleTo(e, viewer) {
  const room = store.getRoom(e.roomId);
  return Boolean(room?.members.includes(viewer));
}

// ---------------------------------------------------------------- state

export function familyInfo() {
  return {
    members: Object.values(family.members),
    delegations: family.delegations,
    connections: Object.fromEntries(['mom', 'dad', 'son'].map((id) => [id, connections(id)])),
    mode: agentMode(),
  };
}

export function vmInfo(owner, viewer) {
  if (!isPerson(family, owner)) throw new EngineError(404, 'unknown member');
  // Same rule as any read: the owner, or someone the owner delegated "read" to.
  const d = evaluate(family, { requester: viewer, owner, action: 'scan_subscriptions' });
  if (d.decision !== 'allow') throw new EngineError(403, polish(d.reason));
  return { ...vmState(owner), connections: connections(owner) };
}
