import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDemoVmAgent } from '../vm-agent.mjs';

function job(overrides = {}) {
  return {
    schema_version: '1.0',
    request_id: 'list-1',
    operation: 'subscriptions.list',
    actor: 'son',
    owner: 'mom',
    vm_id: 'vm-mom',
    arguments: {},
    authorization: { type: 'read-grant' },
    ...overrides,
  };
}

function cancellation(overrides = {}) {
  return job({
    request_id: 'cancel-1',
    operation: 'subscriptions.cancel',
    arguments: { service_id: 'tving' },
    authorization: { type: 'owner-approval', approval_id: 'approval-1' },
    ...overrides,
  });
}

test('VM bindings isolate subscription records and mutations by owner', () => {
  const worker = createDemoVmAgent();
  assert.deepEqual(worker.execute(job()), {
    request_id: 'list-1', status: 'simulated', subscriptions: [
      { id: 'tving', name: '티빙', price: '월 13,500원' },
      { id: 'melon', name: '멜론', price: '월 10,900원' },
      { id: 'naver', name: '네이버플러스', price: '월 4,900원' },
    ],
  });

  assert.deepEqual(worker.execute(cancellation()), {
    request_id: 'cancel-1', status: 'simulated',
    subscription: { id: 'tving', name: '티빙', price: '월 13,500원' },
  });
  const mom = worker.execute(job({ request_id: 'list-2' }));
  const son = worker.execute(job({ request_id: 'list-3', owner: 'son', vm_id: 'vm-son', authorization: { type: 'owner' } }));
  assert.deepEqual(mom.subscriptions.map(({ id }) => id), ['melon', 'naver']);
  assert.ok(son.subscriptions.some(({ id }) => id === 'tving'));
});

test('worker rejects unsupported fields, bindings and authorization for the operation', () => {
  const worker = createDemoVmAgent();
  for (const invalid of [
    job({ vm_id: 'vm-son' }),
    job({ actor: 'guest' }),
    job({ authorization: { type: 'owner' } }),
    job({ arguments: { login: 'invalid' } }),
    job({ operation: 'bank.transfer' }),
    job({ credential: 'invalid' }),
    cancellation({ authorization: { type: 'read-grant' } }),
    cancellation({ authorization: { type: 'owner-approval' } }),
  ]) {
    assert.throws(() => worker.execute(invalid), /invalid vm job/i);
  }
  assert.equal(worker.execute(job()).subscriptions.length, 3);
});

test('same request replays the result while changed jobs cannot reuse its ID', () => {
  const worker = createDemoVmAgent();
  const first = worker.execute(cancellation());
  assert.deepEqual(worker.execute(cancellation()), first);
  assert.throws(() => worker.execute(cancellation({ arguments: { service_id: 'melon' } })), /request ID conflict/i);
  assert.throws(() => worker.execute(cancellation({ request_id: 'cancel-2' })), /subscription unavailable/i);
  assert.deepEqual(worker.execute(job()).subscriptions.map(({ id }) => id), ['melon', 'naver']);
});
