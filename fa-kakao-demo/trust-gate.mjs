import { stripFaMention } from './public/mentions.mjs';

// Security scenes for the KakaoTalk demo, backed by fa-trust (../fa-trust).
// Money requests in the chat go through fa-trust instead of a flat "blocked" reply:
//   - transfers need the account owner's device-proven approval (2-of-3) and are public to the family,
//   - a first-time payee waits 3 hours (anyone can cancel),
//   - voice-phishing signals hold the transfer, alert the family and seal evidence,
//   - "사기예요" from a family member triggers an emergency lockdown.
// Nothing here moves real money: the executor only returns a simulated receipt.

const LABEL = { mom: '엄마', dad: '아빠', son: '아들' };
const FAMILY = Object.keys(LABEL);
const OPEN_TRANSFERS = new Set(['pending', 'held', 'scheduled']);
const FAMILY_EVENTS = {
  linked: '데모 은행 연결이 갱신됐어요.',
  expired: '데모 은행 연결이 만료됐어요.',
  lockdown: '송금 긴급 잠금이 켜졌어요.',
  unlocked: '가족 두 명의 기기 확인으로 송금 잠금이 풀렸어요.',
};
export const TRUST_ACTIONS = new Set(['trust_approve', 'trust_reject', 'trust_cancel', 'trust_scam', 'trust_skip', 'trust_unlock']);

let FamilyTrust = null;
try {
  ({ FamilyTrust } = await import('../fa-trust/dist/fa-trust.js'));
} catch {
  // fa-trust is not checked out next to this demo: the router keeps its plain "blocked" reply.
}
export const trustAvailable = () => Boolean(FamilyTrust);

const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

const WHO = [[/엄마|어머니/, 'mom'], [/아빠|아버지/, 'dad'], [/아들/, 'son']];
const idOf = (word) => WHO.find(([re]) => re.test(word))?.[1];

function amountIn(text) {
  const m = text.match(/(\d[\d,]*)\s*(만)?\s*원/);
  if (!m) return null;
  return Number(m[1].replace(/,/g, '')) * (m[2] ? 10_000 : 1);
}

export function isMoneyRequest(text) {
  const t = stripFaMention(text);
  if (/[?？]|어떻게|방법|뭐야/.test(t)) return false;
  return Boolean(amountIn(t)) && /송금|이체|안전\s*계좌|계좌|옮겨|옮기|보내/.test(t);
}

function parseTransfer(text, actor) {
  const t = stripFaMention(text);
  const from = t.match(/(엄마|어머니|아빠|아버지|아들)\s*(?:의)?\s*(?:통장|계좌)에서/);
  const owner = from ? idOf(from[1]) : actor;
  let payee = '처음 보는 계좌';
  let payeeOwner;
  if (/안전\s*계좌/.test(t)) payee = '안전계좌 (처음 보는 계좌)';
  else if (/(내|제)\s*(통장|계좌)|나한테|저한테|나에게|저에게/.test(t)) {
    payeeOwner = actor;
    payee = `${LABEL[actor] ?? actor} 계좌`;
  } else {
    const to = t.match(/(엄마|어머니|아빠|아버지|아들)\s*(?:한테|에게|계좌로|통장으로)/);
    if (to) {
      payeeOwner = idOf(to[1]);
      payee = `${LABEL[payeeOwner]} 계좌`;
    }
  }
  const amountKRW = amountIn(t);
  return { owner, payee, payeeOwner, amountKRW, summary: `${LABEL[owner]} → ${payee.replace(' (처음 보는 계좌)', '')} ${won(amountKRW)}` };
}

const row = (label, detail) => ({ label, detail });
const button = (action, label, opts = {}) => ({ action, label, ...opts });

