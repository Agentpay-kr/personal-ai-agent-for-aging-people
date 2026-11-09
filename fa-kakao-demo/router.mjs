import { randomUUID } from 'node:crypto';
import { createDemoVmAgent, DEMO_SUBSCRIPTIONS, DEMO_VM_BINDINGS } from './vm-agent.mjs';
import { createTrustGate, isMoneyRequest, TRUST_ACTIONS } from './trust-gate.mjs';
// The FA engine's family permission engine decides who may do what (fa-engine/src/policy.js).
// Money requests go to fa-trust first (device proofs, trust panel); the FA engine's family
// multisig below is the fallback when fa-trust isn't available. Both apply the same rule:
// account owner + one family co-signer, requester and beneficiary excluded.
import { evaluate, canVote, approvalState } from '../fa-engine/src/policy.js';
import { seedFamily, polish } from '../fa-engine/src/family.js';
import { catalogPrice } from '../fa-engine/src/vm.js';

const LABEL = { mom: '엄마', dad: '아빠', son: '아들' };
// Korean particles: 받침 decides 이/가 and 와/과.
const hasBatchim = (word) => { const c = word.charCodeAt(word.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0; };
const subj = (word) => word + (hasBatchim(word) ? '이' : '가');
const obj = (word) => word + (hasBatchim(word) ? '을' : '를');
const andJoin = (words) => words.reduce((acc, w, i) => (i === 0 ? w : acc + (hasBatchim(words[i - 1]) ? '과 ' : '와 ') + w), '');
const MEMBERS = new Set([...Object.keys(LABEL), 'aunt', 'friend', 'fa']);
const ACTIONS = new Set(['welcome', 'chat', 'setup', 'login', 'scope', 'deny', 'scan', 'propose', 'approve', 'cosign', 'retire',
  'route_approve', 'route_deny', ...TRUST_ACTIONS]);
const SERVICES = { coupang: '쿠팡', email: '이메일' };
const FAMILY = (() => {
  const family = seedFamily();
  family.members.son.name = LABEL.son; // this demo calls the son "아들"
  return family;
})();
const policy = (requester, owner, action, input) => {
  const decision = evaluate(FAMILY, { requester, owner, action, input });
  // The demo calls the son "아들"; drop the honorific (아들님이 -> 아들이, particles already fit).
  return { ...decision, reason: polish(decision.reason).replace(/아들님/g, '아들') };
};
const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const FIELDS = new Set(['demo_id', 'room_id', 'members', 'actor', 'action', 'value', 'step_id', 'approval_id']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANCEL = /(?:해지|구독\s*취소)(?:\s*(?:좀\s*)?(?:해\s*줘(?:요)?|해\s*주세요|해\s*줄래|할래|하고\s*싶어(?:요)?|요청(?:해줘|할게요)?))?[.!。！]?$/;
const space = (owner) => `${LABEL[owner]}의 VM`;

function isId(value) {
  return typeof value === 'string' && UUID.test(value);
}

export function validRouterRequest(body) {
  return body && typeof body === 'object' && Object.keys(body).every((key) => FIELDS.has(key))
    && isId(body.demo_id) && isId(body.room_id)
    && MEMBERS.has(body.actor) && body.actor !== 'fa'
    && Array.isArray(body.members) && body.members.length <= MEMBERS.size
    && body.members.every((id) => MEMBERS.has(id))
    && new Set(body.members).size === body.members.length
    && body.members.includes(body.actor) && body.members.includes('fa')
    && ACTIONS.has(body.action)
    && (body.step_id === undefined || isId(body.step_id))
    && (body.approval_id === undefined || (body.action === 'chat' && isId(body.approval_id)))
    && (body.action !== 'chat' && body.value === undefined
      || typeof body.value === 'string' && body.value.length <= 6_000);
}

const WHO = [[/엄마|어머니/, 'mom'], [/아빠|아버지/, 'dad'], [/아들/, 'son']];
const whoIs = (word) => WHO.find(([re]) => re.test(word))?.[1];

// "엄마의 계좌에서 50만원만 내 계좌로 옮겨줘" -> { owner: 'mom', to: actor, amount: 500000 }
function parseTransfer(query, actor) {
  const from = query.match(/(엄마|어머니|아빠|아버지|아들)\s*(?:의)?\s*(?:통장|계좌)에서/)?.[1];
  let to;
  if (/(?:내|제)\s*(?:통장|계좌)|나한테|저한테|나에게|저에게/.test(query)) to = actor;
  else {
    const target = query.match(/(엄마|어머니|아빠|아버지|아들)\s*(?:한테|에게|계좌로|통장으로)/)?.[1];
    to = target ? whoIs(target) : 'external';
  }
  const amount = query.match(/(\d[\d,]*)\s*(만)?\s*원/);
  return {
    owner: from ? whoIs(from) : actor,
    to,
    amount: amount ? Number(amount[1].replace(/,/g, '')) * (amount[2] ? 10_000 : 1) : null,
  };
}

function intent(text, actor) {
  const query = text.trim().replace(/^@FA\s*/i, '');
  if (/송금|이체|계좌.*(?:옮겨|보내)/.test(query)) return { action: 'transfer', transfer: parseTransfer(query, actor) };
  if (/^(?:해지 )?승인\s*(?:해요|할게요?|합니다|하겠습니다)[.!。！]?$/.test(query)) return { action: 'approve' };
  if (/^(?:구독 (?:목록 보기|읽기)를? )?허용\s*(?:해요|할게요?|합니다|하겠습니다)[.!。！]?$/.test(query)) return { action: 'scope' };
  if (/^(?:거절|안 할래|안할래|허용 안 함|승인 안 함|해지하지 마|구독 유지할게요)[.!。！]?$/.test(query)) return { action: 'deny' };
  if (/[?？]|방법|어떻게|뭐야|무슨 뜻|할 수 있|라고|따옴표|하지\s*마|취소하지|해지 안/.test(query)) return null;

  // Routing scenes from the team diagram: whose VM does this request run in?
  const self = /(?:^|\s)(?:내|제|나의)\s/.test(query) || /^(?:내|제)\s/.test(query);
  const named = whoIs(query.match(/엄마|어머니|아빠|아버지|아들/)?.[0] ?? '');
  const routeOwner = self ? actor : (named ?? actor);
  const service = /쿠팡/.test(query) ? 'coupang' : /이메일|메일|지메일|gmail/i.test(query) ? 'email' : null;
  if (service && /(연동|연결|로그인)/.test(query)) {
    return { action: 'connect', route: { kind: 'connect', owner: routeOwner, service } };
  }
  if (/(주문|시켜|사\s*줘|사다\s*줘)/.test(query) && /(쌀|휴지|화장지|생수|라면)/.test(query)) {
    const item = /쌀/.test(query) ? `쌀 ${query.match(/(\d+)\s*(?:kg|킬로)/i)?.[1] ?? 10}kg`
      : /휴지|화장지/.test(query) ? '화장지 30롤' : /생수/.test(query) ? '생수 2L 12병' : '라면 5개입';
    return { action: 'order', route: { kind: 'order', owner: routeOwner, item, price: catalogPrice(item) ?? 15_000 } };
  }

  const services = DEMO_SUBSCRIPTIONS.filter(({ match }) => match.test(query));
  const owners = new Set();
  if (/엄마|어머니/.test(query)) owners.add('mom');
  if (/아빠|아버지/.test(query)) owners.add('dad');
  if (/아들/.test(query)) owners.add('son');
  if (/(?:^|\s)(?:내|제|나의)\s*(?:구독|정기|계정|티빙|멜론|네이버)/.test(query)) owners.add(actor);
  if (/이모|고모|삼촌|지민|할머니|할아버지|형|오빠|누나|언니|동생|딸|아내|남편|배우자|친구/.test(query)) owners.add('unsupported');

  const owner = owners.values().next().value;
  const target = owners.size > 1 || owner === 'unsupported' || /말고|빼고|됐고|제외/.test(query) ? 'ambiguous' : owner;
  if (/(연동|연결|로그인|세팅)/.test(query) && /계정|구독|엄마|아빠|어머니|아버지|데모/.test(query)) {
    return { action: 'setup', owner: target };
  }
  if (CANCEL.test(query)) {
    const prefix = query.replace(CANCEL, '').trim();
    const shorthand = /^(?:티빙|tving|멜론|melon|네이버(?:플러스)?|naver)(?:을|를)?(?:\s*구독(?:을|를)?)?$/i.test(prefix);
    return { action: 'propose', owner: target ?? (shorthand ? undefined : 'ambiguous'), value: services.length === 1 ? services[0].id : undefined };
  }
  if (/구독|멤버십|정기\s*결제/.test(query) && /정리|목록|찾아|보여|조회|확인해|살펴|알려줘|볼래/.test(query)) {
    const shorthand = /^(?:구독|멤버십|정기\s*결제)(?:\s*목록)?(?:을|를)?\s*(?:좀\s*)?(?:정리|찾아|보여|조회|확인|살펴|알려|볼래)/.test(query);
    return { action: 'scan', owner: target ?? (shorthand ? undefined : 'ambiguous') };
  }
  return null;
}

function transition(room, phase, owner, data) {
  room.flow = { phase, owner, step_id: randomUUID(), ...data };
}

function reply(room, text, card, visibleTo) {
  const { phase, owner, step_id } = room.flow;
  return {
    handled: Boolean(text),
    state: { phase, owner, step_id },
    messages: text ? [{
      by: 'fa',
      text,
      ...(card && { card: { ...card, ...(card.actions && { phase, step_id }) } }),
      ...(visibleTo && { visibleTo }),
    }] : [],
  };
}

// Several FA messages in one reply (used by the fa-trust security scenes).
function replyMany(room, items) {
  const { phase, owner, step_id } = room.flow;
  const messages = items.filter((item) => item?.text).map(({ text, card, visibleTo }) => ({
    by: 'fa',
    text,
    ...(card && { card: { ...card, ...(card.actions && { phase, step_id }) } }),
    ...(visibleTo && { visibleTo }),
  }));
  return { handled: messages.length > 0, state: { phase, owner, step_id }, messages };
}

// Money requests and trust buttons go to fa-trust. Returns a Promise, or null to fall through.
function routeTrust(room, gate, { actor, action, value }) {
  if (!gate) return null;
  if (action === 'chat' && isMoneyRequest(value)) {
    return gate.fromChat(room, actor, value).then((items) => replyMany(room, items));
  }
  if (TRUST_ACTIONS.has(action)) {
    return gate.button(room, actor, action, value).then((items) => replyMany(room, items));
  }
  return null;
}

function row(label, detail) {
  return { label, detail };
}

function button(action, label, { value, actor, actors, variant } = {}) {
  return { action, label, value, actor, actors, variant };
}

function readers(owner, grant) {
  return grant ? [owner, grant.actor] : [owner];
}

function welcome(room) {
  return reply(room, '안녕하세요, 가족의 일을 함께 도와드리는 FA예요.', {
    kind: 'welcome',
    title: '누구의 일을 도와드릴까요?',
    description: '“엄마 구독 좀 정리해줘”처럼 누구의 구독인지 알려 주세요.',
    ...(room.flow.phase === 'idle' && room.members.includes('mom') && {
      actions: [button('setup', '엄마 계정 연결 시작하기', { value: 'mom' })],
    }),
  });
}

function ready(room, owner, grant) {
  room.connections.set(owner, { grant });
  transition(room, 'ready', owner, { grant });
  const name = LABEL[owner];
  return reply(room, grant ? `${subj(name)} 아들에게 구독 목록 조회를 허용했어요.` : `${name}의 데모 계정이 연결됐어요.`, {
    kind: 'ready',
    title: '구독 목록을 확인할 수 있어요',
    description: grant ? '조회 결과는 지금 참여 중인 가족에게 공유돼요.' : '조회 결과는 계정 주인에게만 보여요.',
    rows: [row('허용된 범위', `${space(owner)}에서 구독 목록 조회`)],
    actions: [button('scan', `${name} 구독 목록 보기`, { actors: readers(owner, grant) })],
  }, grant?.visibleTo ?? [owner]);
}

function listCard(room, text) {
  const { owner, list, grant } = room.flow;
  return reply(room, text ?? `${space(owner)}에서 구독 ${list.subscriptions.length}개를 확인했어요.`, {
    kind: 'subscriptions',
    title: `${LABEL[owner]}의 구독 목록`,
    description: 'VM 에이전트가 돌려준 샘플 목록이에요.',
    rows: [
      row('요청한 사람', LABEL[list.actor]),
      row('작업 공간', space(owner)),
      row('실행 권한', list.actor === owner ? '본인 조회' : '계정 주인이 허용한 목록 조회'),
      ...list.subscriptions.map(({ name, price }) => row(name, price)),
    ],
    actions: list.subscriptions.map(({ id, name }) => button('propose', `${name} 해지 요청`, {
      value: id, actors: readers(owner, grant), variant: 'secondary',
    })),
  }, grant?.visibleTo ?? [owner]);
}

function run(vm, operation, actor, owner, args, authorization, requestId = randomUUID()) {
  const result = vm.execute({
    schema_version: '1.0', request_id: requestId, operation, actor, owner,
    vm_id: DEMO_VM_BINDINGS[owner], arguments: args, authorization,
  });
  if (result.request_id !== requestId || result.status !== 'simulated') {
    throw new Error('Unexpected demo VM result');
  }
  return result;
}

// ---- Money: family multisig from the FA engine (owner + 1 co-signer; requester/beneficiary excluded)

function blockedTransfer(room, description) {
  return reply(room, '이 송금 요청은 진행할 수 없어요.', { kind: 'blocked', title: '송금 요청 차단', description });
}

function transferCard(room, text) {
  const { transfer: p } = room.flow;
  const vote = (id) => ({ approve: '승인함', reject: '거절함' }[p.votes[id]] ?? '대기 중');
  const cosigned = p.approvals.anyOf.from.find((id) => p.votes[id] === 'approve');
  const cosignLabel = p.approvals.anyOf.from.length === 1
    ? LABEL[p.approvals.anyOf.from[0]]
    : `${p.approvals.anyOf.from.map((id) => LABEL[id]).join(' 또는 ')} 중 1명`;
  const undecided = [...p.approvals.required, ...(cosigned ? [] : p.approvals.anyOf.from)].filter((id) => !p.votes[id]);
  return reply(room, text, {
    kind: 'approval',
    title: `${won(p.amount)} 송금 · 가족 2명 승인 필요`,
    description: '돈이 나가는 요청이라 계정 주인과 가족 1명이 모두 승인해야 해요. 요청한 사람과 돈을 받는 사람은 승인자가 될 수 없어요.',
    rows: [
      row('요청한 사람', LABEL[p.actor]),
      row('작업 공간', space(p.owner)),
      row('받는 사람', p.to === 'external' ? '가족 외 계좌' : LABEL[p.to]),
      row('금액', won(p.amount)),
      row(`${LABEL[p.owner]} 승인 (필수)`, vote(p.owner)),
      row(`가족 승인 (${cosignLabel})`, cosigned ? `${LABEL[cosigned]} 승인함` : '대기 중'),
      row('권한 엔진', '가족 멀티시그 · fa-engine'),
    ],
    actions: [
      ...p.approvals.required.filter((id) => !p.votes[id])
        .map((id) => button('cosign', `${LABEL[id]}: 승인하기`, { value: p.id, actor: id })),
      ...(cosigned ? [] : p.approvals.anyOf.from.filter((id) => !p.votes[id])
        .map((id) => button('cosign', `${LABEL[id]}: 함께 승인하기`, { value: p.id, actor: id }))),
      button('deny', '보내지 않기', { value: p.id, actors: undecided, variant: 'secondary' }),
    ],
  });
}

function proposeTransfer(room, actor, t) {
  if (!t?.amount) return blockedTransfer(room, '보낼 금액을 확인할 수 없어요. “엄마 계좌에서 5만원 아빠한테 보내줘”처럼 말해 주세요.');
  if (['awaiting-approval', 'awaiting-cosign'].includes(room.flow.phase)) {
    return reply(room, '진행 중인 승인 요청을 먼저 마무리해 주세요.');
  }
  const decision = policy(actor, t.owner, 'transfer_money', { to: t.to, amount: t.amount });
  if (decision.decision !== 'needs_approval') return blockedTransfer(room, decision.reason);
  if (!room.members.includes(t.owner)) return reply(room, `먼저 채팅방에서 ${LABEL[t.owner]}를 초대해 주세요.`);
  const cosigners = decision.approvals.anyOf.from.filter((id) => room.members.includes(id));
  if (cosigners.length === 0) return blockedTransfer(room, `${decision.reason} 함께 승인할 가족이 이 방에 없어요.`);
  transition(room, 'awaiting-cosign', t.owner, {
    transfer: {
      id: randomUUID(), actor, owner: t.owner, to: t.to, amount: t.amount, votes: {},
      approvals: { required: decision.approvals.required, anyOf: { count: 1, from: cosigners } },
    },
  });
  return transferCard(room, `🔒 ${decision.reason}`);
}

function decideTransfer(room, actor, vote, id) {
  const p = room.flow.transfer;
  if (id !== p.id) return reply(room, '가장 최근 송금 요청에서 다시 확인해 주세요.');
  const request = { decision: { approvals: p.approvals }, votes: p.votes, status: 'pending' };
  if (!canVote(request, actor)) {
    if (p.votes[actor]) return reply(room, '이미 결정했어요. 남은 가족의 승인을 기다리고 있어요.');
    if (actor === p.to) return reply(room, '돈을 받는 사람은 승인할 수 없어요.');
    if (actor === p.actor) return reply(room, '요청한 사람은 승인자로 셀 수 없어요.');
    return reply(room, '이 송금의 승인자가 아니에요.');
  }
  p.votes[actor] = vote;
  const state = approvalState(request);
  const rows = [row('요청한 사람', LABEL[p.actor]), row('작업 공간', space(p.owner)),
    row('받는 사람', p.to === 'external' ? '가족 외 계좌' : LABEL[p.to]), row('금액', won(p.amount))];
  if (state === 'pending') {
    transition(room, 'awaiting-cosign', p.owner, { transfer: p });
    return transferCard(room, `${LABEL[actor]} 승인 ✅ 남은 승인을 기다리고 있어요.`);
  }
  transition(room, 'idle');
  if (state === 'rejected') {
    return reply(room, `${subj(LABEL[actor])} 거절해서 송금하지 않기로 했어요.`, {
      kind: 'result', title: '송금하지 않음', description: '돈은 나가지 않았어요.', rows,
    });
  }
  const signers = Object.keys(p.votes).filter((id) => p.votes[id] === 'approve').map((id) => LABEL[id]);
  return reply(room, `${subj(andJoin(signers))} 승인해서 송금 초안을 준비했어요.`, {
    kind: 'result',
    title: '송금 초안 준비 완료',
    description: '데모라서 실제 이체는 하지 않았어요. 실제 서비스에서는 이 단계에서 계정 주인의 VM이 이체를 실행해요.',
    rows: [...rows, row('승인한 사람', signers.join(' · '))],
  });
}

// ---- Routing scenes: the FA routes each request to the right person's VM by rule.
// Cards show who asked, which VM runs it, and the rule that decided (fa-engine policy).

function routeRows(task, reason) {
  return [
    row('요청한 사람', LABEL[task.actor]),
    row('라우팅', `${LABEL[task.actor]} → FA → ${space(task.owner)}`),
    row('규칙 판정', reason),
  ];
}

function finishRoute(room, prevFlow, text, card) {
  room.flow = prevFlow; // back to whatever the room was doing before this scene
  return reply(room, text, card);
}

function askConnect(room, task, prevFlow, reason) {
  transition(room, 'routing', task.owner, { task, prevFlow, stage: 'connect' });
  const who = LABEL[task.owner];
  const svc = SERVICES[task.service];
  const text = task.actor === task.owner
    ? `${who} ${svc} 연결을 시작할게요. ${who} 화면에서 직접 로그인해 주세요.`
    : `${who}, ${subj(LABEL[task.actor])} ${who} ${svc} 연결을 시작했어요. 로그인은 ${who}만 할 수 있어요.`;
  return reply(room, text, {
    kind: 'login', audience: task.owner, title: `${who} ${svc} 연결`,
    description: `${who} ${svc} 로그인은 ${space(task.owner)} 안에서 이뤄져요.`,
    rows: [...routeRows(task, reason), row('입력하는 사람', `${who}만`)],
    actions: [button('login', `${who} ${svc} 로그인`, { actor: task.owner })],
  });
}

function completeOrder(room, task, prevFlow, lead) {
  const who = LABEL[task.owner];
  if (!room.accounts.has(`${task.owner}:coupang`)) {
    return askConnect(room, { ...task, kind: 'connect', service: 'coupang', then: task }, prevFlow,
      `주문하려면 ${who} 쿠팡이 ${space(task.owner)}에 연결돼 있어야 해요.`);
  }
  return finishRoute(room, prevFlow, `${lead ?? ''}${space(task.owner)}에서 ${who} 쿠팡으로 ${task.item} 주문을 준비했어요.`, {
    kind: 'result', title: `${task.item} 주문 준비 완료`,
    description: '데모라서 실제 결제는 하지 않았어요.',
    rows: [
      row('요청한 사람', LABEL[task.actor]), row('실행 VM', space(task.owner)),
      row('쿠팡 계정', `${who}의 쿠팡`), row('배송지', `${who} 집 (등록된 주소)`), row('금액', won(task.price)),
    ],
  });
}

function proposeRoute(room, actor, route) {
  const task = { id: randomUUID(), actor, ...route };
  const who = LABEL[task.owner];
  if (!room.members.includes(task.owner)) return reply(room, `먼저 채팅방에서 ${obj(who)} 초대해 주세요.`);
  const prevFlow = room.flow.phase === 'routing' ? room.flow.prevFlow : room.flow;
  const d = task.kind === 'order'
    ? policy(actor, task.owner, 'order_item', { item: task.item, price: task.price })
    : policy(actor, task.owner, 'connect_account', { service: task.service });

  if (d.decision === 'deny') {
    return reply(room, `🔒 ${d.reason}`, {
      kind: 'blocked', title: `${who} 계정에서는 할 수 없는 요청이에요`, description: d.reason, rows: routeRows(task, '차단'),
    });
  }
  if (task.kind === 'connect') return askConnect(room, task, prevFlow, d.reason);
  if (d.decision === 'needs_approval') {
    transition(room, 'routing', task.owner, { task, prevFlow, stage: 'approve' });
    return reply(room, `${who}, ${subj(LABEL[actor])} ${who} 계정으로 ${task.item} 주문을 부탁했어요.`, {
      kind: 'approval', audience: task.owner, title: `${task.item} 주문 확인`,
      description: `${who} 계정과 ${who} 주소로 주문해요. ${subj(who)} 확인해야 진행돼요.`,
      rows: [...routeRows(task, d.reason), row('금액', won(task.price))],
      actions: [
        button('route_approve', '주문하기', { value: task.id, actor: task.owner }),
        button('route_deny', '주문 안 함', { value: task.id, actor: task.owner, variant: 'secondary' }),
      ],
    });
  }
  return completeOrder(room, task, prevFlow);
}

// Returns a reply when this action belongs to the routing scene in progress, else null.
function continueRoute(room, { actor, action, value, step_id, fromChat }) {
  const { task, prevFlow, stage } = room.flow;
  const mine = (stage === 'connect' && action === 'login')
    || (stage === 'approve' && ['route_approve', 'route_deny', 'approve', 'deny'].includes(action));
  if (!mine) {
    room.flow = prevFlow; // anything else leaves the routing scene
    return null;
  }
  if (!fromChat && step_id !== room.flow.step_id) return reply(room, '이 요청은 바뀌었거나 끝났어요. 최근 FA 카드를 확인해 주세요.');
  const who = LABEL[task.owner];
  if (actor !== task.owner) return reply(room, `${subj(who)} 직접 해야 해요. 가족도 대신할 수 없어요.`);

  if (stage === 'connect') {
    if (value !== `${task.owner}-demo`) return reply(room, `${who}의 샘플 계정을 선택해 주세요.`);
    room.accounts.add(`${task.owner}:${task.service}`);
    const svc = SERVICES[task.service];
    if (task.then) return completeOrder(room, task.then, prevFlow, `${who} 쿠팡이 연결돼서 바로 이어서 `);
    return finishRoute(room, prevFlow, `${who} ${subj(svc)} ${space(task.owner)}에 연결됐어요.`, {
      kind: 'result', title: `${who} ${svc} 연결 완료`,
      description: `비밀번호는 ${space(task.owner)} 금고에만 있어요. 가족에게도 보이지 않아요.`,
      rows: [row('요청한 사람', LABEL[task.actor]), row('연결된 VM', space(task.owner)), row('로그인한 사람', who)],
    });
  }
  if (action === 'route_deny' || action === 'deny') {
    return finishRoute(room, prevFlow, `${subj(who)} ${task.item} 주문을 하지 않기로 했어요.`);
  }
  if (!fromChat && value !== task.id) return reply(room, '가장 최근 주문 요청에서 다시 확인해 주세요.');
  return completeOrder(room, task, prevFlow);
}

function readList(room, vm, actor, owner, grant) {
  const gate = policy(actor, owner, 'scan_subscriptions');
  if (gate.decision === 'deny') return reply(room, gate.reason);
  const result = run(vm, 'subscriptions.list', actor, owner, {}, { type: actor === owner ? 'owner' : 'read-grant' });
  transition(room, 'review', owner, { grant, list: { actor, subscriptions: result.subscriptions } });
  return listCard(room);
}

function routeRoom(room, vm, { actor, action, value, step_id, approval_id }) {
  const fromChat = action === 'chat';
  let ownerHint;
  let transfer;
  let route;
  if (fromChat) {
    const candidate = intent(value, actor);
    if (!candidate) return reply(room);
    ({ action, value, owner: ownerHint, transfer, route } = candidate);
  }
  if (action === 'welcome') return welcome(room);
  if (route) return proposeRoute(room, actor, route);
  if (room.flow.phase === 'routing') {
    const routed = continueRoute(room, { actor, action, value, step_id, fromChat });
    if (routed) return routed;
  }
  if (TRUST_ACTIONS.has(action)) return reply(room, '보안 기능(fa-trust)이 연결되지 않았어요.');
  // Reached only when fa-trust didn't take the money request (e.g. fa-trust isn't available).
  if (action === 'transfer') return proposeTransfer(room, actor, transfer);
  if (room.flow.phase === 'awaiting-cosign') {
    if (!['cosign', 'approve', 'deny'].includes(action)) return reply(room, '진행 중인 송금 승인을 먼저 마무리해 주세요.');
    if (!fromChat && room.flow.step_id !== step_id) {
      return reply(room, '이 요청은 바뀌었거나 끝났어요. 최근 FA 카드를 확인해 주세요.');
    }
    return decideTransfer(room, actor, action === 'deny' ? 'reject' : 'approve', fromChat ? room.flow.transfer.id : value);
  }

  const { phase, owner: currentOwner, step_id: currentStep, grant, pending, list } = room.flow;
  if ((!fromChat || ['scope', 'approve', 'deny'].includes(action)) && currentStep !== step_id) {
    return reply(room, '이 요청은 바뀌었거나 끝났어요. 최근 FA 카드를 확인하거나 누구의 구독인지 다시 알려 주세요.');
  }

  const owner = ownerHint ?? (action === 'setup' && !fromChat ? value : currentOwner);
  if (!owner || !Object.hasOwn(LABEL, owner)) {
    return reply(room, '누구의 구독인지 한 명만 알려 주세요. 예를 들어 “엄마 구독 목록 보여줘”라고 말해 보세요.');
  }
  const name = LABEL[owner];
  if (!room.members.includes(owner)) return reply(room, `먼저 채팅방에서 ${name}를 초대해 주세요.`);
  const helper = actor === 'son' && actor !== owner;
  const canRead = actor === owner || grant?.actor === actor;
  const visibleTo = grant?.visibleTo ?? [owner];

  if (owner !== currentOwner && phase === 'awaiting-approval') {
    return reply(room, '진행 중인 해지 요청을 계정 주인이 먼저 결정해 주세요.');
  }

  if (['setup', 'scan', 'propose'].includes(action) && (phase === 'idle' || owner !== currentOwner)) {
    const connection = room.connections.get(owner);
    if (connection) {
      if (!readers(owner, connection.grant).includes(actor)) return reply(room, '이 계정의 목록을 조회할 권한이 없어요.');
      if (action === 'scan') return readList(room, vm, actor, owner, connection.grant);
      return ready(room, owner, connection.grant);
    }
    if (actor !== owner && !helper) return reply(room, '계정 주인이나 아들이 계정 연결을 시작할 수 있어요.');
    transition(room, 'awaiting-login', owner);
    return reply(room, `${name}, 구독을 확인할 데모 계정을 연결해 주세요.`, {
      kind: 'login', audience: owner, title: '계정 연결이 필요해요',
      description: '계정 주인이 데모 계정을 선택해 주세요.',
      rows: [row('작업 공간', space(owner))],
      actions: [button('login', '데모 계정 연결하기', { actor: owner })],
    });
  }

  if (action === 'login' && phase === 'awaiting-login') {
    if (actor !== owner || value !== `${owner}-demo`) return reply(room, `${subj(name)} 본인의 샘플 계정을 선택해 주세요.`);
    if (owner === 'son' || !room.members.includes('son')) return ready(room, owner);
    transition(room, 'awaiting-scope', owner);
    return reply(room, `${name}의 데모 계정이 연결됐어요. 아들이 도울 범위를 확인해 주세요.`, {
      kind: 'scope', audience: owner, title: '아들에게 구독 목록 보기 허용',
      description: '허용하면 아들이 구독 목록을 가져오고 지금 이 방에 참여한 가족에게 공유해요. 해지는 건마다 계정 주인이 결정해요.',
      rows: [row('작업 공간', space(owner)), row('허용할 권한', '아들의 구독 목록 조회와 이 방에 공유')],
      actions: [
        button('scope', '목록 보기 허용', { actor: owner }),
        button('deny', '허용 안 함', { actor: owner, variant: 'secondary' }),
      ],
    });
  }

  if (phase === 'awaiting-scope' && ['scope', 'deny'].includes(action)) {
    if (actor !== owner) return reply(room, `조회 권한은 ${subj(name)} 결정해요.`);
    if (action === 'deny') return ready(room, owner);
    return ready(room, owner, { actor: 'son', visibleTo: room.members.filter((id) => id !== 'fa') });
  }

  if (['scan', 'propose', 'setup'].includes(action)) {
    if (!canRead && !helper) return reply(room, '이 계정의 목록을 조회할 권한이 없어요.');
    if (phase === 'awaiting-login') return reply(room, `${name}의 계정 연결을 기다리고 있어요.`);
    if (phase === 'awaiting-scope') return reply(room, `${subj(name)} 목록 조회 권한을 결정할 때까지 기다려 주세요.`);
    if (action === 'setup') return reply(room, `${name}의 계정이 이미 연결되어 있어요.`);
    if (!canRead) return reply(room, '이 계정의 목록을 조회할 권한이 없어요.');
    if (phase === 'awaiting-approval') return reply(room, `${subj(name)} 해지 요청을 확인하고 있어요.`);

    if (action === 'scan') return readList(room, vm, actor, owner, grant);

    if (phase !== 'review') return reply(room, '구독 목록부터 확인해 주세요.');
    const service = list.subscriptions.find(({ id }) => id === value);
    if (!service) return reply(room, '조회 결과에서 해지할 구독 한 개를 골라 주세요.');
    const gate = policy(actor, owner, 'cancel_subscription');
    if (gate.decision === 'deny') {
      return reply(room, gate.reason, { kind: 'blocked', title: '해지 요청 차단', description: gate.reason }, visibleTo);
    }
    const id = randomUUID();
    transition(room, 'awaiting-approval', owner, { grant, list, pending: { id, service, actor } });
    return reply(room, `${name}, ${service.name} 구독을 해지할지 확인해 주세요.`, {
      kind: 'approval', audience: owner, title: `${service.name} 해지 요청`,
      description: '이 서비스의 해지만 승인해요. 시뮬레이션에서는 다음 달 갱신을 중단한 것으로 표시돼요.',
      rows: [
        row('요청한 사람', LABEL[actor]), row('작업 공간', space(owner)), row('데모 구독료', service.price),
        row('권한 엔진', gate.reason),
      ],
      actions: [
        button('approve', '해지 승인하기', { value: id, actor: owner }),
        button('deny', '구독 유지하기', { value: id, actor: owner, variant: 'secondary' }),
      ],
    }, visibleTo);
  }

  if (phase === 'awaiting-approval' && ['approve', 'deny'].includes(action)) {
    if (actor !== owner) return reply(room, `해지 여부는 계정 주인인 ${subj(name)} 결정해요.`);
    if (pending.id !== (fromChat ? approval_id : value)) {
      return reply(room, '가장 최근 해지 요청에서 다시 확인해 주세요.');
    }
    transition(room, 'review', owner, { grant, list });
    if (action === 'deny') return listCard(room, `${subj(name)} ${pending.service.name} 구독을 유지하기로 했어요.`);
    let result;
    try {
      result = run(vm, 'subscriptions.cancel', pending.actor, owner, { service_id: pending.service.id },
        { type: 'owner-approval', approval_id: pending.id }, pending.id);
    } catch {
      transition(room, 'ready', owner, { grant });
      return reply(room, 'VM 에이전트가 해지를 확인하지 못했어요. 목록을 다시 조회해 주세요.', {
        kind: 'ready', title: '구독 목록 다시 확인',
        actions: [button('scan', `${name} 구독 목록 보기`, { actors: readers(owner, grant) })],
      }, visibleTo);
    }
    const { subscription } = result;
    transition(room, 'complete', owner, { grant });
    return reply(room, `${subj(name)} 승인한 ${subscription.name} 구독 해지 데모를 마쳤어요.`, {
      kind: 'result', title: `${subscription.name} 해지 완료`,
      description: 'VM 에이전트가 시뮬레이션 결과를 돌려줬어요. 실제 구독과 결제에는 영향이 없어요.',
      rows: [
        row('요청한 사람', LABEL[pending.actor]), row('작업 공간', space(owner)),
        row('승인한 사람', name), row('다음 달 절약 예시', subscription.price.replace('월 ', '')),
      ],
      actions: [button('scan', '구독 목록 다시 보기', { actors: readers(owner, grant) })],
    }, visibleTo);
  }
  return reply(room, '이미 끝났거나 아직 시작되지 않은 요청이에요. 가장 최근 FA 카드를 확인해 주세요.');
}

// trust: false skips fa-trust, so money requests use the FA engine's family multisig instead.
export function createRouter({ trust: useTrust = true } = {}) {
  const demos = new Map();
  const demoOf = (demo_id) => {
    if (!demos.has(demo_id)) {
      demos.set(demo_id, { vm: createDemoVmAgent(), rooms: new Map(), trust: useTrust ? createTrustGate() : null });
    }
    return demos.get(demo_id);
  };
  return {
    // fa-trust gate for this demo (null when fa-trust is not available).
    trust(demo_id) {
      return demoOf(demo_id).trust;
    },
    handle(command) {
      const { demo_id, room_id, members, action } = command;
      const { vm, rooms, trust } = demoOf(demo_id);
      const signature = members.toSorted().join(',');
      if (!rooms.has(room_id)) {
        const room = { members, signature, connections: new Map(), accounts: new Set() };
        transition(room, 'idle');
        rooms.set(room_id, room);
      }
      const room = rooms.get(room_id);
      if (!room || room.signature !== signature) return null;
      if (action === 'retire') {
        rooms.set(room_id, null);
        return reply(room);
      }
      return routeTrust(room, trust, command) ?? routeRoom(room, vm, command);
    },
  };
}
