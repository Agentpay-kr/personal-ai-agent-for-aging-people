# fa-trust: Family Agent 신뢰 코어

> 가족 에이전트(FA)가 **보이스피싱의 도구가 되지 않게** 막는 보안 엔진.
> LLM은 할 일을 *제안*만 하고, 실행 여부는 이 코드가 결정합니다.

**보이스피싱의 무기는 '고립'이다.** 사기꾼은 "가족에게 말하지 마세요"라고 합니다.
FA는 돈이 움직이는 모든 순간을 가족 단톡방에 드러내서, 고립을 구조적으로 깨뜨립니다.

## 무엇을 막나

| 상황 | fa-trust의 동작 |
|---|---|
| 엄마: "검찰이 안전계좌로 옮기래, 가족한테 말하지 말래" | 엄마 본인 요청이어도 **보류** → 가족 알림 → 증거 봉인 |
| 새 번호로 온 "엄마 나 폰 액정 깨졌어" | 자녀 사칭 신호 → 보류 |
| 사칭범이 엄마 이름으로 승인 버튼을 누름 | 등록된 폰의 **Schnorr ZK 증명** 실패 → 승인 무시 + 요청 **보류** + 가족 알림 + 증거 봉인, 가족 1명 확인 추가 필요. 같은 요청에 **두 번째 시도면 긴급 잠금** |
| 아빠가 엄마 돈을 자기 계좌로 옮기려 함 | **받는 사람·요청한 사람은 승인자로 안 셈** → 엄마 + 아들 승인 필요 + 가족 전체 공개 + 처음 보내는 계좌라 3시간 지연 |
| 대출·계좌 개설·상품권·코인·원격앱·신분증·OTP | **T3 하드 차단**: 누가 승인해도 실행 불가 |
| FA 서버 해킹 / 내부자 | 세션 키를 **2-of-3로 분할** → 서버 조각만으로는 못 엶 |
| 가족이 "사기야"라고 확인 | **긴급 잠금**: 모든 세션 소멸 + 가족 키 재발급, 해제는 가족 2명 |
| 작업 종료 / 30일 경과 | **crypto-shredding**: 키를 지워 데이터 소멸, 개인정보 없는 영수증만 남음 |
| 단톡방 나가기·내보내기 | **GKM 재키잉**: 나간 사람은 그 뒤 기록을 복호화할 수 없음 |

일상 데이터는 소멸시키지만 **범죄 시도의 증거는 봉인해서 남깁니다**. 전부 자동 삭제되면, 에이전트를 탈취한 범죄자가 소멸 기능으로 흔적을 지울 수 있기 때문입니다.

## 흐름

```
 LLM 에이전트 ──propose_action──▶ trust.request(폰, 요청)
                                   │ ① ZK 기기 증명   ② 정책 게이트 (T0~T3 + 사기 신호)
                                   ▼
   allow │ needs_approval (본인 / 2-of-3) │ hold (사기 의심) │ block (금지 작업)
                                   │ ③ 가족 폰 승인 (ZK 증명 + 열쇠 조각)
                                   ▼
   ④ 2-of-3 조각으로 세션 키 복원 → executor 실행 (일회용 작업 공간) → ⑤ 작업 데이터 소멸
```

| 등급 | 예시 | 처리 |
|---|---|---|
| T0 조회 | 구독 목록 보기 | 자동 |
| T1 소액·되돌릴 수 있음 | 쌀 10kg 주문 (5만 원 이하) | 본인 원탭 |
| T2 돈이 나가거나 되돌릴 수 없음 | 구독 해지, 송금 | 본인 + 가족 1명 (2-of-3), 새 계좌면 지연 |
| T3 금지 | 대출, 상품권, 원격앱, 신분증·OTP 전달 | 실행 불가 + 전원 알림 + 증거 봉인 |

## 모듈

