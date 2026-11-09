# Molla CLI 보안 점검 (2026-11-09)

v0.2(독립 CLI 런타임)를 라우터(LLM)와 작업·기억 텍스트를 **신뢰할 수 없는 입력**으로 보고 점검했어요.
상위 항목은 모두 재현한 뒤 고쳤고, [tests/security.test.mjs](tests/security.test.mjs)에 회귀 테스트가 있어요.

## 고친 것

| # | 심각도 | 문제 | 수정 |
|---|---|---|---|
| 1 | HIGH | 승인이 `ownerConfirmed: true` + 라우터가 직접 읽은 hash뿐이라, 작업 문구에 "엄마가 미리 승인함"을 심으면 라우터가 승인·실행까지 했어요 | 승인·동의 켜기·권한 범위·기억 공유·연락처 추가에 **주인 증명** 필요: 터미널 일회용 코드 또는 `MOLLA_OWNER_KEY`로 만든 5분짜리 HMAC 토큰(행동자·연산·작업 id·action hash에 묶임). 라우터 경로는 `OWNER_CONFIRMATION_REQUIRED` |
| 2 | HIGH | 스킬 런처가 인자를 그대로 넘겨 `demo login --actor mom`으로 남의 세션을 만들 수 있었고, 모델이 `--db`/`--session`을 정했어요 | 런처는 `capabilities`·`health`·`route --input -`만 허용, DB·세션은 호스트 환경 변수에서만, `MOLLA_OWNER_KEY`·`MOLLA_ALLOW_DEMO_LOGIN` 제거. `demo login`은 터미널이나 테스트 스위치에서만 |
| 3 | MEDIUM | `memory.share`에 주인 확인이 전혀 없었어요 | #1의 주인 증명 적용 |
| 4 | MEDIUM | SQLite DB·WAL이 0644로 생겨 다른 OS 사용자가 읽을 수 있었어요 | 0600으로 생성(umask 077), 열 때 chmod |
| 5 | MEDIUM | 배포 패키지에 `examples/.local/session.json`(살아 있는 토큰)과 DB가 들어갔어요 | 숨김 폴더 제외, 세션·DB·비밀 파일이 보이면 빌드 중단, 허용 확장자만 |
| 6 | MED-LOW | 세션 파일 쓰기가 심볼릭 링크를 따라가 다른 파일을 덮어썼어요 | 일반 파일이 아니면 거부, 임시 파일(0600, `wx`) 작성 후 rename |
| 7 | MED-LOW | 부작용(문자 화면 열림) 뒤 권한이 바뀌면 `failed`로 기록돼 중복 재시도를 부를 수 있었어요. lease 60초가 ADB 최악 대기 시간과 같았어요 | 이 경우 `needs_verification`으로 기록, lease 120초 |

## 남은 것 (낮음)

- 승인이 만료된 작업이 `running`에 남을 수 있어요(취소로만 정리됨).
- `route --input FILE`이 크기 확인 전에 파일 전체를 읽어요.
- Windows에서 `MOLLA_ADB` 없이 실행하면 현재 폴더의 `adb.exe`가 먼저 실행될 수 있어요. 운영에서는 `MOLLA_ADB`를 절대경로로 지정하세요.
- 로그아웃·세션 폐기가 없고, 다시 로그인해도 이전 토큰(24시간)이 살아 있어요.
- 데모 로그인은 운영 인증이 아니에요. 운영에서는 주인 앱의 실제 로그인과 `MOLLA_OWNER_KEY` 보관(서버 측 비밀 저장소)이 필요해요.

## 원래부터 제대로 막혀 있던 것

SQL 바인딩, JSON 키 허용 목록(actor 주입·프로토타입 오염 없음), 셸 없는 ADB 실행과 기기 쪽 인용 처리, 256비트 세션 토큰의 해시 저장, 주인 단위 접근 제어, 승인 hash 비교·기록의 원자성, 실행 claim으로 중복 실행 방지.
