# CLI 라우팅 담당자 인계 v0.2

이 패키지는 API 래퍼가 아닙니다. **Node 프로세스에서 권한·기억·작업 실행을 직접 처리합니다.** 웹 서버, 브라우저, 웹 앱 체크아웃, 포트, URL이 필요 없습니다.

받을 파일: `bin`, `lib`, `runtime`, `skills`, `docs`, `examples`, `package.json`. Node.js 24 이상이면 별도 npm 설치 없이 실행합니다.

연결 순서:

1. `capabilities`로 operation을 확인합니다.
2. 로컬 DB와 테스트 프로필을 준비하고 `identity get`으로 현재 주체를 확인합니다.
3. 작업을 `task create`로 등록합니다.
4. `task get`으로 정확한 action을 주인에게 보여주고 결정받습니다.
5. 주인이 자기 채널(터미널 코드 입력, 또는 `MOLLA_OWNER_KEY`를 가진 주인 앱의 `--owner-token`)로 승인한 뒤 `task execute`를 호출합니다. 라우터 경로의 승인은 `OWNER_CONFIRMATION_REQUIRED`로 거절돼요.
6. `task get`의 status/evidence/result를 보고합니다.

JSON 호출은 `docs/router-example.mjs`를 사용합니다. DB 경로, 세션 경로, CLI 경로는 호스트가 정하며 모델 입력에 넣지 않습니다. actor는 세션 토큰의 DB 기록에서 결정합니다. 가족이 다른 사람의 작업을 승인할 수 없습니다.

승인 hash 비교와 기록은 SQLite 트랜잭션 안에서 원자적으로 수행합니다. 외부 행동 직전 권한과 동의를 다시 검사합니다. 실행 claim으로 동시 중복을 막고, 끊긴 실행은 자동 재전송하지 않습니다.

기본 실행은 로컬 초안입니다. `prepared`는 초안 준비, `needs_verification`은 기기 확인 필요, `failed`는 검증 실패를 뜻합니다. 외부 구매·전송 완료와 구분하세요. JSON `ok:true`는 명령 처리 성공이며 업무 성공 여부는 `data.status`와 근거를 확인합니다.

실제 기기 테스트에는 운영자가 배정한 소유자별 ADB 연결과 허용 설정이 필요합니다. VM을 새로 만들거나 자동 결제·전송하는 기능은 포함하지 않습니다. Local demo 프로필은 운영 인증을 대체하지 않습니다.

v0.1에서 이전: `serve`와 `--base-url`을 삭제하고 `--db`를 사용합니다. API 쿠키 세션 대신 `demo login`으로 새 CLI 세션을 만듭니다. 승인 뒤 `task execute`를 명시적으로 추가합니다.
