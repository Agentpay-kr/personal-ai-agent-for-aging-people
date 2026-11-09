import { randomUUID } from 'node:crypto';
import { createDemoVmAgent, DEMO_SUBSCRIPTIONS, DEMO_VM_BINDINGS } from './vm-agent.mjs';

const LABEL = { mom: '엄마', dad: '아빠', son: '아들' };
const MEMBERS = new Set([...Object.keys(LABEL), 'aunt', 'friend', 'fa']);
const ACTIONS = new Set(['welcome', 'chat', 'setup', 'login', 'scope', 'deny', 'scan', 'propose', 'approve', 'retire']);
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

function intent(text, actor) {
  const query = text.trim().replace(/^@FA\s*/i, '');
  if (/송금|이체|계좌.*(?:옮겨|보내)/.test(query)) return { action: 'transfer' };
  if (/^(?:해지 )?승인\s*(?:해요|할게요?|합니다|하겠습니다)[.!。！]?$/.test(query)) return { action: 'approve' };
  if (/^(?:구독 (?:목록 보기|읽기)를? )?허용\s*(?:해요|할게요?|합니다|하겠습니다)[.!。！]?$/.test(query)) return { action: 'scope' };
  if (/^(?:거절|안 할래|안할래|허용 안 함|승인 안 함|해지하지 마|구독 유지할게요)[.!。！]?$/.test(query)) return { action: 'deny' };
  if (/[?？]|방법|어떻게|뭐야|무슨 뜻|할 수 있|라고|따옴표|하지\s*마|취소하지|해지 안/.test(query)) return null;

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
  return reply(room, grant ? `${name}가 아들에게 구독 목록 조회를 허용했어요.` : `${name}의 데모 계정이 연결됐어요.`, {
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

function readList(room, vm, actor, owner, grant) {
  const result = run(vm, 'subscriptions.list', actor, owner, {}, { type: actor === owner ? 'owner' : 'read-grant' });
  transition(room, 'review', owner, { grant, list: { actor, subscriptions: result.subscriptions } });
  return listCard(room);
}

function routeRoom(room, vm, { actor, action, value, step_id, approval_id }) {
  const fromChat = action === 'chat';
  let ownerHint;
  if (fromChat) {
    const candidate = intent(value, actor);
    if (!candidate) return reply(room);
    ({ action, value, owner: ownerHint } = candidate);
  }
  if (action === 'welcome') return welcome(room);
  if (action === 'transfer') {
    return reply(room, '이 데모에서 송금할 권한은 없어요.', {
      kind: 'blocked', title: '송금 요청 차단',
      description: 'FA가 지원하는 작업은 구독 목록 조회와 계정 주인이 건별로 승인한 구독 해지예요.',
    });
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
    if (actor !== owner || value !== `${owner}-demo`) return reply(room, `${name}가 본인의 샘플 계정을 선택해 주세요.`);
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
    if (actor !== owner) return reply(room, `조회 권한은 ${name}가 결정해요.`);
    if (action === 'deny') return ready(room, owner);
    return ready(room, owner, { actor: 'son', visibleTo: room.members.filter((id) => id !== 'fa') });
  }

  if (['scan', 'propose', 'setup'].includes(action)) {
    if (!canRead && !helper) return reply(room, '이 계정의 목록을 조회할 권한이 없어요.');
    if (phase === 'awaiting-login') return reply(room, `${name}의 계정 연결을 기다리고 있어요.`);
    if (phase === 'awaiting-scope') return reply(room, `${name}가 목록 조회 권한을 결정할 때까지 기다려 주세요.`);
    if (action === 'setup') return reply(room, `${name}의 계정이 이미 연결되어 있어요.`);
    if (!canRead) return reply(room, '이 계정의 목록을 조회할 권한이 없어요.');
    if (phase === 'awaiting-approval') return reply(room, `${name}가 해지 요청을 확인하고 있어요.`);

    if (action === 'scan') return readList(room, vm, actor, owner, grant);

    if (phase !== 'review') return reply(room, '구독 목록부터 확인해 주세요.');
    const service = list.subscriptions.find(({ id }) => id === value);
    if (!service) return reply(room, '조회 결과에서 해지할 구독 한 개를 골라 주세요.');
    const id = randomUUID();
    transition(room, 'awaiting-approval', owner, { grant, list, pending: { id, service, actor } });
    return reply(room, `${name}, ${service.name} 구독을 해지할지 확인해 주세요.`, {
      kind: 'approval', audience: owner, title: `${service.name} 해지 요청`,
      description: '이 서비스의 해지만 승인해요. 시뮬레이션에서는 다음 달 갱신을 중단한 것으로 표시돼요.',
      rows: [row('요청한 사람', LABEL[actor]), row('작업 공간', space(owner)), row('데모 구독료', service.price)],
      actions: [
        button('approve', '해지 승인하기', { value: id, actor: owner }),
        button('deny', '구독 유지하기', { value: id, actor: owner, variant: 'secondary' }),
      ],
    }, visibleTo);
  }

  if (phase === 'awaiting-approval' && ['approve', 'deny'].includes(action)) {
    if (actor !== owner) return reply(room, `해지 여부는 계정 주인인 ${name}가 결정해요.`);
    if (pending.id !== (fromChat ? approval_id : value)) {
      return reply(room, '가장 최근 해지 요청에서 다시 확인해 주세요.');
    }
    transition(room, 'review', owner, { grant, list });
    if (action === 'deny') return listCard(room, `${name}가 ${pending.service.name} 구독을 유지하기로 했어요.`);
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
    return reply(room, `${name}가 승인한 ${subscription.name} 구독 해지 데모를 마쳤어요.`, {
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

export function createRouter() {
  const demos = new Map();
  return {
    handle(command) {
      const { demo_id, room_id, members, action } = command;
      if (!demos.has(demo_id)) demos.set(demo_id, { vm: createDemoVmAgent(), rooms: new Map() });
      const { vm, rooms } = demos.get(demo_id);
      const signature = members.toSorted().join(',');
      if (!rooms.has(room_id)) {
        const room = { members, signature, connections: new Map() };
        transition(room, 'idle');
        rooms.set(room_id, room);
      }
      const room = rooms.get(room_id);
      if (!room || room.signature !== signature) return null;
      if (action === 'retire') {
        rooms.set(room_id, null);
        return reply(room);
      }
      return routeRoom(room, vm, command);
    },
  };
}