export function createTrustGate() {
  if (!FamilyTrust) return null;

  let offsetMs = 0; // demo-only clock skip for the 3-hour cooling-off
  let seq = 0;
  const events = [];
  const actionRooms = new Map();
  const retiredRooms = new WeakSet();
  const trust = new FamilyTrust({
    familyId: 'kakao-demo',
    members: [
      { id: 'mom', name: '엄마', role: 'parent' },
      { id: 'dad', name: '아빠', role: 'parent' },
      { id: 'son', name: '아들', role: 'child' },
    ],
    now: () => Date.now() + offsetMs,
    executor(req) {
      const room = actionRooms.get(req.id);
      if (!room || retiredRooms.has(room)) throw new Error('요청을 만든 채팅방이 종료됐어요.');
      return `시뮬레이션 영수증: ${req.summary} (실제 이체 아님)`;
    },
  });
  trust.on((e) => {
    events.push({ seq: ++seq, type: e.type, message: e.message, requestId: e.requestId, ts: Date.now() });
    if (events.length > 300) events.shift();
  });
  const phones = Object.fromEntries(FAMILY.map((id) => [id, trust.createDevice(id)]));
  const unlockVotes = new WeakMap();
  const linkBank = () => trust.linkAccount('mom', 'bank', 'demo-bank-session');
  let ready = linkBank();

  const family = (room) => room.members.filter((id) => FAMILY.includes(id));
  const canCancel = (a, actor) => OPEN_TRANSFERS.has(a.status) && (a.status !== 'pending' || a.request.owner === actor);
  const findAction = (room, id) => actionRooms.get(id) === room ? trust.getAction(id) : undefined;
  const roomActions = (room) => trust.actions().filter((a) => actionRooms.get(a.id) === room);
  const impostorTarget = (room) => roomActions(room).findLast((a) => a.status === 'pending' || a.status === 'held');
  const everyone = (room) => room.members.filter((id) => id !== 'fa');
  const firstLine = (lines) => (lines?.[0] ?? '').replace(/^[^\p{L}\d"“]+/u, '');

  function votesFor(room) {
    const votes = unlockVotes.get(room);
    if (votes?.epoch === trust.keys.epoch) return votes.members;
    const members = new Set();
    unlockVotes.set(room, { epoch: trust.keys.epoch, members });
    return members;
  }

  async function unlock(room, actor) {
    const votes = votesFor(room);
    votes.add(actor);
    if (votes.size < 2) return `${LABEL[actor]} 동의 ✓ · 가족 한 명이 더 동의하면 송금 잠금이 풀려요.`;
    const ok = await trust.unlockWith([...votes].map((id) => phones[id]));
    votes.clear();
    if (!ok) return '잠금을 풀지 못했어요. 가족 두 명의 기기 증명이 필요해요.';
    ready = linkBank();
    await ready;
    return '🔓 가족 2명의 기기 증명으로 송금 잠금을 풀고, 데모 은행을 새 열쇠로 연결했어요.';
  }

  function snapshot(room, actor, since) {
    const actions = roomActions(room);
    const roomEvents = events.filter((e) => e.requestId ? findAction(room, e.requestId) : Object.hasOwn(FAMILY_EVENTS, e.type));
    const locked = trust.frozen;
    const votes = locked ? votesFor(room) : new Set();
    const audit = trust.audit;
    return {
      enabled: true,
      locked,
      scope: 'transfers',
      controls: {
        canLock: !locked,
        canUnlock: locked && family(room).length >= 2 && !votes.has(actor),
        canImpostor: actor === 'son' && !locked && Boolean(impostorTarget(room)),
      },
      actions: actions.filter((a) => OPEN_TRANSFERS.has(a.status)).map((a) => ({
        id: a.id, status: a.status, summary: a.request.summary, requester: a.request.requester,
        owner: a.request.owner, tier: a.decision.tier, approvals: a.approvals, canCancel: canCancel(a, actor),
      })),
      events: roomEvents.filter((e) => e.seq > since).slice(-60).map(({ seq, type, message, requestId, ts }) => ({
        seq, type, message: requestId ? message : FAMILY_EVENTS[type], ts,
      })),
      audit: {
        count: audit.entries().filter(({ data }) => data?.requestId && findAction(room, data.requestId)).length,
        verified: audit.verify().ok,
      },
      linkCount: trust.linkedAccounts().length,
      evidenceCount: actions.filter((a) => a.evidenceId).length,
      epoch: trust.keys.epoch,
      unlockVotes: votes.size,
    };
  }

  // Same rule as fa-trust: for transfers, the beneficiary and a non-owner requester can't approve.
  function exclusion(r, id) {
    if (r.kind !== 'transfer') return null;
    if (r.payeeOwner && id === r.payeeOwner && id !== r.owner) return '돈을 받는 사람은 승인할 수 없어요.';
    if (id === r.requester && id !== r.owner) return '요청한 사람은 승인자로 셀 수 없어요.';
    return null;
  }

  function pendingCard(room, a) {
    const { request: r, decision: d } = a;
    const owner = r.owner;
    const others = family(room).filter((id) => id !== owner && id !== r.requester);
    const cosigners = family(room).filter((id) => id !== owner && !exclusion(r, id) && !a.approvals.includes(id));
    const excluded = family(room).filter((id) => exclusion(r, id));
    return {
      text: d.reasons.join('\n'),
      card: {
        // No `audience`: the app would disable every button for non-owners. Per-button actor/actors gate it.
        kind: 'approval',
        title: `🔐 ${r.summary}`,
        description: `돈이 나가는 요청이라 ${LABEL[owner]}의 기기 승인이 필요해요. 가족 모두에게 공개돼요.`,
        rows: [
          row('요청한 사람', LABEL[r.requester] ?? r.requester),
          row('출금 계좌', `${LABEL[owner]}의 은행 (열쇠 2-of-3)`),
          row('받는 곳', r.payee ?? '-'),
          row('금액', won(r.amountKRW)),
          row('위험 등급', `${d.tier} · 승인 ${d.approvalsRequired}명`),
          ...d.signals.map((s) => row('⚠️ 신호', s.label)),
          ...(d.coolingOffMinutes ? [row('실행 지연', `승인 후 ${d.coolingOffMinutes / 60}시간`)] : []),
          ...(excluded.length ? [row('승인 불가', `${excluded.map((id) => LABEL[id]).join('·')} (요청자·받는 사람)`)] : []),
          ...(a.approvals.length ? [row('승인 완료', a.approvals.map((id) => `${LABEL[id]} ✓`).join(', '))] : []),
        ],
        actions: [
          ...(a.approvals.includes(owner) ? [] : [button('trust_approve', `${LABEL[owner]} 승인하기`, { value: a.id, actor: owner })]),
          ...(cosigners.length ? [button('trust_approve', `함께 승인 (${cosigners.map((id) => LABEL[id]).join('·')})`, { value: a.id, actors: cosigners })] : []),
          button('trust_reject', '거절하기', { value: a.id, actor: owner, variant: 'secondary' }),
          ...(others.length ? [button('trust_scam', '사기 신고', { value: a.id, actors: others, variant: 'secondary' })] : []),
        ],
      },
      visibleTo: everyone(room),
    };
  }

  function heldCard(room, a) {
    const { request: r, decision: d } = a;
    const others = family(room).filter((id) => id !== r.requester);
    return {
      text: `${LABEL[r.requester] ?? ''}, 지금은 보내지 않았어요. 검찰·경찰·금감원은 전화로 돈을 옮기라고 하지 않아요. 가족에게도 바로 알렸어요.`,
      card: {
        kind: 'blocked',
        title: '🚨 보이스피싱 의심 · 송금 보류',
        description: `${firstLine(d.reasons)} 증거는 가족 2-of-3 열쇠로 봉인했어요.`,
        rows: [
          row('요청', r.summary),
          ...d.signals.map((s) => row(`⚠️ ${s.label}`, s.evidence)),
          row('증거', a.evidenceId ? `봉인됨 (${a.evidenceId.slice(0, 10)}…)` : '-'),
        ],
        actions: others.length ? [
          button('trust_scam', '사기예요 · 긴급 잠금', { value: a.id, actors: others }),
          button('trust_reject', '요청 취소', { value: a.id, actors: family(room), variant: 'secondary' }),
        ] : undefined,
      },
      visibleTo: everyone(room),
    };
  }

  function blockedCard(room, a) {
    return {
      text: a.decision.reasons.join('\n'),
      card: { kind: 'blocked', title: '⛔ 실행할 수 없는 요청', description: firstLine(a.decision.reasons), rows: [row('요청', a.request.summary ?? '-')] },
      visibleTo: everyone(room),
    };
  }

  function scheduledCard(room, a) {
    const minutes = Math.max(0, Math.round(((a.executeAfter ?? 0) - (Date.now() + offsetMs)) / 60000));
    return {
      text: `⏳ 승인이 모였어요. ${Math.round(minutes / 60)}시간 뒤에 실행되고, 그 전엔 가족 누구나 취소할 수 있어요.`,
      card: {
        kind: 'result',
        title: `⏳ 실행 예약 · ${a.request.summary}`,
        description: '처음 보내는 계좌라 바로 보내지 않아요. 그 사이에 가족이 확인할 수 있어요.',
        rows: [
          row('승인', a.approvals.map((id) => `${LABEL[id]} (기기 증명 ✓)`).join(', ')),
          row('남은 시간', `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`),
        ],
        actions: [
          button('trust_cancel', '지금 취소하기', { value: a.id, actors: family(room), variant: 'secondary' }),
          button('trust_skip', '⏩ 3시간 뒤로 (데모)', { value: a.id, actors: family(room) }),
        ],
      },
      visibleTo: everyone(room),
    };
  }

  function executedCard(room, a) {
    return {
      text: `✅ ${a.request.summary} 이체를 마쳤어요 (시뮬레이션). 작업 데이터는 열쇠를 지워 소멸했어요.`,
      card: {
        kind: 'result',
        title: `✅ 실행 완료 · ${a.request.summary}`,
        description: '실제 돈은 움직이지 않은 시뮬레이션이에요. 개인정보 없는 영수증만 남아요.',
        rows: [
          row('승인', a.approvals.map((id) => `${LABEL[id]} ✓`).join(', ')),
          row('영수증', a.receipt ? `${String(a.receipt).slice(0, 16)}…` : '보관됨'),
        ],
      },
      visibleTo: everyone(room),
    };
  }

  function lockdownCard(room) {
    return {
      text: '🔒 송금을 긴급 잠금했어요.',
      card: {
        kind: 'result',
        title: '🔒 송금 긴급 잠금 완료',
        description: '데모 은행 세션과 열쇠 조각을 지웠고, 진행 중이던 송금 요청을 모두 취소했어요.',
        rows: [row('해제 조건', '가족 2명이 각자 기기로 해제'), row('가족 키', '재발급됨')],
        actions: [button('trust_unlock', '잠금 해제에 동의', { value: 'unlock', actors: family(room), variant: 'secondary' })],
      },
      visibleTo: everyone(room),
    };
  }

  function view(room, a) {
    switch (a.status) {
      case 'pending': return pendingCard(room, a);
      case 'held': return heldCard(room, a);
      case 'blocked': return blockedCard(room, a);
      case 'scheduled': return scheduledCard(room, a);
      case 'executed': return executedCard(room, a);
      case 'rejected':
      case 'cancelled':
        return { text: `🛑 "${a.request.summary}" 요청을 취소했어요.`, visibleTo: everyone(room) };
      default:
        return { text: `요청 상태: ${a.status}`, visibleTo: everyone(room) };
    }
  }

  const note = (room, text) => ({ text, visibleTo: everyone(room) });

  return {
    retire(room) {
      retiredRooms.add(room);
    },

    async fromChat(room, actor, text) {
      await ready;
      const t = parseTransfer(text, actor);
      if (!room.members.includes(t.owner)) return [note(room, `${LABEL[t.owner]}가 이 방에 없어서 승인 요청을 보낼 수 없어요.`)];
      const req = { owner: t.owner, kind: 'transfer', service: 'bank', amountKRW: t.amountKRW, payee: t.payee, payeeOwner: t.payeeOwner, summary: t.summary, text: stripFaMention(text) };
      // Unregistered phones (guests) go in without a device proof and are blocked by fa-trust.
      const a = phones[actor] ? await trust.request(phones[actor], req) : await trust.submit({ ...req, requester: actor });
      actionRooms.set(a.id, room);
      return [view(room, a)];
    },

    async button(room, actor, action, value) {
      await ready;
      if (action === 'trust_unlock') {
        if (!phones[actor] || family(room).length < 2) return [note(room, '등록된 가족 두 명이 있는 채팅방에서 잠금을 풀 수 있어요.')];
        if (!trust.frozen) return [note(room, '송금이 잠겨 있지 않아요.')];
        return [note(room, await unlock(room, actor))];
      }

      const a = findAction(room, value);
      if (!a) return [note(room, '이 요청을 찾을 수 없어요. 가장 최근 카드를 확인해 주세요.')];
      if (!phones[actor]) return [note(room, '등록된 가족 기기에서만 결정할 수 있어요.')];
      const before = a.status;
      let next = a;
      switch (action) {
        case 'trust_approve': {
          const why = exclusion(a.request, actor);
          if (why) return [note(room, `🚫 ${LABEL[actor]}: ${why}`)];
          const count = a.approvals.length;
          next = await trust.approveWith(phones[actor], a.id);
          if (next.status === before && ['pending', 'held'].includes(next.status)) {
            if (next.approvals.length === count) return [note(room, `이미 승인했거나 승인할 수 없는 요청이에요.`)];
            const left = Math.max(0, next.decision.approvalsRequired - next.approvals.length);
            return [{ ...view(room, next), text: `${LABEL[actor]} 승인 ✓ (기기 증명) · ${left}명 더 승인하면 진행돼요.` }];
          }
          break;
        }
        case 'trust_reject':
        case 'trust_cancel':
          if (!canCancel(a, actor)) return [note(room, '이 요청은 지금 취소할 수 없어요.')];
          next = await trust.rejectWith(phones[actor], a.id);
          break;
        case 'trust_scam':
          if (!['pending', 'held'].includes(before) || actor === a.request.requester || (before === 'pending' && actor === a.request.owner)) {
            return [note(room, '이 요청은 지금 사기 신고를 할 수 없어요.')];
          }
          await trust.rejectWith(phones[actor], a.id, { scam: true });
          return [note(room, `🛑 ${LABEL[actor]}가 사기로 확인했어요.`), lockdownCard(room)];
        case 'trust_skip':
          if (a.status !== 'scheduled') return [note(room, '예약된 요청이 아니에요.')];
          offsetMs += Math.max(0, (a.executeAfter ?? 0) - (Date.now() + offsetMs)) + 1000;
          await trust.tick();
          next = trust.getAction(a.id);
          break;
        default:
          return [note(room, '지원하지 않는 버튼이에요.')];
      }
      if (next.status === before) return [note(room, `이미 처리된 요청이에요 (${before}).`)];
      return [view(room, next)];
    },

    async profile(room, actor, since) {
      await ready;
      return snapshot(room, actor, since);
    },

    async control(room, actor, action, actionId) {
      await ready;
      let notice;
      let result;
      switch (action) {
        case 'lock': {
          if (trust.frozen) return { status: 409, body: { error: '송금이 이미 잠겨 있어요.' } };
          const context = trust.context(actor, 'lockdown', String(trust.keys.epoch));
          if (!trust.verifyProof(actor, phones[actor].prove(context), context)) {
            return { status: 403, body: { error: '등록된 가족 기기만 송금을 잠글 수 있어요.' } };
          }
          await trust.lockdown(actor, '보안 프로필에서 송금 긴급 잠금');
          notice = '송금을 잠갔어요. 진행 중이던 송금 요청을 취소했어요.';
          break;
        }
        case 'unlock':
          if (family(room).length < 2) return { status: 403, body: { error: '같은 방의 등록된 가족 두 명이 필요해요.' } };
          if (!trust.frozen || votesFor(room).has(actor)) {
            return { status: 409, body: { error: '이미 동의했거나 송금이 잠겨 있지 않아요.' } };
          }
          notice = await unlock(room, actor);
          break;
        case 'cancel': {
          const a = findAction(room, actionId);
          if (!a || !OPEN_TRANSFERS.has(a.status)) return { status: 409, body: { error: '지금 취소할 수 있는 요청이 없어요.' } };
          if (!canCancel(a, actor)) return { status: 403, body: { error: '승인 대기 중인 요청은 계정 주인만 취소할 수 있어요.' } };
          await trust.rejectWith(phones[actor], a.id);
          notice = '송금 요청을 취소했어요.';
          break;
        }
        case 'impostor': {
          if (actor !== 'son') return { status: 403, body: { error: '아들 시점에서 시연할 수 있어요.' } };
          const target = impostorTarget(room);
          if (trust.frozen || !target) return { status: 409, body: { error: '사칭 승인을 시연할 요청이 없어요.' } };
          const forged = phones.dad.prove(trust.context('mom', 'approve', target.id));
          await trust.approve(target.id, 'mom', forged);
          result = { requestId: target.id, status: trust.getAction(target.id)?.status };
          notice = '등록된 기기가 아닌 승인 시도를 차단했어요.';
          break;
        }
      }
      return { status: 200, body: { ...snapshot(room, actor, 0), ok: true, notice, ...result } };
    },
  };
}
