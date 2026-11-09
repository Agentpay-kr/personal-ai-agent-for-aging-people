import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { createDemoServer } from '../server.mjs';
import { trustAvailable } from '../trust-gate.mjs';

const family = ['son', 'mom', 'dad', 'fa'];

async function demo(t) {
  const server = createDemoServer({});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const demo_id = randomUUID();
  const room_id = randomUUID();
  async function send(actor, action, value, room = room_id, members = family) {
    return fetch(`${base}/api/router`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ demo_id, room_id: room, members, actor, action, value }),
    });
  }
  async function act(actor, action, value, room = room_id, members = family) {
    const response = await send(actor, action, value, room, members);
    assert.equal(response.status, 200);
    return response.json();
  }
  const profile = (actor = 'son', room = room_id, since = 0) => fetch(`${base}/api/trust?${new URLSearchParams({ demo_id, room_id: room, actor, since })}`);
  const control = (actor, action, action_id, room = room_id) => fetch(`${base}/api/trust/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ demo_id, room_id: room, actor, action, action_id }),
  });
  const trust = async () => (await profile()).json();
  const impostor = async () => (await control('son', 'impostor')).json();
  return { act, trust, impostor, profile, control };
}

const cardOf = (reply) => reply.messages.find((m) => m.card)?.card;
const buttonOf = (card, action) => card.actions.find((a) => a.action === action);

test('dad moving mom\'s money needs mom + son (dad never counts), then a 3-hour delay', { skip: !trustAvailable() }, async (t) => {
  const { act, trust } = await demo(t);
  const asked = cardOf(await act('dad', 'chat', '@치즈 엄마의 계좌에서 50만원만 내 계좌로 옮겨줘'));
  assert.equal(asked.kind, 'approval');
  // No card-wide audience, or the app disables son's co-sign button.
  assert.equal(asked.audience, undefined);
  const [momButton, cosign] = asked.actions.filter((a) => a.action === 'trust_approve');
  assert.equal(momButton.actor, 'mom');
  assert.deepEqual(cosign.actors, ['son']);
  assert.ok(asked.rows.some((r) => r.label === '승인 불가' && r.detail.includes('아빠')));

  // Dad receives the money, so his approval is refused.
  const dadTry = await act('dad', 'trust_approve', momButton.value);
  assert.match(dadTry.messages[0].text, /돈을 받는 사람은 승인할 수 없어요/);

  const afterMom = await act('mom', 'trust_approve', momButton.value);
  assert.match(afterMom.messages[0].text, /1명 더/);
  const scheduled = cardOf(await act('son', 'trust_approve', momButton.value));
  assert.match(scheduled.title, /실행 예약/);
  assert.ok(scheduled.rows.some((r) => r.detail.includes('엄마') && r.detail.includes('아들')));
  const done = cardOf(await act('son', 'trust_skip', buttonOf(scheduled, 'trust_skip').value));
  assert.match(done.title, /실행 완료/);

  const snap = await trust();
  assert.ok(snap.enabled);
  assert.ok(snap.events.some((e) => e.type === 'family_alert'));
  assert.ok(snap.events.some((e) => e.type === 'executed'));
  assert.equal(snap.audit.verified, true);
});

test('voice phishing (fraud) is held, evidence sealed, scam report locks down', { skip: !trustAvailable() }, async (t) => {
  const { act, trust } = await demo(t);
  const held = cardOf(await act('mom', 'chat', '검찰청이라는데 안전계좌로 300만원 옮기래. 가족한테는 말하지 말래'));
  assert.equal(held.kind, 'blocked');
  assert.match(held.title, /보이스피싱/);
  assert.ok(held.rows.some((r) => /안전계좌/.test(r.label)));

  const scam = buttonOf(held, 'trust_scam');
  assert.ok(scam.actors.includes('son') && !scam.actors.includes('mom'));
  const locked = await act('son', 'trust_scam', scam.value);
  assert.ok(locked.messages.some((m) => /긴급 잠금/.test(m.card?.title ?? '')));

  const snap = await trust();
  for (const type of ['family_alert', 'evidence', 'lockdown']) {
    assert.ok(snap.events.some((e) => e.type === type), `missing ${type}`);
  }
  assert.ok(!snap.events.some((e) => e.type === 'self_destruct'), 'fraud is not an intrusion');
  assert.equal(snap.evidenceCount, 1);

  // Two family devices unlock it again.
  await act('son', 'trust_unlock', 'unlock');
  const unlocked = await act('dad', 'trust_unlock', 'unlock');
  assert.match(unlocked.messages[0].text, /잠금을 풀고/);
});

test('impostor approval (takeover) self-destructs FA; sealed evidence remains', { skip: !trustAvailable() }, async (t) => {
  const { act, trust, impostor } = await demo(t);
  await act('dad', 'chat', '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘');
  assert.equal((await impostor()).status, 'cancelled');
  const snap = await trust();
  assert.ok(snap.events.some((e) => e.type === 'proof_failed'));
  assert.ok(snap.events.some((e) => e.type === 'self_destruct' && /탈취/.test(e.message)));
  assert.equal(snap.locked, true);
  assert.equal(snap.evidenceCount, 1);
  assert.equal(snap.linkCount, 0);
});

test('subscription chat is not taken over by the trust gate', async (t) => {
  const { act } = await demo(t);
  const reply = await act('son', 'chat', '엄마 구독 좀 정리해줘');
  assert.notEqual(cardOf(reply)?.kind, 'blocked');
});

test('the profile only exposes current room transfers and rejects unknown, guest and retired room access', { skip: !trustAvailable() }, async (t) => {
  const { act, profile, control } = await demo(t);
  const other = randomUUID();
  const asked = cardOf(await act('dad', 'chat', '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘'));
  const requestId = buttonOf(asked, 'trust_approve').value;
  assert.equal((await profile('son', other)).status, 404);
  await act('son', 'welcome', undefined, other, ['son', 'aunt', 'fa']);
  const otherProfile = await (await profile('son', other)).json();
  assert.equal(otherProfile.enabled, true);
  assert.deepEqual(otherProfile.actions, []);
  assert.ok(!JSON.stringify(otherProfile).includes('500,000원'));
  assert.equal((await profile('mom', other)).status, 403);
  assert.equal((await profile('aunt', other)).status, 403);
  assert.equal((await control('aunt', 'lock', undefined, other)).status, 403);
  assert.equal((await control('son', 'cancel', requestId, other)).status, 409);
  const otherApproval = await act('son', 'trust_approve', requestId, other, ['son', 'aunt', 'fa']);
  assert.match(otherApproval.messages[0].text, /요청을 찾을 수 없어요/);
  assert.ok((await (await profile()).json()).actions.some(({ id }) => id === requestId));

  await act('son', 'retire', undefined, other, ['son', 'aunt', 'fa']);
  assert.equal((await profile('son', other)).status, 404);
});

test('scope and roles match the real transfer gate for cancel, emergency lock, and two-device unlock', { skip: !trustAvailable() }, async (t) => {
  const { act, profile, control } = await demo(t);
  const requested = cardOf(await act('dad', 'chat', '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘'));
  const id = buttonOf(requested, 'trust_approve').value;
  assert.equal((await (await profile()).json()).actions.find((a) => a.id === id).canCancel, false);
  assert.equal((await control('son', 'cancel', id)).status, 403);
  await act('mom', 'trust_approve', id);
  await act('son', 'trust_approve', id);
  assert.equal((await (await profile()).json()).actions.find((a) => a.id === id).canCancel, true);
  const cancelled = await control('son', 'cancel', id);
  assert.equal(cancelled.status, 200);
  assert.ok(!(await cancelled.json()).actions.some((a) => a.id === id));

  await act('dad', 'chat', '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘');
  const locked = await control('son', 'lock');
  assert.equal(locked.status, 200);
  const snapshot = await locked.json();
  assert.equal(snapshot.locked, true);
  assert.equal(snapshot.scope, 'transfers');
  assert.equal(snapshot.linkCount, 0);
  assert.deepEqual(snapshot.actions, []);
  assert.equal(cardOf(await act('dad', 'chat', '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘')).kind, 'blocked');
  assert.equal(cardOf(await act('son', 'chat', '엄마 구독 좀 정리해줘')).kind, 'login');

  const firstVote = await control('son', 'unlock');
  assert.equal((await firstVote.json()).locked, true);
  assert.equal((await control('son', 'unlock')).status, 409);
  const other = randomUUID();
  await act('dad', 'welcome', undefined, other, ['dad', 'mom', 'fa']);
  const otherRoomVote = await control('dad', 'unlock', undefined, other);
  assert.equal((await otherRoomVote.json()).locked, true);
  const secondVote = await control('mom', 'unlock');
  assert.equal(secondVote.status, 200);
  assert.equal((await secondVote.json()).locked, false);
});

test('the live trust gate prevents transfer-shaped questions from opening the fallback approval flow', { skip: !trustAvailable() }, async (t) => {
  const { act, control, trust } = await demo(t);
  await act('son', 'welcome');
  assert.equal((await (await control('son', 'lock')).json()).locked, true);

  const punctuated = await act('dad', 'chat', '@치즈, 엄마의 계좌에서 50만원만 내 계좌로 옮겨줘?');
  assert.equal(punctuated.handled, false);
  assert.equal(punctuated.state.phase, 'idle');
  assert.deepEqual(punctuated.messages, []);

  const information = await act('son', 'chat', '엄마에게 5만원을 송금하려면 어떻게 해야 해?');
  assert.equal(information.handled, false);
  assert.equal(information.state.phase, 'idle');
  const withoutPunctuation = await act('dad', 'chat', '엄마의 계좌에서 내 계좌로 50만원 송금할 수 있나요');
  assert.equal(withoutPunctuation.handled, false);
  assert.deepEqual((await trust()).actions, []);
});
