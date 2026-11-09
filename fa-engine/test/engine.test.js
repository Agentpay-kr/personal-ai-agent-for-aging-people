// Regression tests for engine/Molla wiring (from the architecture review).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.FA_MODE = 'scripted';
process.env.FA_VM_STEP_MS = '0';
process.env.FA_MEMORY = 'off';
process.env.MOLLA_RUN_MS = '0';

const engine = await import('../src/engine.js');
const molla = await import('../src/molla.js');
const store = await import('../src/store.js');
const { evaluate } = await import('../src/policy.js');
const { storeCredentials } = await import('../src/vault.js');

function fresh(members = ['mom', 'dad', 'fa']) {
  engine.resetAll();
  molla.resetMolla();
  return engine.createRoom({ name: '우리 가족', createdBy: 'son', members });
}
const lastOf = (roomId, type) => [...store.getRoom(roomId).events].reverse().find((e) => e.type === type);
const mollaTask = (actor, id) => molla.state(actor).tasks.find((t) => t.id === id);

test('a failed execution is reported as failed on both surfaces, not prepared', async () => {
  const room = fresh();
  const r = await engine.requestAction({ roomId: room.id, requester: 'dad', action: 'transfer_money', input: { owner: 'mom', to: 'dad', amount: 99_000_000 } });
  await engine.vote({ requestId: r.requestId, userId: 'mom', vote: 'approve' });
  await engine.vote({ requestId: r.requestId, userId: 'son', vote: 'approve' });
  assert.equal(store.getRequest(r.requestId).status, 'failed');
  const t = mollaTask('mom', r.requestId);
  assert.equal(t.status, 'failed');
  assert.equal(t.evidence.verified, false);
});

test('an approved order waiting for a login is running, then prepared after the resume', async () => {
  const room = fresh();
  const r = await engine.requestAction({ roomId: room.id, requester: 'son', action: 'order_item', input: { owner: 'mom', item: '쌀 10kg', quantity: 1, price: 1 } });
  await engine.vote({ requestId: r.requestId, userId: 'mom', vote: 'approve' });
  assert.equal(mollaTask('mom', r.requestId).status, 'running');
  const input = lastOf(room.id, 'card.input_request');
  await engine.submitInput({ requestId: input.id, userId: 'mom', values: { id: 'mom1960', password: 'pw' } });
  assert.equal(mollaTask('mom', r.requestId).status, 'prepared');
});

test('the requester must be in the room, and owner-facing cards need the owner there', async () => {
  const room = fresh(['dad', 'fa']); // son + dad only
  await assert.rejects(engine.requestAction({ roomId: room.id, requester: 'mom', action: 'scan_subscriptions', input: {} }), { status: 403 });
  const r = await engine.requestAction({ roomId: room.id, requester: 'son', action: 'connect_account', input: { owner: 'mom', service: 'email' } });
  assert.equal(r.status, 'denied');
});

test('non-members cannot read room history', () => {
  const room = fresh(['mom', 'fa']);
  assert.throws(() => engine.roomMessages(room.id, 'dad'), { status: 403 });
});

test('VM state is readable only by the owner or a read delegate', () => {
  fresh();
  assert.ok(engine.vmInfo('mom', 'son')); // mom delegated read to son
  assert.throws(() => engine.vmInfo('son', 'mom'), { status: 403 }); // son delegated nothing
});

test('two cancels of the same subscription: the second reports failure, not savings', async () => {
  const room = fresh();
  storeCredentials('mom', 'email', { id: 'mom@example.com', password: 'pw' });
  const [a, b] = await Promise.all([
    engine.requestAction({ roomId: room.id, requester: 'mom', action: 'cancel_subscription', input: { owner: 'mom', subscription_ids: ['watcha'] } }),
    engine.requestAction({ roomId: room.id, requester: 'mom', action: 'cancel_subscription', input: { owner: 'mom', subscription_ids: ['watcha'] } }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), ['done', 'failed']);
});

test('the catalog price decides the tier, not the stated price', async () => {
  const room = fresh();
  const r = await engine.requestAction({ roomId: room.id, requester: 'mom', action: 'order_item', input: { owner: 'mom', item: '안마의자', quantity: 1, price: 1000 } });
  assert.equal(r.status, 'waiting_approval');
  assert.equal(store.getRequest(r.requestId).decision.tier, 'money');
});

test('revoking consent cancels pending requests and blocks the resume', async () => {
  const room = fresh();
  const r = await engine.requestAction({ roomId: room.id, requester: 'son', action: 'scan_subscriptions', input: { owner: 'mom' } });
  assert.equal(r.status, 'waiting_input');
  molla.setConsent('mom', { value: 'revoked' });
  assert.equal(store.getRequest(r.requestId).status, 'cancelled');
  await assert.rejects(engine.submitInput({ requestId: r.requestId, userId: 'mom', values: { id: 'a', password: 'b' } }), { status: 409 });
});

test('invited guests are not co-signers or family beneficiaries', () => {
  fresh();
  const sid = molla.newSession('dad');
  const { invite } = molla.createInvite('dad', { name: '가짜 가족' });
  const { me } = molla.acceptInvite(sid, { code: invite.code });
  const d = evaluate(engine.family, { requester: 'dad', owner: 'mom', action: 'transfer_money', input: { to: 'dad', amount: 500000 } });
  assert.deepEqual(d.approvals.anyOf.from, ['son']);
  const toGuest = evaluate(engine.family, { requester: 'dad', owner: 'mom', action: 'transfer_money', input: { to: me.id, amount: 500000 } });
  assert.equal(toGuest.decision, 'deny');
});

test('Molla run logs stay out of chat rooms; requester sees no artifact details', async () => {
  const room = fresh();
  const before = store.getRoom(room.id).events.length;
  const { task } = molla.createTask('son', { owner: 'mom', text: '쌀 10kg 주문 준비해줘' });
  await molla.decideTask('mom', { id: task.id, decision: 'approve' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(store.getRoom(room.id).events.length, before);
  const seenBySon = mollaTask('son', task.id);
  assert.equal(seenBySon.status, 'prepared');
  assert.equal(seenBySon.action, undefined);
  assert.equal(seenBySon.evidence.artifact, undefined);
});

test('"엄마 계좌에서" names the owner when --owner is missing', () => {
  fresh();
  const { task } = molla.createTask('dad', { text: '엄마 계좌에서 50만원 내 계좌로 옮겨줘' });
  assert.equal(task.owner, 'mom');
  assert.equal(task.tier, 'money');
});

test('prototype keys are not members or actions', async () => {
  const room = fresh();
  await assert.rejects(engine.requestAction({ roomId: room.id, requester: 'constructor', action: 'scan_subscriptions', input: {} }), { status: 403 });
  assert.equal(evaluate(engine.family, { requester: 'son', owner: 'mom', action: 'constructor' }).decision, 'deny');
  assert.equal(evaluate(engine.family, { requester: 'son', owner: 'constructor', action: 'scan_subscriptions' }).decision, 'deny');
});
