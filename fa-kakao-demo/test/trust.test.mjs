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
  async function act(actor, action, value) {
    const response = await fetch(`${base}/api/router`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ demo_id, room_id, members: family, actor, action, value }),
    });
    assert.equal(response.status, 200);
    return response.json();
  }
  const trust = async (since = 0) => (await fetch(`${base}/api/trust?demo_id=${demo_id}&since=${since}`)).json();
  const impostor = async () => (await fetch(`${base}/api/trust/impostor?demo_id=${demo_id}`, { method: 'POST' })).json();
  return { act, trust, impostor };
}

const cardOf = (reply) => reply.messages.find((m) => m.card)?.card;
const buttonOf = (card, action) => card.actions.find((a) => a.action === action);

test('dad moving mom\'s money waits for mom\'s device approval, then a 3-hour delay', { skip: !trustAvailable() }, async (t) => {
  const { act, trust } = await demo(t);
  const asked = cardOf(await act('dad', 'chat', '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘'));
  assert.equal(asked.kind, 'approval');
  assert.equal(asked.audience, 'mom');
  const approve = buttonOf(asked, 'trust_approve');
  assert.equal(approve.actor, 'mom');

  // Dad pressing mom's button gets nowhere: the decision needs mom's own device.
  const dadTry = await act('dad', 'trust_approve', approve.value);
  assert.match(dadTry.messages[0].text, /이미 처리|승인이 더 필요/);

  const scheduled = cardOf(await act('mom', 'trust_approve', approve.value));
  assert.match(scheduled.title, /실행 예약/);
  const done = cardOf(await act('son', 'trust_skip', buttonOf(scheduled, 'trust_skip').value));
  assert.match(done.title, /실행 완료/);

  const snap = await trust();
  assert.ok(snap.enabled);
  assert.ok(snap.events.some((e) => e.type === 'family_alert'));
  assert.ok(snap.events.some((e) => e.type === 'executed'));
  assert.equal(snap.audit.verified, true);
});

test('voice phishing is held, evidence sealed, impostor approval rejected, scam report locks down', { skip: !trustAvailable() }, async (t) => {
  const { act, trust, impostor } = await demo(t);
  const held = cardOf(await act('mom', 'chat', '검찰청이라는데 안전계좌로 300만원 옮기래. 가족한테는 말하지 말래'));
  assert.equal(held.kind, 'blocked');
  assert.match(held.title, /보이스피싱/);
  assert.ok(held.rows.some((r) => /안전계좌/.test(r.label)));

  const fake = await impostor();
  assert.equal(fake.ok, true);
  assert.equal(fake.status, 'held');

  const scam = buttonOf(held, 'trust_scam');
  assert.ok(scam.actors.includes('son') && !scam.actors.includes('mom'));
  const locked = await act('son', 'trust_scam', scam.value);
  assert.ok(locked.messages.some((m) => /긴급 잠금/.test(m.card?.title ?? '')));

  const snap = await trust();
  for (const type of ['family_alert', 'evidence', 'proof_failed', 'lockdown']) {
    assert.ok(snap.events.some((e) => e.type === type), `missing ${type}`);
  }
  assert.equal(snap.evidence.length, 1);

  // Two family devices unlock it again.
  await act('son', 'trust_unlock', 'unlock');
  const unlocked = await act('dad', 'trust_unlock', 'unlock');
  assert.match(unlocked.messages[0].text, /잠금을 풀고/);
});

test('subscription chat is not taken over by the trust gate', async (t) => {
  const { act } = await demo(t);
  const reply = await act('son', 'chat', '엄마 구독 좀 정리해줘');
  assert.notEqual(cardOf(reply)?.kind, 'blocked');
});
