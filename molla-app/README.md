# Molla 앱과 실제 연결 서버

주 제품은 `apps/mobile`의 React Native·Expo 앱이다. `server`의 Node API가 개인 접속 코드, 가족별 데이터, AI 처리 동의, 작업 승인 및 Android 실행을 검사한다. 기존 루트 `src`의 Vite 화면과 `server/demo.mjs` 촬영 환경은 별도로 남아 있다.

## 현재 가능한 것

- Letsur `gpt-6.1-terra`(추론 `medium`) 또는 Vercel Gateway 모델로 한국어 대화와 구조화된 작업 초안 생성. 제공자를 자동 전환하지 않는다.
- 개인별 기억·연락처·대화 격리, 기억 공유·정정·철회, 주인의 새 동의와 정확한 작업 승인.
- 배정된 Android에서 허용된 앱 열기와 전경 앱 확인. 문자 작성 화면은 열 수 있으나 전송하지 않는다.
- 인증된 주인이 실제 Android 캡처를 약 3초 간격으로 확인. 닫기·백그라운드·권한 해제·오류 시 갱신과 표시를 중단한다.
- 저장형 Phone Harness VM 일대일 배정, 실행 전 시간·비용 견적, 시작·진단·종료.

실제 모델 검증은 완료했다. 실제 VM 시작, APK/IPA 설치, 원격 가족 휴대폰 제어는 완료되지 않았다. [검증과 남은 작업](docs/STATUS.md)에 범위를 기록한다.

## 서버 준비

Node 24 이상, pnpm이 필요하다. Android Cloud에는 Python 3.10 이상, Phone Harness 계정 및 ADB가 추가로 필요하다.

```powershell
cd molla-app
pnpm install --frozen-lockfile
Copy-Item .env.example .env
& ./scripts/enable-live.ps1
```

Windows가 아니라면 `node scripts/enable-live.mjs`를 사용한다. 이 명령은 최초 1회 개인 토큰과 토큰 해시를 만들며 다시 실행해도 기존 토큰을 재발급하지 않는다. `.data/owner-access.txt`는 서버 운영자가 소유자에게 개별 전달하는 비공개 파일이다. 새 환경에는 별도 토큰이 생성된다.

편집기로 `.env`에 모델 키를 저장하고 `MOLLA_LLM_ENABLED=1`로 변경한다. Letsur는 `MOLLA_LLM_PROVIDER=letsur`, `LETSUR_API_KEY`, `LETSUR_MODEL`을 사용한다. Vercel은 `MOLLA_LLM_PROVIDER=vercel`, `AI_GATEWAY_API_KEY`, `MOLLA_MODEL`을 사용한다. 키를 앱의 `EXPO_PUBLIC_*` 변수에 넣지 않는다.

Terra의 기본 추론 설정은 `LETSUR_REASONING_EFFORT=medium`이다. [요청 호환성과 실제 검증 기록](docs/live/TERRA-MODEL.md)을 참고한다.

## 앱 실행과 이 PC에서 검토

```powershell
cd apps/mobile
pnpm install --frozen-lockfile
pnpm start
```

휴대폰 앱은 접근 가능한 HTTPS API 주소가 필요하다. 개발 중 USB/에뮬레이터 연결은 [모바일 README](apps/mobile/README.md)를 참고한다. 앱 설치·서명과 공개 서버 배포는 별도 작업이다.

Windows에서 같은 앱의 웹 검토 화면을 실제 로컬 API에 연결하려면:

```powershell
# molla-app 디렉터리에서
& ./scripts/build-live.ps1
& ../Start-Molla.ps1
```

`http://127.0.0.1:4318`은 이 PC에서만 열린다. 개인 접속 코드 → 도움 수락 → 나의 몰라에서 AI 처리 동의 순으로 연결한다. 서버 시작만으로 VM을 실행하지 않는다. 웹 검토 화면은 APK/IPA가 아니다.

## Android Cloud 준비

```powershell
node scripts/setup-phone-harness.mjs
# 공식 Android SDK Platform Tools를 설치하고 adb를 PATH에 추가
& ./scripts/phone-cloud.ps1 login
& ./scripts/phone-cloud.ps1 ls
node scripts/cloud-bind.mjs --help
```

`setup-phone-harness.mjs`는 사용한 커밋의 소스를 저장소 루트 `phone-harness/`에 준비한다. 기존 경로를 삭제하거나 덮어쓰지 않는다. `cloud-bind.mjs`의 사용법에 따라 각 소유자에게 서로 다른 저장형 기기를 배정한다. ADB는 `MOLLA_ADB`의 실행 파일 경로를 지정해도 된다.

데모는 **설정 앱 열기 → 주인 승인 → 실제 화면 확인**으로 진행하면 Google·쿠팡 로그인이나 휴대전화 본인인증이 필요 없다. 기기 디버깅 승인 및 타 서비스의 보안 인증을 우회하지 않는다. Phone Harness 요금과 AI 모델 요금은 별개다.

## 검증

```powershell
pnpm test
pnpm build
cd apps/mobile
pnpm typecheck
pnpm test:runtime
node scripts/verify-live-server.mjs
pnpm export
pnpm preview
# 별도 터미널, 동일 apps/mobile 폴더
pnpm verify:live
```

UI 검증은 명시적 테스트 API를 사용하며 실제 VM 근거가 아니다. Linux에서는 `pnpm exec playwright install chromium`이 필요할 수 있다. 외부 모델을 실제로 호출하는 검증은 `scripts/verify-letsur-live.mjs`와 `apps/mobile/scripts/verify-gateway-model.mjs`이며 일반 테스트 묶음에 포함하지 않는다. VM 검증은 별도 실행 승인과 한도 설정이 필요한 선택 단계다.

`agent/`의 eve 계획 에이전트는 별도 실험 코드이며 기본 앱 실행 경로가 아니다. 이전 촬영 모드와 외부 도구 상태는 각각 [데모 안내](docs/demo-recording.md), [eve 안내](docs/agent-runtime.md), [GStack 기록](docs/gstack-workflow.md)에 있다.
