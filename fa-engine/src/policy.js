// Family permission engine.
// Decides, for every agent action: who asked, whose VM/account it runs on,
// and what has to happen before it may run.
//
// Tiers
//   read  - look at data (subscriptions list)        -> owner or a delegate with "read"
//   setup - connect an account                       -> only the owner types credentials
//   act   - reversible action (cancel, small order)  -> owner runs it; a delegate needs the owner's tap
//   money - money leaves an account (transfer, big order)
//           -> owner approval + 1 family co-signer ("family multisig").
//              The requester and the beneficiary never count as co-signers.

import { familyMemberIds, nameOf } from './family.js';

export const ACTIONS = {
  scan_subscriptions: { tier: 'read', label: '구독 조회', service: 'email' },
  connect_account: { tier: 'setup', label: '계정 연결' },
  cancel_subscription: { tier: 'act', label: '구독 해지', service: 'email' },
  order_item: { tier: 'act', label: '주문', service: 'coupang' },
  transfer_money: { tier: 'money', label: '송금', service: 'bank' },
  // Molla task kinds without a dedicated tool.
  compose_message: { tier: 'act', label: '문자 초안' },
  general_task: { tier: 'act', label: '일반 요청' },
};

export const TIER_LABEL = {
  read: '조회',
  setup: '계정 연결',
  act: '실행',
  money: '돈이 나가는 행동',
};

export function evaluate(family, { requester, owner, action, input = {} }) {
  const spec = ACTIONS[action];
  const base = { action, requester, owner, tier: spec?.tier ?? null, approvals: null, inputFrom: null };
  const deny = (reason) => ({ ...base, decision: 'deny', reason });

  if (!spec) return deny(`알 수 없는 행동이에요 (${action}).`);
  if (!family.members[requester] || family.members[requester].role === 'agent') {
    return deny('요청한 사람을 확인할 수 없어요.');
  }
  if (!family.members[owner] || family.members[owner].role === 'agent') {
    return deny('누구 계정에서 실행할지 확인할 수 없어요.');
  }

  if (requester !== owner && family.consent?.[owner] === 'revoked') {
    return deny(`${nameOf(family, owner)}님이 가족 도움을 꺼 두었어요. 본인만 요청할 수 있어요.`);
  }

  let tier = spec.tier;
  if (action === 'order_item' && Number(input.price ?? 0) > family.limits.orderAutoApproveKRW) {
    tier = 'money';
  }
  base.tier = tier;

  if (tier === 'money') return evaluateMoney(family, base, input);

  const self = requester === owner;
  const grants = family.delegations[owner]?.[requester] ?? [];
  if (!self && !grants.includes(tier)) {
    return deny(
      `${nameOf(family, owner)}님이 ${nameOf(family, requester)}님에게 '${TIER_LABEL[tier]}' 권한을 맡기지 않았어요.`,
    );
  }

  if (tier === 'read') {
    return {
      ...base,
      decision: 'allow',
      reason: self ? '본인 계정 조회예요.' : `${nameOf(family, owner)}님이 맡긴 조회 권한이에요.`,
    };
  }

  if (tier === 'setup') {
    return {
      ...base,
      decision: 'needs_input',
      inputFrom: owner,
      reason: `비밀번호는 ${nameOf(family, owner)}님 화면에서만 입력해요. 가족에게도 보이지 않아요.`,
    };
  }

  // tier === 'act'
  if (self) return { ...base, decision: 'allow', reason: '본인 요청이에요.' };
  return {
    ...base,
    decision: 'needs_approval',
    approvals: { required: [owner], anyOf: null },
    reason: `${nameOf(family, owner)}님 계정에서 하는 일이라 ${nameOf(family, owner)}님의 확인이 필요해요.`,
  };
}

function evaluateMoney(family, base, input) {
  const { requester, owner } = base;
  const members = familyMemberIds(family);
  const beneficiary = input.to ?? null;
  const deny = (reason) => ({ ...base, decision: 'deny', reason });

  if (beneficiary && beneficiary !== 'external' && !members.includes(beneficiary)) {
    return deny('받는 사람을 확인할 수 없어요.');
  }
  if (beneficiary === 'external' && requester !== owner) {
    return deny('가족이 아닌 계좌로 보내는 요청은 계정 주인만 할 수 있어요. (사기 방지)');
  }

  const coSigners = members.filter((id) => id !== owner && id !== requester && id !== beneficiary);
  if (coSigners.length === 0) {
    return deny('함께 승인해 줄 가족이 없어서 진행할 수 없어요.');
  }

  let reason =
    `돈이 나가는 요청이라 ${nameOf(family, owner)}님 승인과 ` +
    `가족 1명(${coSigners.map((id) => nameOf(family, id)).join('·')})의 승인이 모두 필요해요.`;
  if (beneficiary === requester && requester !== owner) {
    reason += ` 요청한 ${nameOf(family, requester)}님은 돈을 받는 사람이라 승인자로 셀 수 없어요.`;
  }

  return {
    ...base,
    decision: 'needs_approval',
    approvals: { required: [owner], anyOf: { count: 1, from: coSigners } },
    beneficiary,
    reason,
  };
}

// ---- approval bookkeeping (pure helpers) ----

export function approverRole(request, userId) {
  const a = request.decision.approvals;
  if (!a) return null;
  if (a.required.includes(userId)) return 'owner';
  if (a.anyOf?.from.includes(userId)) return 'cosigner';
  return null;
}

export function canVote(request, userId) {
  if (request.status !== 'pending') return false;
  if (!approverRole(request, userId)) return false;
  if (request.votes[userId]) return false;
  // Once one co-signer approved, other co-signers are not needed.
  const a = request.decision.approvals;
  if (approverRole(request, userId) === 'cosigner' && a.anyOf) {
    const got = a.anyOf.from.filter((id) => request.votes[id] === 'approve').length;
    if (got >= a.anyOf.count) return false;
  }
  return true;
}

export function approvalState(request) {
  const { required, anyOf } = request.decision.approvals;
  const votes = request.votes;
  if (required.some((id) => votes[id] === 'reject')) return 'rejected';
  if (anyOf) {
    const rejected = anyOf.from.filter((id) => votes[id] === 'reject').length;
    if (anyOf.from.length - rejected < anyOf.count) return 'rejected';
  }
  const requiredOk = required.every((id) => votes[id] === 'approve');
  const anyOk = !anyOf || anyOf.from.filter((id) => votes[id] === 'approve').length >= anyOf.count;
  return requiredOk && anyOk ? 'approved' : 'pending';
}
