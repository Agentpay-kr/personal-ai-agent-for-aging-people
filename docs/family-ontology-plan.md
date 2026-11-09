# 가족 온톨로지: 이벤트 로그와 가족 지식 그래프 (FA 엔진 1단계)

작성: 2026-11-09 · 대상: `fa-engine/` · 방식: gstack (계획 리뷰 → 실패 테스트 → 구현 → /review)

## 문제

FA 엔진에서 일어난 일이 두 군데에 흩어져 있고, 둘 다 기계가 읽을 수 없다.

- `store.emit()`은 화면 카드용 이벤트다. `card.result`, `vm.log`처럼 UI 모양이고, 같은 id는 덮어쓴다. "엄마가 왓챠를 해지했다"는 사실은 카드 문구 안에만 있다.
- `memory.remember(name, line)`은 Markdown에 한 줄 덧붙이는 것이다. 누가 볼 수 있는지, 어느 요청에서 나왔는지, 지금도 유효한지 알 수 없다.

그래서 Agent LLM은 가족 기억을 쓰지 못하고, 아들이 "엄마 지난달에 뭐 해지했지?"라고 물으면 답할 데이터가 없다. 감사 로그(`logDecision`)도 위변조를 확인할 수 없다.

## 목표 (이번 PR)

1. **온톨로지 어휘 + 도메인 이벤트 로그** `src/ontology.js` (D1: 한 파일): 클래스, 관계(predicate), 이벤트 타입을 정의하고 모양을 검사한다. append-only 로그, 해시 체인은 `prevHash + 봉투(envelope) + payloadHash`의 sha256(D3). 모양이 틀린 이벤트는 기록하지 않고 예외. `verifyChain()`으로 변조를 찾는다. `redact(eventId)`는 본문만 지우고 체인은 유지한다.
2. **가족 지식 그래프** `src/knowledge.js`: 로그를 구독하는 프로젝터. 이벤트에서 사실(주어 · 관계 · 목적어)을 만들고, 출처 이벤트 · 주인 · 공개 범위 · 버전 · 상태를 붙인다. 질의는 항상 보는 사람 기준으로 거른다. 프로젝터 오류는 잡아서 세고 행동 결과는 막지 않는다(D4).
3. **연결**: `engine.js` · `molla.js`의 `remember()` / `logDecision()` 호출을 `ontology.record()`로 바꾼다. Molla 기억 추가 · 수정 · 삭제 · 공유 · 공유 철회 다섯 가지를 모두 이벤트로 남긴다(D2). Markdown(`family-memory/*.md`)은 지식 그래프 프로젝터가 쓰는 GBrain 내보내기 사본이 된다.
4. **읽기 경로**: `GET /api/knowledge?owner=` (세션 신원 기준), Agent LLM 컨텍스트에 "요청자가 볼 수 있는 사실" 최근 20개를 인용 데이터로 넣는다(D5).

화면 카드(`store.emit`)는 이번 PR에서 바꾸지 않는다. 도메인 이벤트를 같은 지점에서 함께 기록한다(strangler 1단계). 방 뷰 프로젝터로 카드를 만드는 것은 2단계다.

## 설계

```
engine.js / molla.js
   │  record(type, {actor, onBehalfOf, object, roomId, causedBy, visibleTo})
   ▼
ontology.js ── validate ── append + hash chain(payloadHash) ── listeners
   │                                                  │
   │                                                  ▼
   │                                       knowledge.js (projector)
   │                                          facts: s · p · o
   │                                          owner · visibleTo · source.event
   │                                          status · version · supersedes
   │                                                  │
   │                         ┌────────────────────────┼─────────────────────┐
   ▼                         ▼                        ▼                     ▼
verifyChain()        GET /api/knowledge      agent roomContext      memory.js export
(감사)               (보는 사람 필터)         (요청자 필터)          (family-memory/*.md)
```

### 이벤트 타입 (1단계)

