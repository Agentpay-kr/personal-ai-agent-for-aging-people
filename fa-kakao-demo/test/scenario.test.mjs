import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canSee, isCurrentCard } from '../public/scenario.mjs';

test('a saved result stays visible only to the audience that was granted access', () => {
  const message = { visibleTo: ['mom', 'son'] };
  assert.equal(canSee(message, 'son'), true);
  assert.equal(canSee(message, 'dad'), false);
  assert.equal(canSee({ visibleTo: [] }, 'mom'), false);
  assert.equal(canSee({}, 'dad'), true);
});

test('a card for an earlier step stays locked when the new step has the same phase', () => {
  const first = { phase: 'awaiting-approval', step_id: 'first' };
  const next = { ...first, step_id: 'next' };
  assert.equal(isCurrentCard(first, next), false);
  assert.equal(isCurrentCard(next, next), true);
  assert.equal(isCurrentCard(next, undefined), false);
  assert.equal(isCurrentCard({ ...next, expired: true }, next), false);
});
