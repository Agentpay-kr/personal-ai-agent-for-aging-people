/**
 * FA trust core: the 90-second story, in the terminal.   Run: npm run demo
 * Every check below is real crypto (Shamir 2-of-3, Schnorr ZK, HKDF group keys, AES-GCM shredding).
 */
import { DAY_MS, decryptText, FamilyTrust, heuristicJudge, MemberDevice, withFallback } from '../src/index';
import { createClaudeJudge } from '../src/judge-claude';

const paint = (code: number) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;
const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);
const cyan = paint(36);

const clock = { t: Date.parse('2026-11-09T12:00:00+09:00') };

// FA_JUDGE=claude → Claude judges every request (offline judge takes over if a call fails).
const useClaude = process.env.FA_JUDGE === 'claude';
const judge = useClaude
  ? withFallback(createClaudeJudge(), heuristicJudge, (e) =>
      console.log(`  ${dim(`(Claude 심판 호출 실패 → 오프라인 심판으로 대체: ${(e as Error).message})`)}`),
    )
  : heuristicJudge;

const trust = new FamilyTrust({
  judge,
  familyId: 'our-family',
  members: [
    { id: 'mom', name: '엄마', role: 'parent' },
    { id: 'dad', name: '아빠', role: 'parent' },
    { id: 'son', name: '아들', role: 'child' },
  ],
  now: () => clock.t,
  policy: { registeredPayees: { mom: ['우리은행 1002 (아들)'] } },
  executor: (req, { sessionSecret }) =>
    `${req.summary ?? req.kind} 완료${sessionSecret ? ` (엄마 VM에서 ${req.service} 세션으로 처리)` : ''}`,
});

trust.on((e) => console.log(`  ${cyan('FA')}   ${e.message.split('\n').join('\n       ')}`));

let n = 0;
const step = (title: string) => console.log(`\n${bold(yellow(`━━ ${++n}. ${title}`))}`);
const say = (who: string, text: string) => console.log(`  ${bold(who)}  ${text}`);
const note = (text: string) => console.log(`  ${dim(text)}`);

console.log(
  dim(
    useClaude
      ? '\nAI 심판: Claude (claude-opus-5-5, effort low, 거절 시 서버 측 대체 모델) + 실패 시 오프라인 심판'
      : '\nAI 심판: 오프라인 심판 (FA_JUDGE=claude 로 실행하면 Claude가 판정해요)',
  ),
);

step('가족 단톡방 + 기기 등록 (ZK 신원)');
const mom = trust.createDevice('mom');
const dad = trust.createDevice('dad');
const son = trust.createDevice('son');
note('각 폰은 비밀값 x를 갖고, 가족 그룹에는 공개값 X = x·G만 등록돼요.');
note(`계층 키 코드 (i, j, k): ${trust.keys.describe().map((m) => `${m.id}${m.code}`).join('  ')} · epoch ${trust.keys.epoch}`);
await trust.remember('엄마는 한 달에 한 번 쌀 10kg을 주문해요', 'son');
note('가족 공용 기억 1건 저장 (가족 키로 암호화)');

step('엄마 서비스 연결 (Pickle 스타일 입력 카드)');
say('아들', '엄마 넷플릭스랑 쿠팡 연결해줘');
note('→ 엄마 폰에만 로그인 카드가 뜨고 엄마가 직접 입력해요. FA에는 세션만 넘어와요.');
await trust.linkAccount('mom', 'netflix', 'netflix-session-cookie');
await trust.linkAccount('mom', 'coupang', 'coupang-session-cookie');
for (const line of await trust.proveSingleShareFails('mom', 'netflix')) note(line);

step('구독 정리: 아들 요청 + 엄마 승인 = 2-of-3');
say('아들', '엄마 넷플릭스 안 보시니까 해지해줘');
const cancel = await trust.request(son, {
  owner: 'mom',
  kind: 'cancel_subscription',
  service: 'netflix',
  summary: '엄마 넷플릭스 해지',
  text: '엄마 넷플릭스 안 보시니까 해지해줘',
});
say('엄마', '[ 네, 해지할게요 ] 👆');
await trust.approveWith(mom, cancel.id);

step('아빠: "엄마 계좌에서 50만원 내 계좌로"');
say('아빠', '엄마 계좌에서 50만원만 내 계좌로 옮겨줘');
const dadReq = await trust.request(dad, {
  owner: 'mom',
  kind: 'transfer',
  amountKRW: 500_000,
  payee: '국민은행 (아빠)',
  payeeOwner: 'dad',
  summary: '엄마 계좌 → 아빠 계좌 50만원',
  text: '엄마 계좌에서 50만원만 내 계좌로 옮겨줘',
});
note(`상태: ${dadReq.status} · 엄마가 승인하기 전엔 절대 실행되지 않아요.`);

step('보이스피싱(사기): 엄마가 직접 송금을 요청 → 차단 + 가족 확인');
const scamText = '검찰에서 전화 왔는데 내 계좌가 범죄에 연루됐대. 안전계좌로 300만원 옮기래. 가족한테 말하지 말래. 빨리 보내줘';
say('엄마', scamText);
const scam = await trust.request(mom, {
  owner: 'mom',
  kind: 'transfer',
  amountKRW: 3_000_000,
  payee: '농협 352-0000-0000',
  summary: '300만원 송금',
  text: scamText,
});
say('아들', '엄마 그거 100% 사기야! 전화 끊어!');
await trust.rejectWith(son, scam.id, { scam: true });

