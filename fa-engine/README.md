# FA 엔진: Family AI Agent 두뇌 + 가족 권한 엔진

카카오톡 단톡방에 초대하는 가족 AI 비서 **FA**의 백엔드예요.
자녀가 원격으로 부모님 일을 맡기면 FA가 **계정 주인의 VM**에서 실행해요.
무엇이 실행될 수 있는지는 LLM이 아니라 **권한 엔진**이 정해요.

> c0mpiled-17 Seoul · YC RFS "AI for the Aging Population" · 오늘 만든 코드예요.

## 핵심 아이디어

| 원칙 | 구현 |
|---|---|
| 도와주되 비밀번호는 공유하지 않는다 | 계정 연결 카드는 **계정 주인 화면에서만** 입력창이 열려요. 다른 가족이 대신 입력하면 403이에요. 비밀번호는 VM 금고에만 저장되고, 어떤 이벤트에도 실리지 않아요 |
| 누구의 VM에서, 어떤 권한으로 | 모든 행동은 `owner`의 VM에서 실행돼요. `requester`는 실제 메시지를 보낸 사람으로 고정돼서 LLM이 바꿀 수 없어요 |
| 위험도별 승인 | 조회는 자동, 되돌릴 수 있는 행동은 주인이 한 번 탭, 돈이 나가는 행동은 **주인 + 가족 1명 승인**(가족 멀티시그) |
| 이해충돌 차단 | 돈을 받는 사람과 요청한 사람은 승인자로 셀 수 없어요. 아빠가 "엄마 계좌에서 내 계좌로 50만원"이라고 하면 엄마와 승빈의 승인이 필요해요 |

### 권한 표 (`src/policy.js`)

| 단계 | 예시 | 본인 요청 | 가족 요청 |
|---|---|---|---|
| read | 구독 조회 | 자동 | `read` 위임이 있으면 자동 |
| setup | 계정 연결 | 본인이 입력 | `setup` 위임이 있으면 시작할 수 있고, 입력은 주인만 |
| act | 구독 해지, 5만원 이하 주문 | 자동 | `act` 위임 + 주인 승인 |
| money | 송금, 5만원 초과 주문 | 주인 + 가족 1명 | 주인 + 가족 1명 (요청자·수혜자 제외). 가족 외 계좌는 차단 |

위임 설정(`src/family.js`): 엄마는 승빈에게 read·setup·act를, 아빠에게 read만 맡겼어요. money는 누구에게도 위임할 수 없어요.

## 실행

```bash
npm install
npm test                 # 권한 엔진 테스트 12개
npm run demo             # 전체 시나리오를 터미널에서 재생
node demo/http-smoke.js  # HTTP + SSE 검증 15개
npm start                # API 서버: http://localhost:8787
```

- **LLM 모드**: `ANTHROPIC_API_KEY`를 설정하면 Claude(`claude-opus-5-5`, effort `low`)가 도구를 골라 답해요. 서버 측 refusal fallback(`fallbacks: "default"`)이 켜져 있어요.
- **데모 모드**: 키가 없거나 API 호출이 실패하면 대본 기반 의도 인식으로 같은 흐름을 재생해요. `FA_MODE=scripted`로 강제할 수 있어요.
- 환경 변수: `PORT`(8787), `FA_MODEL`, `FA_EFFORT`, `FA_VM_STEP_MS`(VM 로그 간격, 기본 450ms), `FA_MEMORY=off`

## UI 연동 API

모든 요청과 응답은 JSON이에요. CORS가 열려 있어요. 멤버 id는 `son`(승빈), `mom`(엄마), `dad`(아빠), `fa`(FA)예요.

| 메서드 | 경로 | body / query | 설명 |
|---|---|---|---|
| GET | `/api/stream?viewer=mom` | | **SSE**. 그 사람이 속한 방의 이벤트를 실시간으로 받아요 (그 사람 시점으로 가공됨) |
| GET | `/api/family` | | 멤버, 위임, 연결된 계정, 모드 |
| GET | `/api/rooms?viewer=son` | | 내 방 목록 |
| POST | `/api/rooms` | `{name, createdBy, members:[...]}` | 단톡방 만들기 (FA를 넣으면 인사말) |
| GET | `/api/rooms/:id/messages?viewer=mom` | | 지난 이벤트 (그 사람 시점) |
| POST | `/api/rooms/:id/messages` | `{from, text}` | 메시지 보내기. FA 답장은 SSE로 와요 |
| POST | `/api/rooms/:id/invite` | `{by, members:[...]}` | 초대 |
| POST | `/api/rooms/:id/leave` | `{userId}` | 나가기 |
| POST | `/api/rooms/:id/rename` | `{by, name}` | 방 이름 변경 |
| POST | `/api/requests/:id/input` | `{userId, values:{id, password}}` | 연결 카드 제출 (주인만) |
| POST | `/api/requests/:id/vote` | `{userId, vote:'approve'\|'reject'}` | 승인 카드 버튼 |
| POST | `/api/actions` | `{roomId, requester, action, input}` | 카드에서 바로 실행 (예: 구독 카드에서 고른 항목 해지) |
| GET | `/api/vm/:owner` | | VM 패널용 상태 (구독, 주문, 로그, 연결) |
| POST | `/api/reset` | | 데모 상태 초기화 |

### 이벤트 종류 (SSE `data:`)

**같은 `id`로 다시 오면 기존 것을 교체하세요.** 카드 상태가 바뀌면 같은 id로 다시 보내요.

