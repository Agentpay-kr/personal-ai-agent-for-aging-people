import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decryptText } from '../src/aead';
import { DAY_MS, FamilyTrust, type FamilyTrustOptions, type TrustEvent } from '../src/trust';
import { MemberDevice } from '../src/zk';

function setup(extra: Partial<FamilyTrustOptions> = {}) {
  const clock = { t: 1_000_000 };
  const seen: { session?: string } = {};
  const events: TrustEvent[] = [];
  const trust = new FamilyTrust({
    ...extra,
    familyId: 'kim',
    members: [
      { id: 'mom', name: '엄마', role: 'parent' },
      { id: 'dad', name: '아빠', role: 'parent' },
      { id: 'son', name: '아들', role: 'child' },
    ],
    now: () => clock.t,
    policy: { registeredPayees: { mom: ['우리 1002 (아들)'] } },
    executor: (req, { sessionSecret }) => {
      seen.session = sessionSecret;
      return `${req.summary ?? req.kind} 완료`;
    },
  });
  trust.on((e) => events.push(e));
  const mom = trust.createDevice('mom');
  const dad = trust.createDevice('dad');
  const son = trust.createDevice('son');
  return { trust, mom, dad, son, clock, seen, events };
}

test('subscription cleanup: son asks, mom approves, session opened from 2 of 3 shares, task data shredded', async () => {
  const { trust, mom, son, seen, events } = setup();
  await trust.linkAccount('mom', 'netflix', 'cookie=abc');
  const a = await trust.request(son, { owner: 'mom', kind: 'cancel_subscription', service: 'netflix', summary: '넷플릭스 해지' });
  assert.equal(a.status, 'pending');
  assert.deepEqual(a.approvals, ['son']);
  await trust.approveWith(mom, a.id);
  assert.equal(a.status, 'executed');
  assert.equal(seen.session, 'cookie=abc');
  assert.ok(a.receipt);
  const taskRecords = trust.vault.list().filter((r) => r.tags.some((t) => t.startsWith('task:')));
  assert.ok(taskRecords.length > 0 && taskRecords.every((r) => r.shredded));
  assert.ok(events.some((e) => e.type === 'shredded'));
});

test('neither the FA server nor the guardian alone can open a linked session', async () => {
  const { trust } = setup();
  await trust.linkAccount('mom', 'netflix', 'cookie=abc');
  const results = await trust.proveSingleShareFails('mom', 'netflix');
  assert.equal(results.length, 2);
  for (const r of results) assert.match(r, /not enough shares/);
});

test('an impostor phone cannot approve, and a proof cannot be replayed (hold-first mode)', async () => {
  const { trust, mom, son } = setup({ impostorStrikeLimit: 2 });
  await trust.linkAccount('mom', 'netflix', 'cookie=abc');
  const a = await trust.request(son, { owner: 'mom', kind: 'cancel_subscription', service: 'netflix' });
  await trust.approveWith(new MemberDevice('mom'), a.id);
  // The forged approval is ignored, and the request is held for one more family device.
  assert.equal(a.status, 'held');
  assert.deepEqual(a.approvals, ['son']);
  assert.equal(a.decision.approvalsRequired, 3);
  assert.ok(a.evidenceId);

  const ctx = trust.context('mom', 'approve', a.id);
  const proof = mom.prove(ctx);
  await trust.approve(a.id, 'mom', proof, mom.shareFor('session:mom:netflix'));
  assert.equal(a.status, 'held');
  assert.equal(trust.verifyProof('mom', proof, ctx), false);
});

test('beneficiary exclusion: dad asking for mom\'s money to himself needs mom + son, dad never counts', async () => {
  const { trust, mom, dad, son, clock } = setup();
  await trust.linkAccount('mom', 'bank', 'bank-session');
  const a = await trust.request(dad, { owner: 'mom', kind: 'transfer', service: 'bank', amountKRW: 500_000, payee: '아빠 계좌', payeeOwner: 'dad', summary: '엄마 → 아빠 50만원' });
  assert.equal(a.status, 'pending');
  assert.deepEqual(a.approvals, []);
  assert.ok(a.decision.reasons.some((r) => r.includes('승인자로 셀 수 없어요')));

  await trust.approveWith(dad, a.id);
  assert.deepEqual(a.approvals, []);
  await trust.approveWith(mom, a.id);
  assert.equal(a.status, 'pending');
  await trust.approveWith(son, a.id);
  assert.equal(a.status, 'scheduled');
  assert.deepEqual(a.approvals, ['mom', 'son']);

  clock.t = a.executeAfter! + 1;
  await trust.tick();
  assert.equal(a.status, 'executed');
});

test('a transfer with too few eligible approvers is blocked', async () => {
  const { trust, dad } = setup();
  const a = await trust.request(dad, { owner: 'mom', kind: 'transfer', amountKRW: 500_000, payee: '아들 계좌', payeeOwner: 'son', summary: '엄마 → 아들 50만원' });
  assert.equal(a.status, 'blocked');
});