| 파일 | 역할 | 기법 |
|---|---|---|
| `src/policy.ts` | 위험 등급 + 한국형 사기 신호 (기관사칭·안전계좌·비밀유지·자녀사칭·상품권·원격앱) | 결정론적 규칙. LLM 점수는 위험도를 **올리기만** 함 |
| `src/zk.ts` | 가족 폰 신원 | Schnorr ZK 지식증명 (secp256k1, Fiat–Shamir), 재사용 방지 |
| `src/shamir.ts` | 세션 키·증거 키 분할 | Shamir k-of-n, GF(2^521 − 1) |
| `src/gkm.ts` | 가족 계층 키 `Code(i, j, k)` | 부모 키 = f(자식 키), f = HKDF-SHA256 (단방향), epoch 재키잉 |
| `src/vault.ts` | TTL 자동 소멸 | 레코드마다 별도 AES-256-GCM 키, 키 삭제 = 소멸 |
| `src/audit.ts` | 감사 로그 | SHA-256 해시 체인 (위변조 탐지) |
| `src/evidence.ts` | 범죄 시도 증거 봉인 | AES-GCM + 2-of-3 분할 + SHA-256 커밋먼트 |
| `src/trust.ts` | UI와 에이전트가 쓰는 단일 객체 `FamilyTrust` | 위를 모두 조합 |
| `src/tool.ts` | Claude tool 정의 `propose_action` | — |
| `src/judge.ts` | AI 심판 계약, 권한 제한 병합, 오프라인 심판 | 라우터 메타데이터·원문·로그 기반 판정 |
| `src/judge-claude.ts` | Claude 심판 (서버 전용, 브라우저 번들에서 제외) | `claude-opus-5-5` structured output |

## 실행

```bash
npm install
npm test        # 47개 테스트
npm run demo    # 16단계 시나리오를 터미널에서 재생 (오프라인 AI 심판)
FA_JUDGE=claude npm run demo   # Claude가 심판 (ANTHROPIC_API_KEY 필요)
```

## 다른 노트북의 UI로 넘기기

- **파일 하나면 돼요**: `npm run build`로 만든 [`dist/fa-trust.js`](dist/fa-trust.js) (139 KB, 의존성 포함). AirDrop으로 보내서 UI 프로젝트에 넣고 `import { FamilyTrust } from './fa-trust.js'` 하면 끝이에요.
- **TypeScript 프로젝트라면** `src/` 폴더를 통째로 복사하고 `npm i @noble/curves @noble/hashes` 하면 타입까지 그대로 쓸 수 있어요.
- **브라우저 동작 확인**: `npm run serve` 후 http://localhost:8790/examples/browser.html 을 여세요. 버튼 3개(구독 해지 / 보이스피싱 / 사칭범 승인)로 실제 브라우저에서 돌아가는 걸 볼 수 있어요 ([예제 코드](examples/browser.html)).

## UI에 붙이기 (카톡 목업)

```ts
import { FamilyTrust } from './fa-trust/src';

const trust = new FamilyTrust({
  members: [
    { id: 'mom', name: '엄마', role: 'parent' },
    { id: 'dad', name: '아빠', role: 'parent' },
    { id: 'son', name: '아들', role: 'child' },
  ],
  executor: async (req, { sessionSecret }) => runInMomVM(req, sessionSecret), // 실제 작업 (또는 시뮬레이션)
});
const phones = { mom: trust.createDevice('mom'), dad: trust.createDevice('dad'), son: trust.createDevice('son') };

trust.on((e) => postToChat('FA', e.message));          // FA 말풍선. e.type으로 카드/배지 결정

// 엄마가 Pickle 스타일 입력 카드에 로그인 → 세션만 넘김
await trust.linkAccount('mom', 'netflix', sessionCookie);

// 아들: "엄마 넷플릭스 해지해줘"
const action = await trust.request(phones.son, {
  owner: 'mom', kind: 'cancel_subscription', service: 'netflix',
  summary: '엄마 넷플릭스 해지', text: chatText,
});
// 엄마 화면의 큰 [네] 버튼
await trust.approveWith(phones.mom, action.id);
// 아들 화면의 [사기예요] 버튼
// await trust.rejectWith(phones.son, action.id, { scam: true });
```

주요 이벤트 타입: `decision`, `approval`, `executed`, `shredded`, `family_alert`, `evidence`, `proof_failed`, `lockdown`, `unlocked`, `linked`, `expired`, `member_removed`

## LLM에 붙이기

```ts
import { PROPOSE_ACTION_TOOL, toActionRequest } from './fa-trust/src';

// tools: [PROPOSE_ACTION_TOOL] 로 모델에게 주고, tool_use가 오면:
const req = toActionRequest(toolUse.input, { text: rawChatText, context: recentSmsOrCallText });
const action = await trust.request(phones[speakerId], req);
```

원문 채팅과 문자·통화 내용은 **모델이 아니라 앱이** 넘깁니다. 모델이 증거를 빠뜨리거나 숨길 수 없게 하기 위해서입니다.

## AI 심판 (중간 LLM)

규칙 엔진이 1차로 판단한 뒤, **AI 심판**이 라우터 AI가 가진 정보를 읽고 통과·보류·차단을 정합니다.