| type | 주요 필드 | UI |
|---|---|---|
| `text` | `from, text` | 말풍선 |
| `system` | `text` | 가운데 회색 안내 |
| `typing` | `from:'fa', on` | FA 입력 중 표시 (저장되지 않음) |
| `vm.log` | `owner, text` | 오른쪽 VM 패널 로그 |
| `card.input_request` | `owner, serviceLabel, title, body, fields, status, canAct, hint` | `canAct`이면 입력 폼(Pickle 스타일), 아니면 `hint` 표시. status: pending → connecting → done |
| `card.approval_request` | `title, lines, highlight, approveLabel, rejectLabel, tier, approvals, votes, status, canAct, myRole` | `canAct`이면 큰 버튼 [네]/[아니요]. `tier==='money'`면 🔒 강조 |
| `card.subscriptions` | `owner, items[{id,name,monthly,usage,recommend}], totalMonthly, canAct` | 체크박스 목록 → `/api/actions`로 `cancel_subscription` |
| `card.result` | `ok, title, lines, highlight` | 완료 카드 |
| `card.blocked` | `reason` | 🔒 차단 카드 |

### 카드에서 해지 실행 예시

```js
await fetch('http://localhost:8787/api/actions', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    roomId, requester: 'son', action: 'cancel_subscription',
    input: { owner: 'mom', subscription_ids: ['watcha', 'fortune'] },
  }),
});
```

## 데모 시나리오 (90초 영상용)

1. 승빈이 '우리 가족' 방을 만들고 엄마, 아빠, FA를 초대해요.
2. 승빈: "엄마 구독 정리해줘" → 엄마 화면에만 이메일 연결 카드가 떠요. 승빈 화면에는 "엄마 화면에서만 입력할 수 있어요"가 보여요.
3. 엄마가 직접 입력하면 VM 패널 로그가 흐르고, 구독 4건(월 40,090원) 카드가 떠요.
4. 승빈이 왓챠와 운세를 선택하면 엄마 화면에 큰 [네, 해지해 주세요] 버튼이 떠요.
5. 엄마가 탭하면 해지가 끝나고 "매달 17,300원 절약"이 표시돼요.
6. 아빠: "엄마의 계좌에서 50만원만 내 계좌로 옮겨줘" → 🔒 엄마 + 승빈 승인 필요. 아빠는 승인할 수 없어요.

## Molla 호환 API

이 저장소의 [Molla CLI와 라우터 스킬](../molla-cli/README.md)이 이 엔진을 "Molla 앱 서버"로 그대로 쓸 수 있어요.
`npm start`를 실행하면 FA API(:8787)와 함께 **:4328(Molla CLI 기본 포트)**에서도 같은 엔진이 열려요.

```bash
npm start
node ../molla-cli/bin/molla.mjs demo login --actor mom --session .local/mom.json
node ../molla-cli/bin/molla.mjs task list --session .local/mom.json
```

- **구현한 연산**: Molla CLI allowlist 전부(health, identity, family invite/join, task create/list/get/decide, memory 7종, contact 3종, ontology, vm diagnose/compose plan, consent).
- **세션**: `/api/health`가 `molla_session` 쿠키를 발급하고, `/api/demo/switch`로 데모 사용자를 고르면 돼요. 운영 인증은 아니에요.
- **권한**: Molla 작업도 같은 `policy.js`를 거쳐요. 동의를 철회하면 다른 가족의 요청은 403이에요. 송금 작업은 2-of-3 가족 승인이 필요해요.
- **한 엔진, 두 화면**: 카톡 채팅에서 생긴 승인 요청이 Molla 작업(`source: "chat"`)으로도 보여요. CLI로 승인하면 채팅에서 실행돼요.
- **결과 표시**: Molla 규약대로, 승인된 작업은 `prepared` + `evidence.kind: "local_draft"`(구매·전송·이체 아님)로 끝나요.
- **action 공개 범위**: 작업의 정확한 `action`(주소, 금액, 받는 사람)은 결정하는 사람(계정 주인, 공동 승인자)에게만 보여요.

검증:

```bash
# molla-cli 테스트 13개(실제 API 통합 테스트 포함)를 이 엔진에 실행
cd ../molla-cli
FA_ENGINE_DIR=$PWD/../fa-engine MOLLA_TEST_APP_DIR=$PWD/../fa-engine/molla-shim node --test tests/*.test.mjs
```

```bash
# 채팅 요청 → Molla CLI 승인 → 채팅에서 실행, CLI 작업 생성, 동의 철회
node demo/molla-bridge.js
```

## 가족 메모리 (GBrain)

FA는 연결, 해지, 주문, 승인 기록을 `family-memory/*.md`에 마크다운으로 남겨요.
`gbrain import family-memory`로 가족 전체가 하나의 메모리를 공유할 수 있어요.

## 파일

```
src/policy.js   가족 권한 엔진 (순수 함수)
src/engine.js   게이트웨이: 정책 → VM 실행, 승인·입력 대기열, 방 관리, 시점별 뷰
src/agent.js    Claude 도구 사용 루프 + 데모 모드
src/vm.js       계정 주인별 모의 VM (예시 데이터)
src/vault.js    계정 주인별 자격 증명 금고 (값은 밖으로 나오지 않음)
src/memory.js   GBrain용 가족 메모리
src/molla.js    Molla 호환 도메인: 세션, 작업, 기억, 연락처, 동의, 온톨로지
src/server.js   HTTP + SSE (FA 라우트 + Molla 라우트)
client/         UI용 브라우저 클라이언트(fa-client.js)와 React 훅(useFaRoom.js)
molla-shim/     Molla 통합 테스트용 서버 진입점
```

구독, 금액, 주소는 모두 예시 데이터예요.
