import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, FORBIDDEN_ACTIONS, type ActionKind } from '../src/policy';
import { PROPOSE_ACTION_TOOL, toActionRequest } from '../src/tool';

const names = { mom: '엄마', dad: '아빠', son: '아들' };
const ids = (d: { signals: Array<{ id: string }> }) => d.signals.map((s) => s.id);

test('voice phishing: held even though mom (the owner) asked herself', () => {
  const d = evaluate(
    {
      requester: 'mom',
      owner: 'mom',
      kind: 'transfer',
      amountKRW: 3_000_000,
      payee: '농협 352-0000',
      text: '검찰에서 전화 왔는데 내 계좌가 범죄에 연루됐대. 안전계좌로 300만원 옮기래. 가족한테 말하지 말래',
    },
    { requesterVerified: true, names },
  );
  assert.equal(d.outcome, 'hold');
  for (const id of ['impersonate_authority', 'safe_account', 'secrecy', 'new_payee', 'large_amount']) {
    assert.ok(ids(d).includes(id), `missing ${id}`);
  }
  assert.equal(d.notifyFamily, true);
  assert.equal(d.sealEvidence, true);
  assert.equal(d.approvalsRequired, 2);
  assert.equal(d.coolingOffMinutes, 24 * 60);
});

test('child impersonation found in an SMS the app forwarded as context', () => {
  const d = evaluate(
    {
      requester: 'mom',
      owner: 'mom',
      kind: 'transfer',
      amountKRW: 500_000,
      payee: '신한 110-000',
      context: ['엄마 나 폰 액정 깨져서 친구 폰으로 연락해. 급해서 그러는데 50만원만 보내줘'],
    },
    { requesterVerified: true },
  );
  assert.equal(d.outcome, 'hold');
  assert.ok(ids(d).includes('impersonate_child'));
});

test('forbidden actions are blocked whoever asks', () => {
  for (const kind of Object.keys(FORBIDDEN_ACTIONS) as ActionKind[]) {
    const d = evaluate({ requester: 'mom', owner: 'mom', kind }, { requesterVerified: true });
    assert.equal(d.tier, 'T3', kind);
    assert.equal(d.outcome, 'block', kind);
    assert.equal(d.sealEvidence, true, kind);
  }
});

test('son cancels mom subscription → mom + 1 family member (2-of-3)', () => {
  const d = evaluate(
    { requester: 'son', owner: 'mom', kind: 'cancel_subscription', service: 'netflix', summary: '넷플릭스 해지' },
    { requesterVerified: true, names },
  );
  assert.equal(d.outcome, 'needs_approval');
  assert.equal(d.tier, 'T2');
  assert.equal(d.ownerApprovalRequired, true);
  assert.equal(d.approvalsRequired, 2);
  assert.equal(d.coolingOffMinutes, 0);
});

test('mom orders rice herself (small, verified) → allowed right away', () => {
  const d = evaluate(
    { requester: 'mom', owner: 'mom', kind: 'order', amountKRW: 32_000, summary: '쌀 10kg' },
    { requesterVerified: true },
  );
  assert.equal(d.tier, 'T1');
  assert.equal(d.outcome, 'allow');
});

test('dad moving mom money to his own account needs mom and tells the family', () => {
  const d = evaluate(
    { requester: 'dad', owner: 'mom', kind: 'transfer', amountKRW: 500_000, payee: '국민 (아빠)', payeeOwner: 'dad' },
    { requesterVerified: true, names },
  );
  assert.equal(d.outcome, 'needs_approval');
  assert.equal(d.ownerApprovalRequired, true);
  assert.equal(d.approvalsRequired, 2);
  assert.equal(d.notifyFamily, true);
  assert.ok(ids(d).includes('self_dealing'));
  assert.equal(d.coolingOffMinutes, 180);
});

test('mom paying a registered payee is owner-only; a new payee adds a second signer and a delay', () => {
  const policy = { registeredPayees: { mom: ['우리 1002 (아들)'] } };
  const known = evaluate(
    { requester: 'mom', owner: 'mom', kind: 'transfer', amountKRW: 200_000, payee: '우리 1002 (아들)' },
    { requesterVerified: true, policy },
  );
  assert.equal(known.approvalsRequired, 1);
  assert.equal(known.coolingOffMinutes, 0);
  const fresh = evaluate(
    { requester: 'mom', owner: 'mom', kind: 'transfer', amountKRW: 200_000, payee: '하나 000' },
    { requesterVerified: true, policy },
  );
  assert.equal(fresh.outcome, 'needs_approval');
  assert.equal(fresh.approvalsRequired, 2);
  assert.equal(fresh.coolingOffMinutes, 180);
});

test('LLM score can raise risk but cannot lower it', () => {
  const raised = evaluate(
    { requester: 'mom', owner: 'mom', kind: 'order', amountKRW: 10_000, llmRiskScore: 0.9 },
    { requesterVerified: true },
  );
  assert.equal(raised.outcome, 'hold');
  const notLowered = evaluate(
    { requester: 'mom', owner: 'mom', kind: 'transfer', amountKRW: 100_000, payee: 'x', llmRiskScore: 0, text: '안전계좌로 옮기래' },
    { requesterVerified: true },
  );
  assert.equal(notLowered.outcome, 'hold');
});

test('a request for someone else without a device proof is held', () => {
  const d = evaluate({ requester: 'son', owner: 'mom', kind: 'cancel_subscription' }, { requesterVerified: false });
  assert.equal(d.outcome, 'hold');
  assert.ok(ids(d).includes('unverified_requester'));
});

test('reads are allowed and never held', () => {
  const d = evaluate({ requester: 'son', owner: 'mom', kind: 'read', summary: '구독 목록' }, { requesterVerified: true });
  assert.equal(d.outcome, 'allow');
});

test('tool glue: chat text comes from the app, unknown kinds are rejected', () => {
  assert.equal(PROPOSE_ACTION_TOOL.name, 'propose_action');
  const req = toActionRequest(
    { owner: 'mom', kind: 'transfer', summary: '송금', amountKRW: 3_000_000, payee: '농협' },
    { text: '안전계좌로 옮기래' },
  );
  assert.equal(req.text, '안전계좌로 옮기래');
  assert.equal(req.amountKRW, 3_000_000);
  assert.throws(() => toActionRequest({ owner: 'mom', kind: 'wire_everything' }), /unknown action kind/);
});
