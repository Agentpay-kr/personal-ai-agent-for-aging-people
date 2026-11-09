# 실제 API에 연결하는 모바일 앱 검증

작성: 2026-11-09, Asia/Seoul. 제품 대상은 React Native·Expo iOS/Android 앱이다. 브라우저는 화면 검증 수단이다.

## 구현

- 기본 시작은 개인 앱 연결 화면이다. 자동 엄마 로그인, 오프라인 체험 답변, 실패 시 모의 답변을 제거했다.
- 서버 주소와 개인 앱 토큰으로 `/api/runtime`·`/api/state`를 조회해 live 모드와 동일 소유자를 확인한다.
- iOS/Android 토큰은 SecureStore에 저장한다. 웹 검증에서는 메모리에만 저장하고 새로고침 후 재연결한다.
- 연결 해제·401 오류 시 대화, 부탁, 초안, 견적, 재시도 ID를 비운다.
- 대화는 실제 `/api/chat`만 사용한다. UUID로 같은 요청 재시도를 구분하고, 실패한 입력을 보존한다.
- 소유자의 도움 수락, AI 처리 동의, 기억 전달 동의, Android 앱 열기 권한을 별도로 표시한다.
- 정확한 행동·수신자·앱·소유자를 확인한 뒤 승인한다. HTTP 성공만으로 실행 완료를 표시하지 않는다.
- VM 사용은 서버 견적의 시간·비용을 확인한 뒤 시작한다. 시작 요청을 자동 재시도하지 않고, 불확실한 상태는 진단·종료 경로로 안내한다.
- 서비스 키와 Cloud 로그인은 서버에만 둔다. 앱용 공개 환경 변수에 비밀키를 넣지 않는다.

## 확인한 경계

| 경계 | 결과 | 근거 |
|---|---|---|
| 모바일 요청 도구 → 실제 로컬 HTTP | 5개 테스트 통과 | `scripts/runtime.test.mjs`: 토큰·쿠키·URL·리다이렉트·401·타임아웃 |
| 모바일 HTTP 클라이언트 → 실제 Node 서버 | 통과 | `server-contract-report.json`: 임시 DB/개인키, 실제 HTTP, 외부 제공자 비활성화 |
| UI → 인증된 API 계약 → UI | 통과 | `ui-contract-report.json`: 명시적 테스트 API, 잘못된 키·동의·승인·견적·계정 격리 |
| TypeScript | 통과 | `pnpm typecheck` |
| iOS·Android·Web JS/리소스 export | 통과 | 최신 Yellow Buddy 디자인·실제 연결 코드의 3개 플랫폼 export, `../design/VERIFICATION.md` |
| 실제 Vercel 모델 API 응답 | 통과 | `gateway-model-smoke-report.json`: 실제 모바일 HTTP 클라이언트 → 임시 Node live 서버 → Gateway `openai/gpt-5-mini`, 한국어 응답·문자 초안·요청 중복 방지·가족별 격리 |
| 실제 가족별 Android VM | 설정 완료·실행 보류 | 엄마의 저장형 Android 배정. 사용자 요청으로 시작하지 않았음. 아빠·자녀 VM은 미배정 |
| APK/IPA·기기 설치 | 미검증 | 현재 PC에 Android SDK/JDK 또는 iOS 빌드 환경 없음 |

테스트 API 화면에는 실제 가족·계정·비용 발생이 없다. 테스트 화면 캡처를 실제 VM 실행이나 모델 응답 증거로 사용하지 않는다. 모델·VM 최종 연결 현황은 `../live-api-handoff.md`에서 별도로 관리한다.

Vercel Gateway 검증은 실제 외부 모델 API를 호출했다. 두 한국어 요청의 사용량은 합계 입력 935 / 출력 950 토큰이며 임시 DB의 합성 사용자만 사용했다. 실제 가족의 동의를 대신하거나 메시지를 전송하지 않았고 VM도 시작하지 않았다. Gateway 키는 서버 `.env`에만 저장했으며 90일 만료·총 US$5 예산으로 발급했다. `gpt-6.1-sol`은 현재 무료 계정에서 접근 거절되어 사용 가능한 `gpt-5-mini`로 확인했다. 서버 담당이 선택한 기본 Letsur 제공자는 그대로 유지했고 Vercel 검증만 별도 프로세스에서 수행했다.

## 재검증

`apps/mobile`에서 `pnpm test:runtime`, `node scripts/verify-live-server.mjs`, `pnpm typecheck`를 실행한다. `pnpm export` 후 `pnpm preview`로 검증 서버를 띄우고 `pnpm verify:live`를 실행한다. 기존 `docs/design/`의 체험 모드 결과는 이전 디자인 기준 기록이다.

외부 Gateway 재검증은 제품 루트 `molla-app`에서 `node --env-file=.env apps/mobile/scripts/verify-gateway-model.mjs`를 실행한다. 이 명령은 실제 모델 사용량이 발생하므로 일반 테스트 묶음에는 포함하지 않는다.

최종 실기기 확인: 개인키 저장/삭제, 앱 재실행, 앱 잠금·복귀, 키보드·읽어주기·햅틱, 가족 계정 분리, 네트워크 단절 중 작업 상태, VM 종료/비용, 소유자 직접 로그인과 외부 실행 결과를 확인해야 한다.