| 심판이 보는 것 | 예 |
|---|---|
| 라우터 메타데이터 | 보낸 사람, 계정 주인, 라우터 intent와 확신도, 채널, 통화 중 여부 |
| 원문 | 채팅·문자·통화 녹취. 지시가 아니라 증거로만 취급 |
| 로그 | fa-trust 감사 로그(자동) + 라우터 로그 |
| 기기 증명 | ZK 검증 결과. 라우터가 보낸 값은 fa-trust가 덮어씀 |

**심판의 권한은 제한돼 있습니다.** 강압이나 프롬프트 인젝션으로 심판을 설득해도 돈이 나가지 않게 하려는 장치입니다.

- 심판은 언제든 위험도를 **올릴** 수 있습니다 (보류·차단).
- 규칙의 보류를 풀 수 있는 건 신호가 전부 낮은 위험도일 때뿐이고, 그래도 본인 + 가족 1명 승인과 새 계좌 지연은 그대로입니다.
- 금지 작업(T3), 긴급 잠금, 가족이 아닌 사람의 요청은 심판이 풀 수 없고, 사람의 승인을 건너뛰게 할 수도 없습니다.
- 심판이 오류·시간 초과·형식이 틀린 응답을 내면, 돈이나 계정이 바뀌는 요청은 **보류**(fail closed)하고 조회는 규칙대로 진행합니다.

```ts
import { FamilyTrust, heuristicJudge, withFallback } from './fa-trust/src';
import { createClaudeJudge } from './fa-trust/src/judge-claude'; // 서버에서만 (API 키 필요)

const trust = new FamilyTrust({
  members,
  judge: withFallback(createClaudeJudge(), heuristicJudge), // Claude가 실패하면 오프라인 심판이 이어받음
});

await trust.request(phones.mom, request, {
  metadata: { actor: 'mom', owner: 'mom', intent: 'transfer', confidence: 0.92, callActive: true },
  rawData: [chatText, smsText],
  log: routerLogLines,
});
// action.judge → { verdict, risk, reasons, signals, model, effect }
```

- **Claude 심판**: `claude-opus-5-5`, effort `low`, zod 스키마로 structured output을 받습니다. 서버 측 거절 대체(`fallbacks: "default"`)가 켜져 있고, 타임아웃 10초에 재시도는 하지 않습니다.
- **오프라인 심판** (`heuristicJudge`): 같은 입력으로 동작하는 규칙 기반 대체 심판입니다. API 키가 없을 때 기본값이고, Claude 호출이 실패하면 자동으로 이어받습니다.

## 솔직한 한계 (데모 vs 실서비스)

| 지금 (해커톤 데모) | 실서비스 |
|---|---|
| Shamir 분할: 쓰는 순간 키가 한곳에서 잠깐 재조립됨 | threshold 서명 (FROST / CGGMP 계열, 감사받은 라이브러리): 키가 끝까지 합쳐지지 않음 |
| GKM의 f를 한 프로세스에서 계산 | 원 논문처럼 f를 MPC로 계산 |
| `MemberDevice`는 메모리 안의 객체 | 폰의 보안 영역 + 패스키(WebAuthn)·생체 인증 |
| 사기 탐지는 정규식 + LLM 점수 | 통화·문자 맥락 분류 모델, 금융사 이상거래 탐지와 연동 |
| 모든 상태가 메모리에 있음 | KMS/HSM + 영속 저장소, 키 삭제 감사 |
| 송금은 시뮬레이션 | v1은 송금 실행 없이 **보류·확인·알림**만 (은행 접근매체를 에이전트가 들고 있으면 전자금융거래법 이슈 가능) |
| 잔고를 숨긴 채 규칙 준수만 증명하는 ZK 범위증명은 미구현 | 로드맵 |
| Claude 심판은 스텁 클라이언트로만 테스트함 (실제 API 호출 검증 전) | 실제 대화 로그로 오탐·미탐 평가셋을 만들어 심판 프롬프트 검증 |

## 참고

- 한정수, 김정헌, 허강욱, 전윤서, 우종수, 홍원기, 「블록체인 기반 CBDC 아키텍처 및 트랜잭션 키 관리 시스템 설계」, KNOM Conf. 2021. 계층형 그룹 키와 MPC 구조를 이 논문에서 가져왔습니다.
- 개인정보보호법 제21조 (보유기간이 끝나거나 목적을 달성하면 지체 없이 파기)
- 금융위원회: 여신거래 안심차단 (2024년 8월), 비대면 계좌개설 안심차단 (2025년 3월)
