# 라우팅 담당자 인계

목표: 요청 → CLI 연산 → 서버 권한 확인 → 실제 상태 보고. Node.js 24+, 기존 Molla API, 호스트가 지정한 소유자 세션 파일이 필요합니다.

1. `capabilities`로 연산과 입력 규격을 조회합니다.
2. `health`, `identity get`으로 API와 현재 주체를 확인합니다.
3. 요청을 operation으로 연결합니다. Session/actor/base URL은 모델 출력에서 받지 않습니다.
4. 작업을 생성하고 `task get`으로 정확한 action을 확인합니다.
5. 소유자에게 내용을 보여주고 결정받습니다. 가족 도우미가 대신 승인하지 않습니다.
6. 결과를 조회해 prepared/needs_verification/failed를 구분합니다.

실행 코드는 `docs/router-example.mjs`, 에이전트 지침은 `skills/molla-router/SKILL.md`, 상세 계약은 `skills/molla-router/references/routing-contract.md`입니다.

이 패키지는 API 클라이언트입니다. 메인 채팅에서 변경 중인 서버·웹 UI는 복사하지 않았습니다. `serve --app-dir`를 사용하려면 앱 서버 체크아웃을 별도로 제공하세요. 기본 4328 포트와 CLI 전용 DB로 기존 앱과 분리됩니다.

운영 연동에는 demo 로그인 대신 인증된 사용자 바인딩, 서버에서 원자적으로 검증하는 승인 토큰, 운영 DB와 VM 연결이 필요합니다. CLI가 VM을 만들거나 자동으로 SMS를 전송하지 않습니다.

수락 조건: 호출 allowlist 조회, 작업 생성·조회, 타인 승인 거부, 승인 없는 실행 방지, 초안을 전송으로 오인하지 않기, 소유자 기억 분리, 동의 철회, 알 수 없는 명령 거부, 불확실한 수정 요청 재시도 금지.
