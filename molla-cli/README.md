# Molla CLI + Router Skill

라우팅 담당자나 에이전트가 Molla를 명령으로 조작하는 전달 패키지입니다. **CLI → 기존 API의 권한 검사 → 소유자 전용 실행 공간**으로 연결합니다. 로컬 통합용이며 라우팅 LLM·운영 인증·VM 생성·자동 결제/전송은 포함하지 않습니다.

## 실행

Node.js 24 이상이 필요합니다. npm 의존성 설치나 빌드 없이 실행됩니다.

```sh
node bin/molla.mjs capabilities
node bin/molla.mjs --help
```

명령으로 설치할 환경에서는 `npm link` 후 `molla ...`로 호출할 수 있습니다.

## API 연결

기존 앱 API가 있으면 실제 포트를 지정합니다. 앱 기본 포트는 4318, CLI 기본 포트는 충돌 방지를 위해 4328입니다.

```sh
node bin/molla.mjs health --base-url http://127.0.0.1:4318
node bin/molla.mjs demo login --actor mom --session .local/mom.json --base-url http://127.0.0.1:4318
```

앱 서버 체크아웃이 있다면 별도 터미널에서 실행할 수도 있습니다. CLI 전용 포트·DB를 사용합니다.

```sh
node bin/molla.mjs serve --app-dir ../molla-app
```

이 패키지에는 앱 서버 소스가 포함되지 않습니다. 기존 API를 받거나 `molla-app`을 별도로 받아야 합니다. Demo login은 테스트 사용자 선택이며 운영 인증이 아닙니다.

## 요청·상태·소유자 결정

```sh
node bin/molla.mjs demo login --actor mom --session .local/mom.json
node bin/molla.mjs task create --text "쌀 10kg 주문해줘" --session .local/mom.json
node bin/molla.mjs task list --session .local/mom.json
node bin/molla.mjs task get --id TASK_ID --session .local/mom.json
```

`task get`의 정확한 내용을 소유자에게 보여준 뒤 결정받습니다. 체험 승인에는 반환된 hash와 확인을 같이 보냅니다.

```sh
node bin/molla.mjs task decide --id TASK_ID --decision approve --owner-confirmed --expected-action-hash REVIEWED_HASH --session .local/mom.json
node bin/molla.mjs task get --id TASK_ID --session .local/mom.json
```

`prepared`는 로컬 초안 준비, `needs_verification`은 기기 확인 필요입니다. 구매·예약·전송 완료가 아닙니다. 현재 hash는 클라이언트 일치 검사이므로 운영 승인은 서버 인증과 원자적 내용 검증이 추가되어야 합니다.

## 라우터 입력

```json
{"schema_version":"1.0","request_id":"req-001","operation":"task.create","arguments":{"text":"쌀 10kg 주문해줘"}}
```

```sh
node bin/molla.mjs route --input examples/request.json --session .local/mom.json
```

파일 대신 `--input -`로 stdin을 받습니다. `docs/router-example.mjs`의 argument-array 호출을 사용하고 사용자 문장을 shell에 붙이지 마세요. stdout 한 줄의 JSON, `ok`, 종료 코드를 확인합니다. Request ID는 추적용이며 중복 실행 방지 키가 아닙니다. 불확실한 수정 요청은 자동 재시도하지 않습니다.

## 전달 파일

- `bin/`, `lib/`, `package.json`: CLI 코드
- `skills/molla-router/`: SKILL.md, 실행 도우미, 상세 계약
- `docs/capabilities.json`, `docs/request.schema.json`: 기계가 읽는 규격
- `docs/HANDOFF.md`, `docs/router-example.mjs`: 인계 절차·호출 예제
- `examples/`: 요청 예제

스킬 전체 폴더를 대상 에이전트의 스킬 디렉터리로 복사합니다. 따로 설치했다면 `MOLLA_CLI`에 `bin/molla.mjs` 절대경로를 지정하세요. 세션·DB·기기 설정은 GitHub에 올리지 않습니다.

```sh
node --test tests/*.test.mjs
node scripts/package-handoff.mjs
```

패키징은 전달 폴더, JSON 규격과 체크섬을 만듭니다. `.local`, DB, `.env`, 다운로드한 타사 저장소는 포함하지 않습니다.