| 이벤트 | 기록 지점 | 만드는 사실 |
|---|---|---|
| `fa:PolicyDecided` | `requestAction`, Molla 작업 생성 | 없음 (감사용) |
| `fa:VoteCast` | `vote` | 없음 (감사용) |
| `fa:ActionExecuted` | `present` (조회 · 해지 · 주문 · 송금) | 해지: `(owner, fa:cancelled, service)`, `(owner, fa:subscribes, service)` 철회 · 조회: `(owner, fa:subscribes, service)` · 주문: `(owner, fa:ordered, item)` · 송금: `(owner, fa:sentMoneyTo, person)` |
| `fa:AccountLinked` | `submitInput` 완료 | `(owner, fa:hasAccount, service)` |
| `fa:FactStated` | Molla `rememberMemory` | `(owner, fa:said, text)` (본인 진술, 키 = 기억 id) |
| `fa:FactCorrected` | Molla `correctMemory` | 같은 키의 새 버전, 이전 버전은 `superseded`, 이전 본문은 redact |
| `fa:FactRetracted` | Molla `forgetMemory`, `POST /api/knowledge/retract` | 해당 사실 `retracted`, 원문 이벤트 본문 redact |
| `fa:FactShared` · `fa:FactUnshared` | Molla `shareMemory` · `revokeMemory` | 사실의 `visibleTo`에 가족 추가 · 제거 |

### 공개 범위 규칙

- 사실의 `owner`는 계정 주인(`onBehalfOf`)이다.
- 주인은 자기 사실을 모두 본다.
- 행동에서 나온 사실은 그 행동의 요청자도 본다(이미 결과 카드를 본 사람). 다른 가족은 주인이 `read` 위임을 줬을 때만 본다(`policy.evaluate`의 `scan_subscriptions` 판단과 같은 규칙).
- 본인 진술(`fa:FactStated`)은 주인만 본다. 공유는 Molla의 기존 기억 공유 규칙을 따른다(이번 PR 범위 밖, 기본 비공개).
- 정책 엔진은 지식 그래프를 권한 근거로 쓰지 않는다. 사실로 권한이 생기지 않는다.

### 잊기

`retract(actor, factId)`: 주인만 가능, `fa:FactRetracted` 이벤트 기록, 사실은 `retracted` 상태가 되고 질의에서 빠진다. 그 사실을 만든 이벤트(들)의 본문은 지우고 `redacted: true`로 표시한다. 체인은 payloadHash로 연결돼 있어 `verifyChain()`은 계속 통과한다(D3). 디스크 Markdown 사본에서 지우는 것과 키 기반 크립토 쉬레딩은 2단계.

## 범위 밖

- 카톡 데모(`fa-kakao-demo`) · Molla 앱 서버 · Molla CLI의 온톨로지 통합
- `store.emit` 카드를 방 뷰 프로젝터로 바꾸는 것
- 디스크 영속화 (지금 store처럼 메모리, Markdown 내보내기만 디스크)
- 사실 내용의 크립토 쉬레딩, LLM 추론 사실(`proposed` 상태)

## 테스트 계획 (먼저 실패하게 작성)

`fa-engine/test/ontology.test.js`

1. 알 수 없는 이벤트 타입, 빠진 필수 필드는 기록되지 않는다.
2. 해시 체인: 정상 로그는 통과, 중간 이벤트를 바꾸면 `verifyChain()`이 그 위치를 보고한다.
3. 아들이 요청하고 엄마가 승인한 왓챠 해지 → 엄마 사실 `fa:cancelled 왓챠`, 출처 이벤트 id가 붙는다.
4. 공개 범위: 아빠(read 위임만 있음)는 엄마 해지 사실을 본다 / 위임이 없는 사람은 못 본다 / 엄마 본인 진술은 아들도 못 본다.
5. 잊기: 주인만 가능, 다른 가족은 403, 잊은 사실은 질의에서 빠지고 로그에 `fa:FactRetracted`가 남는다.
6. 계정 연결 → `fa:hasAccount` 사실, 비밀번호 · 아이디 원문은 이벤트와 사실 어디에도 없다.
7. `resetAll()` 뒤 로그와 그래프가 비고 체인이 다시 시작된다.
8. Agent 컨텍스트에 요청자가 볼 수 있는 사실만 들어간다.
9. HTTP: `GET /api/knowledge?owner=mom`을 아빠 세션으로 호출하면 위 규칙대로, 세션 없는 호출은 401.
10. Molla 기억 수정 → 새 버전만 보이고 이전 본문은 로그에서 redact, 삭제 → 그래프에서 빠짐, 공유 → 받은 가족이 봄, 공유 철회 → 다시 못 봄 (D2).
11. redact 뒤에도 `verifyChain()` 통과, 본문을 몰래 바꾸면 실패 (D3).
12. 프로젝터가 예외를 던져도 `record()`와 행동 결과는 정상, 오류 수가 집계됨 (D4).
13. Agent 컨텍스트: 사실은 `<family_facts>` 태그 안 인용, 최대 20개 (D5).

