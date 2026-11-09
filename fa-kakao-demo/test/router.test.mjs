import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { createDemoServer } from '../server.mjs';

const family = ['son', 'mom', 'dad', 'fa'];

async function demo(t, env = {}) {
  const server = createDemoServer(env);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/router`;
  const demo_id = randomUUID();
  return (members = family) => {
    const room_id = randomUUID();
    let step_id;
    async function send(actor, action, value, extra = {}, origin) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(origin && { origin }) },
        body: JSON.stringify({ demo_id, room_id, members, actor, action, value, step_id, ...extra }),
      });
      const data = await response.json();
      return { status: response.status, ...data };
    }
    return {
      send,
      async act(...args) {
        const result = await send(...args);
        assert.equal(result.status, 200);
        step_id = result.state.step_id;
        return { ...result, card: result.messages[0]?.card };
      },
    };
  };
}

async function connect(room, owner = 'mom') {
  const target = { mom: '엄마', dad: '아빠' }[owner];
  assert.equal((await room.act('son', 'chat', `${target} 구독 좀 정리해줘`)).card.audience, owner);
  assert.equal((await room.act(owner, 'login', `${owner}-demo`)).state.phase, 'awaiting-scope');
  assert.equal((await room.act(owner, 'scope')).state.phase, 'ready');
}

test('the requester can read an owner VM only after owner consent and cannot approve for the owner', async (t) => {
  const room = (await demo(t))();
  const setup = await room.act('son', 'chat', '@FA 엄마 구독 좀 정리해줘');
  assert.equal(setup.card.audience, 'mom');
  assert.equal((await room.act('son', 'login', 'mom-demo')).state.phase, 'awaiting-login');
  assert.equal((await room.act('mom', 'login', 'dad-demo')).state.phase, 'awaiting-login');
  await room.act('mom', 'login', 'mom-demo');
  assert.equal((await room.act('son', 'scope')).state.phase, 'awaiting-scope');
  await room.act('mom', 'scope');
  assert.equal((await room.act('dad', 'scan')).state.phase, 'ready');
  const list = await room.act('son', 'scan');
  assert.equal(list.card.kind, 'subscriptions');
  assert.ok(list.card.rows.some(({ detail }) => detail === '엄마 전용 컴퓨터'));
  assert.equal(list.card.actions.length, 3);
  assert.deepEqual(list.messages[0].visibleTo, ['son', 'mom', 'dad']);
  const proposal = await room.act('son', 'propose', 'tving');
  const id = proposal.card.actions[0].value;
  assert.equal(proposal.card.audience, 'mom');
  assert.equal((await room.act('son', 'approve', id)).state.phase, 'awaiting-approval');
  const done = await room.act('mom', 'approve', id);
  assert.equal(done.state.phase, 'complete');
  assert.match(done.card.description, /연습/);
  assert.equal((await room.act('mom', 'approve', id)).card, undefined);
  assert.deepEqual((await room.act('son', 'scan')).card.actions.map(({ value }) => value), ['melon', 'naver']);
});

test('the same service requires a fresh exact owner approval after denial', async (t) => {
  const room = (await demo(t))();
  await connect(room);
  await room.act('son', 'scan');
  const first = await room.act('son', 'propose', 'tving');
  await room.act('mom', 'deny', first.card.actions[1].value);
  const next = await room.act('son', 'propose', 'tving');
  assert.notEqual(first.card.actions[0].value, next.card.actions[0].value);
  assert.equal((await room.act('mom', 'approve', first.card.actions[0].value)).state.phase, 'awaiting-approval');
  assert.equal((await room.act('mom', 'approve', next.card.actions[0].value, { step_id: first.state.step_id })).state.phase, 'awaiting-approval');
  assert.equal((await room.act('mom', 'chat', '승인할게라고 답하면 돼?')).handled, false);
  assert.equal((await room.act('mom', 'chat', '@치즈, 해지 승인할게요.')).state.phase, 'awaiting-approval');
  assert.equal((await room.act('mom', 'chat', '@치즈, 해지 승인할게요.', { approval_id: next.card.actions[0].value })).state.phase, 'complete');
});

test('ambiguous or unsupported requests cannot silently route to an existing owner', async (t) => {
  const room = (await demo(t))();
  assert.equal((await room.act('son', 'chat', '구독 보여줘')).state.phase, 'idle');
  await connect(room);
  await room.act('son', 'scan');
  for (const text of [
    '엄마 말고 아빠 티빙 해지해줘', '이모 구독 보여줘', '누나 티빙 해지해줘', '티빙 해지하지 마',
    '티빙 말고 그 구독 해지해줘', '티빙하고 멜론 해지해줘', '아빠는 됐고 내 것도 구독 목록 보여줘',
  ]) {
    assert.equal((await room.act('son', 'chat', text)).state.phase, 'review');
  }
  assert.equal((await room.act('son', 'chat', '아빠 티빙 해지해줘')).state.owner, 'dad');
  await room.act('dad', 'login', 'dad-demo');
  await room.act('dad', 'scope');
  const list = await room.act('son', 'scan');
  assert.deepEqual(list.card.actions.map(({ value }) => value), ['melon']);
  assert.ok(list.card.rows.some(({ detail }) => detail === '아빠 전용 컴퓨터'));
  assert.equal((await room.act('son', 'chat', '엄마 구독 보여줘')).card.actions.length, 3);
  assert.equal((await room.act('son', 'chat', '내 구독 보여줘')).state.owner, 'son');
});

test('refusing family access lets the owner read privately', async (t) => {
  const room = (await demo(t))();
  await room.act('son', 'chat', '엄마 구독 보여줘');
  await room.act('mom', 'login', 'mom-demo');
  await room.act('mom', 'deny');
  assert.equal((await room.act('son', 'scan')).card, undefined);
  const privateList = await room.act('mom', 'chat', '내 구독 보여줘');
  assert.deepEqual(privateList.messages[0].visibleTo, ['mom']);
  assert.deepEqual(privateList.card.actions[0].actors, ['mom']);
  assert.equal((await room.act('mom', 'chat', '구독 자동 갱신이 뭐야?')).handled, false);
});

test('concurrent approval requests consume only one approval', async (t) => {
  const room = (await demo(t))();
  await connect(room);
  await room.act('son', 'scan');
  const proposal = await room.act('son', 'propose', 'tving');
  const id = proposal.card.actions[0].value;
  const replies = await Promise.all([room.send('mom', 'approve', id), room.send('mom', 'approve', id)]);
  assert.ok(replies.every(({ status }) => status === 200));
  assert.equal(replies.filter(({ messages }) => messages[0]?.card?.kind === 'result').length, 1);
});

test('bank transfers, forged fields, and room audience changes cannot authorize work', async (t) => {
  const createRoom = await demo(t);
  const room = createRoom();
  // A transfer never runs on the request alone: with fa-trust it waits for device approvals,
  // without it the FA engine's family multisig. Either way dad gets no button that could approve it.
  const transfer = (await createRoom().act('dad', 'chat', '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘')).card;
  assert.ok(['blocked', 'approval'].includes(transfer.kind));
  assert.ok((transfer.actions ?? []).every((a) => a.action === 'trust_scam'
    || (a.actor && a.actor !== 'dad') || (a.actors && !a.actors.includes('dad'))));
  const absent = await createRoom(['son', 'fa']).act('son', 'chat', '엄마 구독 보여줘');
  assert.match(absent.messages[0].text, /엄마를.*초대/);
  await connect(room);
  await room.act('son', 'scan');
  const proposal = await room.act('son', 'propose', 'tving');
  const approvalId = proposal.card.actions[0].value;
  assert.equal((await room.send('mom', 'approve', approvalId, { flow: { phase: 'complete' }, vm_id: 'vm-dad' })).status, 400);
  assert.equal((await room.send('mom', 'approve', approvalId, {}, 'https://other.test')).status, 403);
  assert.equal((await room.send('mom', 'approve', approvalId, { members: [...family, 'aunt'] })).status, 409);
  assert.equal((await createRoom().act('mom', 'approve', approvalId)).state.phase, 'idle');
  await room.act('son', 'retire');
  assert.equal((await room.send('mom', 'approve', approvalId)).status, 409);
});

test('a selectable guest can chat without obtaining VM permissions', async (t) => {
  const room = (await demo(t))([...family, 'aunt']);
  assert.equal((await room.act('aunt', 'chat', '안녕하세요')).handled, false);
  await connect(room);
  const denied = await room.act('aunt', 'chat', '엄마 구독 목록 보여줘');
  assert.equal(denied.state.phase, 'ready');
  assert.match(denied.messages[0].text, /볼 수 없어요/);
});

test('FA engine family multisig: owner + one co-signer; requester and beneficiary cannot sign', async (t) => {
  // fa-trust off: money requests use the FA engine fallback.
  const room = (await demo(t, { FA_TRUST: 'off' }))();
  const asked = await room.act('dad', 'chat', '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘');
  assert.match(asked.messages[0].text, /엄마 승인과 가족 1명\(아들\)의 승인이 모두 필요해요/);
  assert.match(asked.messages[0].text, /아빠는 돈을 받는 사람이라/);
  const id = asked.card.actions[0].value;
  assert.deepEqual(asked.card.actions.map(({ action, actor }) => [action, actor ?? null]),
    [['cosign', 'mom'], ['cosign', 'son'], ['deny', null]]);

  const self = await room.send('dad', 'cosign', id);
  assert.match(self.messages[0].text, /돈을 받는 사람은 승인할 수 없어요/);
  assert.equal(self.state.phase, 'awaiting-cosign');

  const busy = await room.act('son', 'chat', '엄마 구독 좀 정리해줘');
  assert.match(busy.messages[0].text, /송금 승인을 먼저 마무리/);

  const momOk = await room.act('mom', 'cosign', id);
  assert.equal(momOk.state.phase, 'awaiting-cosign');
  assert.deepEqual(momOk.card.actions.map(({ actor }) => actor ?? null), ['son', null]);

  const done = await room.act('son', 'cosign', id);
  assert.equal(done.card.kind, 'result');
  assert.equal(done.card.title, '송금 초안 준비 완료');
  assert.equal(done.state.phase, 'idle');

  const stale = await room.send('mom', 'cosign', id);
  assert.notEqual(stale.messages[0]?.card?.kind, 'result');
});

test('FA engine blocks transfers it cannot co-sign and family members without the right', async (t) => {
  const createRoom = await demo(t, { FA_TRUST: 'off' });
  const noCosigner = await createRoom(['mom', 'dad', 'fa']).act('dad', 'chat', '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘');
  assert.equal(noCosigner.card.kind, 'blocked');
  assert.match(noCosigner.card.description, /함께 승인할 가족이 이 방에 없어요/);
  const outside = await createRoom().act('son', 'chat', '엄마 계좌에서 10만원 송금해줘');
  assert.equal(outside.card.kind, 'blocked');
  assert.match(outside.card.description, /가족이 아닌 계좌/);
  const rejected = createRoom();
  const asked = await rejected.act('dad', 'chat', '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘');
  const no = await rejected.act('mom', 'deny', asked.card.actions[0].value);
  assert.equal(no.card.title, '송금하지 않음');
});