test('impostor approval (hold-first mode): hold + family alert + sealed evidence, a second attempt self-destructs', async () => {
  const { trust, mom, dad, events } = setup({ impostorStrikeLimit: 2 });
  await trust.linkAccount('mom', 'bank', 'bank-session');
  const a = await trust.request(dad, { owner: 'mom', kind: 'transfer', service: 'bank', amountKRW: 500_000, payee: '아빠 계좌', payeeOwner: 'dad', summary: '엄마 → 아빠 50만원' });
  assert.equal(a.status, 'pending');

  await trust.approve(a.id, 'mom', dad.prove(trust.context('mom', 'approve', a.id)));
  assert.equal(a.status, 'held');
  assert.ok(a.evidenceId);
  assert.ok(events.some((e) => e.type === 'family_alert' && e.message.includes('사칭')));
  assert.equal(trust.linkedAccounts().length, 1);

  // The real mom can still approve, but one more family device is now required.
  await trust.approveWith(mom, a.id);
  assert.equal(a.status, 'held');

  await trust.approve(a.id, 'mom', new MemberDevice('mom').prove(trust.context('mom', 'approve', a.id)));
  assert.equal(a.status, 'cancelled');
  assert.equal(trust.linkedAccounts().length, 0);
  assert.ok(events.some((e) => e.type === 'self_destruct'));
  assert.equal(trust.frozen, true);
});

test('a non-member request is blocked and sealed as evidence', async () => {
  const { trust } = setup();
  const a = await trust.submit({ requester: 'stranger', owner: 'mom', kind: 'transfer', amountKRW: 100_000 });
  assert.equal(a.status, 'blocked');
  assert.ok(a.evidenceId);
});

test('voice phishing: held + evidence sealed; son flags scam → lockdown shreds sessions, re-keys, blocks; unlock needs 2', async () => {
  const { trust, mom, dad, son } = setup();
  await trust.linkAccount('mom', 'coupang', 'cookie=xyz');
  await trust.remember('엄마는 한 달에 한 번 쌀 10kg을 주문해요', 'son');
  const epoch = trust.keys.epoch;

  const scam = await trust.request(mom, {
    owner: 'mom',
    kind: 'transfer',
    amountKRW: 3_000_000,
    payee: '농협 352-0000',
    summary: '300만원 송금',
    text: '검찰이 안전계좌로 옮기래, 가족한테 말하지 말래',
  });
  assert.equal(scam.status, 'held');
  assert.ok(scam.evidenceId);

  await trust.rejectWith(son, scam.id, { scam: true });
  assert.equal(scam.status, 'rejected');
  assert.equal(trust.frozen, true);
  assert.ok(trust.keys.epoch > epoch);
  assert.equal(trust.linkedAccounts().length, 0);
  assert.equal(mom.shareFor('session:mom:coupang'), undefined);

  const order = await trust.request(mom, { owner: 'mom', kind: 'order', amountKRW: 30_000, summary: '쌀 10kg' });
  assert.equal(order.status, 'blocked');
  assert.deepEqual(await trust.recall(), ['엄마는 한 달에 한 번 쌀 10kg을 주문해요']);

  await assert.rejects(trust.openEvidence(scam.evidenceId!, [son]), /not enough shares/);
  const ev = (await trust.openEvidence(scam.evidenceId!, [son, dad])) as { text: string };
  assert.match(ev.text, /안전계좌/);

  assert.equal(await trust.unlockWith([son]), false);
  assert.equal(await trust.unlockWith([son, mom]), true);
  assert.equal(trust.frozen, false);
});

test('new payee: approvals collected, then executes only after the cooling-off period', async () => {
  const { trust, mom, son, clock } = setup();
  const a = await trust.request(mom, { owner: 'mom', kind: 'transfer', amountKRW: 200_000, payee: '하나 000', summary: '20만원 송금' });
  assert.equal(a.status, 'pending');
  await trust.approveWith(son, a.id);
  assert.equal(a.status, 'scheduled');
  await trust.tick();
  assert.equal(a.status, 'scheduled');
  clock.t += 181 * 60_000;
  await trust.tick();
  assert.equal(a.status, 'executed');
});

test('TTL: a linked session destroys itself after 30 days', async () => {
  const { trust, mom, clock, events } = setup();
  await trust.linkAccount('mom', 'coupang', 'cookie', { ttlDays: 30 });
  clock.t += 31 * DAY_MS;
  await trust.tick();
  assert.equal(trust.linkedAccounts().length, 0);
  assert.equal(mom.shareFor('session:mom:coupang'), undefined);
  assert.ok(events.some((e) => e.type === 'expired'));
});

test('leaving the room re-keys; the old family key cannot read new memory', async () => {
  const { trust } = setup();
  await trust.remember('before', 'son');
  const oldKey = trust.keys.familyKey();
  await trust.removeMember('dad');
  await trust.remember('after dad left', 'son');
  assert.deepEqual(await trust.recall(), ['before', 'after dad left']);
  await assert.rejects(decryptText(oldKey, trust.memoryCiphertexts().at(-1)!));
  await assert.rejects(decryptText(oldKey, trust.memoryCiphertexts()[0]!));
});

test('the audit chain stays valid through a full scenario', async () => {
  const { trust, mom, son } = setup();
  await trust.linkAccount('mom', 'netflix', 'c');
  const a = await trust.request(son, { owner: 'mom', kind: 'cancel_subscription', service: 'netflix' });
  await trust.approveWith(mom, a.id);
  await trust.request(mom, { owner: 'mom', kind: 'buy_gift_card', amountKRW: 500_000 });
  assert.equal(trust.audit.verify().ok, true);
  assert.ok(trust.audit.entries().length > 8);
});
