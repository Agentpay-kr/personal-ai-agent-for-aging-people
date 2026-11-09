// Routing scenes from the team diagram: each request runs in the right person's VM, by rule.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { createRouter } from '../router.mjs';

function room(members = ['son', 'mom', 'dad', 'fa']) {
  const router = createRouter({ trust: false });
  const demo_id = randomUUID();
  const room_id = randomUUID();
  let step_id;
  return async (actor, action, value) => {
    const result = await router.handle({ demo_id, room_id, members, actor, action, value, step_id });
    step_id = result.state.step_id;
    const message = result.messages[0];
    return { text: message?.text, card: message?.card, state: result.state };
  };
}

const rowOf = (card, label) => card.rows.find((r) => r.label === label)?.detail;

test('son starts mom\'s Coupang login: it runs in mom\'s VM and only mom can log in', async () => {
  const act = room();
  const asked = await act('son', 'chat', '엄마가 쓸 쿠팡 아이디 로그인 해줘');
  assert.equal(asked.card.kind, 'login');
  assert.equal(asked.card.audience, 'mom');
  assert.equal(rowOf(asked.card, '라우팅'), '아들 → FA → 엄마의 VM');
  assert.match(await act('son', 'login', 'son-demo').then((r) => r.text), /엄마가 직접 해야 해요/);
  const done = await act('mom', 'login', 'mom-demo');
  assert.equal(done.card.title, '엄마 쿠팡 연결 완료');
  assert.equal(rowOf(done.card, '연결된 VM'), '엄마의 VM');
});

test('"엄마의 이메일 연동을 시작해줘" goes to mom\'s VM; "내 이메일 계정을 연동해줘" goes to son\'s VM', async () => {
  const act = room();
  const mom = await act('son', 'chat', '엄마의 이메일 연동을 시작해줘');
  assert.equal(mom.card.audience, 'mom');
  assert.match(rowOf(mom.card, '라우팅'), /엄마의 VM$/);
  const own = await act('son', 'chat', '내 이메일 계정을 연동해줘');
  assert.equal(own.card.audience, 'son');
  assert.equal(rowOf(own.card, '라우팅'), '아들 → FA → 아들의 VM');
  const done = await act('son', 'login', 'son-demo');
  assert.equal(done.card.title, '아들 이메일 연결 완료');
});

test('mom: "쌀이 떨어져서 10kg 주문해줘" asks her Coupang login first, then orders in mom\'s VM', async () => {
  const act = room();
  const first = await act('mom', 'chat', '쌀이 떨어져서 10kg 주문해줘');
  assert.equal(first.card.kind, 'login');
  assert.equal(first.card.audience, 'mom');
  const ordered = await act('mom', 'login', 'mom-demo');
  assert.equal(ordered.card.title, '쌀 10kg 주문 준비 완료');
  assert.equal(rowOf(ordered.card, '실행 VM'), '엄마의 VM');
  assert.equal(rowOf(ordered.card, '배송지'), '엄마 집 (등록된 주소)');
  assert.equal(rowOf(ordered.card, '금액'), '32,900원');

  const again = await act('mom', 'chat', '쌀 10kg 주문해줘');
  assert.equal(again.card.title, '쌀 10kg 주문 준비 완료'); // already connected: straight through
});

test('son ordering on mom\'s account needs mom to confirm; dad (read-only) is blocked', async () => {
  const act = room();
  await act('son', 'chat', '엄마 쿠팡 로그인 연동해줘');
  await act('mom', 'login', 'mom-demo');
  const asked = await act('son', 'chat', '엄마 쌀 10kg 주문해줘');
  assert.equal(asked.card.kind, 'approval');
  assert.equal(asked.card.audience, 'mom');
  const id = asked.card.actions[0].value;
  assert.match((await act('son', 'route_approve', id)).text, /엄마가 직접 해야 해요/);
  const done = await act('mom', 'route_approve', id);
  assert.equal(done.card.title, '쌀 10kg 주문 준비 완료');

  const dad = await act('dad', 'chat', '엄마 쌀 주문해줘');
  assert.equal(dad.card.kind, 'blocked');
  assert.match(dad.text, /권한을 맡기지 않았어요/);
});

test('a routing scene does not break the subscription flow that follows', async () => {
  const act = room();
  await act('son', 'chat', '엄마 쿠팡 로그인 연동해줘');
  const sub = await act('son', 'chat', '엄마 구독 좀 정리해줘');
  assert.equal(sub.card.kind, 'login'); // subscription account login for mom, as before
  assert.notEqual(sub.state.phase, 'routing');
});