기존 `npm test` 26개와 `demo/http-smoke.js`는 그대로 통과해야 한다.

## 엔지니어링 리뷰 (gstack /plan-eng-review)

**Scope Challenge.** 이미 있는 것: `store.js` 이벤트 버스(화면용), `memory.js` Markdown, `molla.js` `ontology()`(위임 · 규칙 뷰), `policy.evaluate`(공개 범위 판단에 재사용). 해시는 표준 라이브러리 `node:crypto`(reuse ladder 2단계). fa-trust `audit.ts`는 TS 패키지라 fa-engine(순수 JS, 의존성 1개)에 끌어오지 않는다. 복잡도: 원래 9 파일 · 새 모듈 3 → D1에서 작은 구조(8 파일 · 새 모듈 2) 선택. 결과: scope accepted as-is (구조만 축소).

**1. Architecture.**
- [High · 9/10] Molla 기억 수정 · 삭제 · 공유가 그래프에 안 가면 지운 기억이 LLM에 계속 들어감 (`fa-engine/src/molla.js:361-395`). → D2 수락: 다섯 연산 모두 이벤트.
- [High · 8/10] append-only 로그가 잊은 원문을 영구 보관. → D3 수락: payloadHash 체인 + redact.
- [Medium · 8/10] `EventEmitter`는 동기라 프로젝터 오류가 VM 실행 뒤 결과 카드를 막음 (`fa-engine/src/store.js:44-47` 패턴). → D4 수락.

**2. Code quality.**
- [Low · 7/10] 이벤트와 사실에는 사람 이름이 아니라 id를 저장. 이름(`N()`)과 `polish()`는 Markdown 내보내기와 화면에서만. 결정 불필요(코딩 규칙), 수락.

**3. Tests.** 위 1–13. 회귀 규칙: 2 · 10 · 11은 구현 전 실패해야 한다. LLM 평가 범위 없음(프롬프트 내용 검사는 결정적 문자열 검사).

**4. Performance.** 로그와 그래프는 메모리 배열, 질의는 사실 수에 선형. 데모 규모(수백 건)에서 문제 없음. 프롬프트는 20개 제한(D5)으로 토큰 증가 상한.
- [Medium · 7/10] 사실 원문을 LLM 프롬프트에 넣으면 기억 문구가 지시처럼 읽힐 수 있음 (`fa-engine/src/engine.js:174-195` roomContext). → D5 수락.

**Outside Voice.** 외부 모델 리뷰(codex) 미설치 — skipped.

**Failure modes.** 프로젝터 오류(격리, 집계), 체인 변조(verify 실패 위치 보고), 이벤트 모양 오류(record 예외 = 코드 버그), 세션 없는 지식 조회(401). critical gaps: 0.

**NOT in scope.** 카톡 데모 · Molla 앱 · Molla CLI 통합, 방 뷰 프로젝터, 디스크 영속화, 디스크 Markdown 사본 삭제, 크립토 쉬레딩, LLM 추론 사실.

## Implementation Tasks

1. 실패하는 `fa-engine/test/ontology.test.js` 작성 (테스트 1–13)
2. `fa-engine/src/ontology.js`: 어휘 · 검증 · 로그 · 체인 · redact
3. `fa-engine/src/knowledge.js`: 프로젝터 · 공개 범위 질의 · retract · Markdown 내보내기 연결
4. `engine.js` · `molla.js` · `memory.js` 연결, `resetAll`에서 초기화
5. `server.js`: `GET /api/knowledge`, `POST /api/knowledge/retract`
6. `engine.js` roomContext에 사실 넣기 (D5)
7. `npm test`, `node demo/http-smoke.js`, README 갱신

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | `/codex` | Independent 2nd opinion | 0 | skipped (not installed) | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN (all mapped to tasks) | 5 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex outside voice skipped, not installed on this host.
- **VERDICT:** ENG reviewed, 5 findings all accepted into tasks (D1–D5) — ready to implement.

NO UNRESOLVED DECISIONS
