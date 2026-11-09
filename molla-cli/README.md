# Molla CLI runtime v0.2

**웹 서버·HTTP API·브라우저 없이 실행하는 독립 CLI입니다.** 라우팅 담당자나 에이전트가 스킬을 읽고 명령/JSON을 전달하면 프로세스 안에서 권한을 검사하고 SQLite 상태를 갱신하며 작업을 실행합니다.

```text
라우팅 담당자/에이전트 → SKILL.md → CLI 명령 또는 JSON stdin
  → 로컬 세션 확인 → 소유자 권한 검사 → 승인 → 실행 코어
  → SQLite 저장 / 소유자별 ADB 실행 → JSON 결과
```

`molla-app`, 프런트엔드, API 서버, npm 설치 또는 LLM 연결 없이 동작합니다. Node.js 24 이상이 필요합니다. 이 패키지의 로컬 데모 프로필은 운영 인증이 아니며 실제 VM은 운영자가 연결해야 합니다.

## 시작

```sh
node bin/molla.mjs capabilities
node bin/molla.mjs health
node bin/molla.mjs demo login --actor mom --session .local/mom.json
node bin/molla.mjs task create --text "쌀 10kg 주문해줘" --session .local/mom.json
node bin/molla.mjs task get --id TASK_ID --session .local/mom.json
```

기본 DB는 현재 작업 폴더의 `.local/molla.sqlite`입니다. 모든 명령에 `--db FILE`로 고정할 수 있습니다. 라우터 호스트는 DB와 세션 파일을 절대경로로 지정하세요. Demo login은 mom/dad/son 테스트 주체를 선택합니다. 세션 파일만 수정해 주체를 바꿀 수 없으며 다른 DB의 세션은 거부됩니다.

## 승인과 실행

`task get`의 정확한 action/수신자/기기를 주인에게 보여주고 결정받은 뒤 출력된 hash를 전달합니다. 승인 비교와 기록은 한 SQLite 트랜잭션에서 처리합니다.

**승인은 주인 증명이 있어야 해요.** `--owner-confirmed`는 의사 표시일 뿐이고, 다음 둘 중 하나가 필요해요. 라우터(LLM)는 둘 다 할 수 없어요.

- 터미널에서 직접 실행: 화면에 뜬 일회용 코드를 입력
- 주인 앱: `MOLLA_OWNER_KEY`를 가진 주인 앱이 `owner token --for task.decide --id TASK_ID`로 그 작업과 action hash에만 묶인 5분짜리 토큰을 받아 `--owner-token`으로 전달

동의 켜기, 권한 범위 변경, 기억 공유, 연락처 추가도 같은 규칙이에요. 동의 철회, 거절, 취소는 증명 없이 가능해요.

```sh
node bin/molla.mjs task decide --id TASK_ID --decision approve --owner-confirmed --expected-action-hash HASH --session .local/mom.json   # 터미널: 코드 입력 / 주인 앱: --owner-token TOKEN 추가
node bin/molla.mjs task execute --id TASK_ID --session .local/mom.json
node bin/molla.mjs task get --id TASK_ID --session .local/mom.json
```

승인과 실행은 별도 명령입니다. `task execute`가 직접 실행하며 웹 워커나 백그라운드 서버가 없습니다. 기본 실행은 검증된 로컬 초안 생성입니다. `prepared`를 구매·예약·메시지 전송으로 보고하지 마세요. 중복 실행 claim은 거부하고 이미 끝난 작업은 기존 결과를 반환합니다.

실행 프로세스가 끊기면 자동 재실행하지 않습니다. 60초 실행 lease 만료 후 `task recover --id TASK_ID`로 `needs_verification` 상태로 전환해 실제 기기를 확인합니다. `task decide --decision cancel`로 대기/실행 중 작업을 중단할 수 있습니다.

## JSON 라우팅

```json
{"schema_version":"1.0","request_id":"req-001","operation":"task.create","arguments":{"text":"쌀 10kg 주문해줘"}}
```

```sh
node bin/molla.mjs route --input examples/request.json --db .local/molla.sqlite --session .local/mom.json
```

`--input -`는 stdin을 사용합니다. `docs/router-example.mjs`의 인자 배열 호출로 연결하세요. DB·세션·CLI 경로는 모델 출력에서 받지 않습니다. 라우터용 런처(`skills/molla-router/scripts/molla.mjs`)는 `capabilities`, `health`, `route --input -`만 실행하고, DB·세션은 호스트가 정한 `MOLLA_CLI_DB`·`MOLLA_SESSION_FILE`에서만 읽어요. `demo login`은 터미널이나 `MOLLA_ALLOW_DEMO_LOGIN=1`(테스트용)에서만 돼요. 허용되지 않은 operation/argument와 임의 shell 명령은 거부합니다. `request_id`는 추적용으로, 작업 생성의 중복 실행 방지 키가 아닙니다.

## Android VM

기존 클라우드 Android VM의 ADB serial을 운영자가 `MOLLA_PHONE_BINDINGS`로 소유자별 지정합니다. 예: `{"mom":{"serial":"127.0.0.1:5555","mode":"cloud"}}`. `MOLLA_ADB`로 ADB 실행 파일을 지정할 수 있습니다.

- `vm diagnose`: 소유자의 기존 기기를 ADB CLI로 진단합니다.
- `vm compose plan --contact-id ID --draft TEXT`: 문자 작성 화면 열기 계획. `MOLLA_ALLOW_ANDROID_COMPOSE=1` 필요.
- `vm app plan --app-id settings`: 허용 목록의 앱 열기 계획. `MOLLA_ALLOW_ANDROID_APPS=1` 필요.
- 실행에는 소유자의 `phone` 범위도 필요합니다. 명시적 결정 후 `permission set --scopes shopping,calendar,message,phone --owner-confirmed`로 설정합니다.
- 계획 생성 후에도 소유자 승인과 `task execute`가 필요합니다. 자동 문자 전송·결제는 없습니다.

VM 생성·서비스 계정 로그인·운영 인증은 아직 별도 연결 단계입니다. CLI 기반이라는 점과 모든 외부 업무를 완성했다는 점은 다릅니다.

## 인계와 검증

- `skills/molla-router/SKILL.md`: 라우팅 에이전트 지침
- `docs/HANDOFF.md`: 담당자 인계
- `docs/capabilities.json`, `docs/request.schema.json`: 기계가 읽는 명령/입력 규격
- `bin/`, `lib/`, `runtime/`: 독립 실행 코드. 형제 앱 폴더 불필요

```sh
node --test tests/*.test.mjs
node scripts/package-handoff.mjs
```

25개 테스트에는 웹 호출·서버 listener를 금지한 독립 패키지 실행, 원자적 승인, 동시 실행, 타인 작업·기억 접근 거부, 그리고 [보안 회귀 테스트](tests/security.test.mjs) 10개(라우터 단독 승인 차단, 주인 토큰 바인딩, 런처 제한, DB 권한, 세션 심볼릭 링크, 배포 패키지 검사)가 포함됩니다. 배포 스크립트는 숨김 폴더를 건너뛰고, 세션·DB·비밀 파일이 보이면 빌드를 멈춰요. 보안 점검 내용은 [SECURITY.md](SECURITY.md)에 있어요.

v0.1의 `serve`, `--base-url`, `--port`, HTTP 쿠키 transport는 v0.2에서 제거되었습니다. 기존 v0.1 세션은 새 CLI 프로필로 다시 만들어야 합니다.
