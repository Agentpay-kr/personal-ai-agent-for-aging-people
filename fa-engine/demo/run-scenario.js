// Runs the full demo scenario in-process and prints what each phone sees.
//   node demo/run-scenario.js
// Uses scripted mode unless an API key is set (FA_MODE=scripted forces it).

process.env.FA_VM_STEP_MS ??= '0';
process.env.FA_MEMORY ??= 'off';

const engine = await import('../src/engine.js');
const store = await import('../src/store.js');

const NAMES = { son: '승빈', mom: '엄마', dad: '아빠', fa: 'FA' };
const lines = [];
store.bus.on('event', (e) => {
  if (e.type === 'typing') return;
  if (e.type === 'text') lines.push(`  💬 ${NAMES[e.from]}: ${e.text.replace(/\n/g, ' / ')}`);
  else if (e.type === 'system') lines.push(`  ·  ${e.text}`);
  else if (e.type === 'vm.log') lines.push(`  🖥  ${e.text}`);
  else if (e.type === 'card.subscriptions') lines.push(`  🗂  [구독 카드] ${e.items.map((s) => `${s.name}(${s.monthly})`).join(', ')}`);
  else if (e.type === 'card.input_request') lines.push(`  🔑 [연결 카드:${e.status}] ${e.title}`);
  else if (e.type === 'card.approval_request') lines.push(`  ✅ [승인 카드:${e.status}] ${e.title} · votes=${JSON.stringify(e.votes)}`);
  else if (e.type === 'card.result') lines.push(`  📦 [결과] ${e.title}: ${e.lines.join(' / ')} ${e.highlight ?? ''}`);
  else if (e.type === 'card.blocked') lines.push(`  🔒 [차단] ${e.reason}`);
});

const flush = (title) => {
  console.log(`\n▶ ${title}`);
  console.log(lines.splice(0).join('\n'));
};
const settle = async (roomId) => {
  await new Promise((r) => setTimeout(r, 0));
  await store.getRoom(roomId).faQueue;
};
const say = async (roomId, from, text) => {
  engine.postMessage({ roomId, from, text });
  await settle(roomId);
};
const lastCard = (roomId, type) => [...store.getRoom(roomId).events].reverse().find((e) => e.type === type);

console.log(`mode: ${engine.familyInfo().mode}`);

// 1. Son creates the family chat and invites mom, dad, FA.
const room = engine.createRoom({ name: '우리 가족', createdBy: 'son', members: ['mom', 'dad', 'fa'] });
flush('승빈이 단톡방을 만들고 엄마·아빠·FA를 초대');

// 2. Son asks FA to clean up mom's subscriptions -> mom's email isn't connected yet.
await say(room.id, 'son', '엄마 구독 정리해줘');
flush("승빈: '엄마 구독 정리해줘' → 엄마 이메일 연결이 먼저 필요");

const inputCard = lastCard(room.id, 'card.input_request');
console.log('  son view canAct:', engine.viewFor(inputCard, 'son').canAct, '| mom view canAct:', engine.viewFor(inputCard, 'mom').canAct);
try {
  await engine.submitInput({ requestId: inputCard.id, userId: 'son', values: { id: 'mom@example.com', password: 'x' } });
} catch (err) {
  console.log(`  ✋ 승빈이 대신 입력 시도 → ${err.status} ${err.message}`);
}

// 3. Mom fills in her own credentials; the scan resumes automatically.
await engine.submitInput({ requestId: inputCard.id, userId: 'mom', values: { id: 'mom@example.com', password: 'secret-demo' } });
await settle(room.id);
flush('엄마가 본인 화면에서 이메일 연결 → 구독 스캔이 이어서 실행');

// 4. Son picks the two unused subscriptions from the card.
const subsCard = lastCard(room.id, 'card.subscriptions');
const pick = subsCard.items.filter((s) => s.recommend === 'cancel').map((s) => s.id);
const res = await engine.requestAction({ roomId: room.id, requester: 'son', action: 'cancel_subscription', input: { owner: 'mom', subscription_ids: pick } });
// The /api/actions route posts FA's reply into the room; mimic that here.
store.emit(room.id, { type: 'text', from: 'fa', text: res.say });
flush(`승빈이 카드에서 ${pick.join(', ')} 선택 → 엄마 승인 요청`);

// 5. Mom taps the big "네" button.
const approval = lastCard(room.id, 'card.approval_request');
await engine.vote({ requestId: approval.id, userId: 'mom', vote: 'approve' });
flush("엄마가 '네, 해지해 주세요' 탭 → 해지 실행");

// 6. Dad tries to move 500k from mom's account to himself.
await say(room.id, 'dad', '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘');
flush("아빠: '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘' → 가족 멀티시그");
const transfer = lastCard(room.id, 'card.approval_request');
try {
  await engine.vote({ requestId: transfer.id, userId: 'dad', vote: 'approve' });
} catch (err) {
  console.log(`  ✋ 아빠가 스스로 승인 시도 → ${err.status} ${err.message}`);
}
await engine.vote({ requestId: transfer.id, userId: 'mom', vote: 'approve' });
flush('엄마 승인 (아직 1명 더 필요)');
await engine.vote({ requestId: transfer.id, userId: 'son', vote: 'approve' });
flush('승빈 승인 → 2-of-3 충족, 이체 실행');

// 7. Mom orders rice for herself (no approval needed for her own small order).
await say(room.id, 'mom', '쌀이 떨어져서 10kg 주문해줘');
flush("엄마: '쌀이 떨어져서 10kg 주문해줘' → 쿠팡 연결 요청");
const coupang = lastCard(room.id, 'card.input_request');
await engine.submitInput({ requestId: coupang.id, userId: 'mom', values: { id: 'mom1960', password: 'secret-demo' } });
await settle(room.id);
flush('엄마 쿠팡 연결 → 주문 실행');

// 8. Room management.
engine.rename({ roomId: room.id, by: 'son', name: '우리 가족 💛' });
engine.leave({ roomId: room.id, userId: 'dad' });
engine.invite({ roomId: room.id, by: 'son', members: ['dad'] });
flush('방 이름 변경 · 아빠 나가기 · 다시 초대');

console.log('\nrooms for mom:', engine.listRooms('mom').map((r) => `${r.name} (${r.members.join(',')})`));