step('잠금 중에는 아무것도 실행되지 않음');
say('엄마', '쌀 10kg 주문해줘');
await trust.request(mom, { owner: 'mom', kind: 'order', service: 'coupang', amountKRW: 32_000, summary: '쿠팡 쌀 10kg 주문' });

step('봉인된 증거 열람 (가족 2-of-3)');
try {
  await trust.openEvidence(scam.evidenceId!, [son]);
} catch (e) {
  note(`아들 혼자 → ❌ ${(e as Error).message}`);
}
const ev = (await trust.openEvidence(scam.evidenceId!, [son, dad])) as { signals: Array<{ label: string }> };
note(`아들 + 아빠 → ✅ 열림 · 기록된 신호: ${ev.signals.map((s) => s.label).join(', ')}`);

step('잠금 해제 (서로 다른 가족 2명)');
await trust.unlockWith([son]);
await trust.unlockWith([mom, son]);

step('금지 작업은 누가 승인해도 차단');
say('엄마', '편의점 가서 구글 기프트카드 50만원어치 사야 한대');
await trust.request(mom, {
  owner: 'mom',
  kind: 'buy_gift_card',
  amountKRW: 500_000,
  summary: '구글 기프트카드 50만원 구매',
  text: '편의점 가서 구글 기프트카드 50만원어치 사야 한대',
});

step('자동 소멸: 30일이 지나면 연결 세션이 스스로 사라짐');
await trust.linkAccount('mom', 'coupang', 'coupang-session-cookie-2', { ttlDays: 30 });
clock.t += 31 * DAY_MS;
note('… 31일 후');
await trust.tick();

step('AI 심판 ①: 통화 중에 들어온 송금 → 규칙은 승인 대기, 심판은 보류');
say('엄마', '아들 학원비 30만원 보내야 해');
note('라우터 메타데이터: 엄마가 지금 통화 중 (callActive: true)');
await trust.request(
  mom,
  { owner: 'mom', kind: 'transfer', amountKRW: 300_000, payee: '신한 110-000-0000', summary: '30만원 송금', text: '아들 학원비 30만원 보내야 해' },
  { metadata: { actor: 'mom', owner: 'mom', intent: 'transfer', channel: 'kakao', callActive: true } },
);

step('AI 심판 ②: 규칙의 오탐을 풀어줌 (승인 절차는 그대로)');
say('엄마', '오늘 안에 관리비 120만원 내야 해');
const bill = await trust.request(
  mom,
  { owner: 'mom', kind: 'transfer', amountKRW: 1_200_000, payee: '○○아파트 관리사무소', summary: '관리비 120만원', text: '오늘 안에 관리비 120만원 내야 해' },
  { metadata: { actor: 'mom', owner: 'mom', intent: 'transfer', confidence: 0.95 } },
);

console.log(`\n${bold(red('━━ 여기부터는 사기가 아니라 시스템 침해 (탈취·해킹·오염) → FA 자동 소멸'))}`);

step('외부 침해 ① 탈취: 새 번호 폰이 "엄마" 이름으로 승인');
await trust.linkAccount('mom', 'coupang', 'coupang-session-cookie-3');
note(`지금: 연결 서비스 ${trust.linkedAccounts().length}개 · 가족 기억 ${(await trust.recall()).length}건 · 관리비 요청 ${bill.status}`);
await trust.approveWith(new MemberDevice('mom'), bill.id);
note(`소멸 후: 연결 서비스 ${trust.linkedAccounts().length}개 · 가족 기억 ${(await trust.recall()).length}건 · 관리비 요청 ${bill.status}`);
const sealed = (await trust.openEvidence(bill.evidenceId!, [son, dad])) as { intrusions: Array<{ id: string; kind: string }> };
note(`봉인된 증거는 남음 (아들 + 아빠로 열람): ${sealed.intrusions.map((i) => `${i.kind}/${i.id}`).join(', ')}`);
await trust.unlockWith([mom, son]);

step('외부 침해 ② 오염: 라우터는 "조회"로 분류했는데 송금이 올라옴');
note('원문: "엄마 구독 목록 좀 보여줘" · 라우터 intent: scan');
await trust.request(
  son,
  { owner: 'mom', kind: 'transfer', amountKRW: 900_000, payee: '하나 000-0000', summary: '90만원 송금' },
  { metadata: { actor: 'son', owner: 'mom', intent: 'scan', confidence: 0.9 }, rawData: ['엄마 구독 목록 좀 보여줘'] },
);
await trust.unlockWith([mom, son]);

step('아빠가 단톡방을 나감 → 가족 키 재발급');
const oldFamilyKey = trust.keys.familyKey();
await trust.removeMember('dad');
await trust.remember('아빠가 나간 뒤에 저장한 기억', 'son');
note(`남은 가족은 그대로 읽어요: ${(await trust.recall()).join(' / ')}`);
try {
  await decryptText(oldFamilyKey, trust.memoryCiphertexts().at(-1)!);
  note(red('예전 키로 읽힘 (이러면 안 됨!)'));
} catch {
  note('나간 사람이 가진 예전 가족 키 → ❌ 새 기록 복호화 실패');
}

step('외부 침해 ③ 해킹: 감사 기록(해시 체인)을 몰래 고치면');
note(`기록 ${trust.audit.entries().length}건 · 무결성: ${trust.audit.verify().ok ? green('✅ 통과') : red('❌ 실패')}`);
(trust.audit.entries()[3] as { summary: string }).summary = '조작된 기록';
note('누군가 3번 기록을 몰래 고침 → 다음 정기 점검(tick)에서 발견');
await trust.tick();
console.log('');
