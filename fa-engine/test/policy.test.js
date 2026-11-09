import test from 'node:test';
import assert from 'node:assert/strict';
import { seedFamily } from '../src/family.js';
import { evaluate, canVote, approvalState } from '../src/policy.js';

const family = seedFamily();
const ev = (requester, owner, action, input) => evaluate(family, { requester, owner, action, input });
const req = (decision) => ({ decision, votes: {}, status: 'pending' });

test('son can read mom subscriptions (delegated read)', () => {
  assert.equal(ev('son', 'mom', 'scan_subscriptions').decision, 'allow');
});

test('son cancelling mom subscription needs mom tap', () => {
  const d = ev('son', 'mom', 'cancel_subscription', { subscription_ids: ['watcha'] });
  assert.equal(d.decision, 'needs_approval');
  assert.deepEqual(d.approvals, { required: ['mom'], anyOf: null });
});

test('mom ordering rice for herself runs directly', () => {
  assert.equal(ev('mom', 'mom', 'order_item', { item: '쌀 10kg', price: 32900 }).decision, 'allow');
});

test('a big order escalates to the money tier', () => {
  const d = ev('mom', 'mom', 'order_item', { item: 'TV', price: 900000 });
  assert.equal(d.tier, 'money');
  assert.equal(d.decision, 'needs_approval');
});

test('dad cannot act on mom account without delegation', () => {
  assert.equal(ev('dad', 'mom', 'cancel_subscription', { subscription_ids: ['watcha'] }).decision, 'deny');
});

test('connecting mom email: son may start it, only mom types the password', () => {
  const d = ev('son', 'mom', 'connect_account', { service: 'email' });
  assert.equal(d.decision, 'needs_input');
  assert.equal(d.inputFrom, 'mom');
});

test('son connecting his own email asks son for input', () => {
  const d = ev('son', 'son', 'connect_account', { service: 'email' });
  assert.equal(d.decision, 'needs_input');
  assert.equal(d.inputFrom, 'son');
});

test('dad moving 500k from mom to himself needs mom + son; dad cannot co-sign', () => {
  const d = ev('dad', 'mom', 'transfer_money', { to: 'dad', amount: 500000 });
  assert.equal(d.decision, 'needs_approval');
  assert.deepEqual(d.approvals, { required: ['mom'], anyOf: { count: 1, from: ['son'] } });
  const r = req(d);
  assert.equal(canVote(r, 'dad'), false);
  assert.equal(canVote(r, 'mom'), true);
  assert.equal(canVote(r, 'son'), true);
});

test('family multisig: mom alone is not enough, mom + son approves', () => {
  const r = req(ev('dad', 'mom', 'transfer_money', { to: 'dad', amount: 500000 }));
  r.votes.mom = 'approve';
  assert.equal(approvalState(r), 'pending');
  r.votes.son = 'approve';
  assert.equal(approvalState(r), 'approved');
});

test('owner reject ends the request', () => {
  const r = req(ev('dad', 'mom', 'transfer_money', { to: 'dad', amount: 500000 }));
  r.votes.mom = 'reject';
  assert.equal(approvalState(r), 'rejected');
});

test('non-owner cannot send money outside the family', () => {
  assert.equal(ev('son', 'mom', 'transfer_money', { to: 'external', amount: 100000 }).decision, 'deny');
});

test('revoked consent blocks everyone but the owner', () => {
  const f = seedFamily();
  f.consent.mom = 'revoked';
  assert.equal(evaluate(f, { requester: 'son', owner: 'mom', action: 'scan_subscriptions' }).decision, 'deny');
  assert.equal(evaluate(f, { requester: 'mom', owner: 'mom', action: 'scan_subscriptions' }).decision, 'allow');
});

test('unknown action is denied', () => {
  assert.equal(ev('son', 'mom', 'delete_everything').decision, 'deny');
});
