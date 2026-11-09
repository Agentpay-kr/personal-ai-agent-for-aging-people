# Molla — Personal AI Agent for Aging People

가족별 개인 공간에서 작동하는 AI 도우미 프로젝트입니다.

[Molla CLI](molla-cli/README.md), [라우팅 스킬](molla-cli/skills/molla-router/SKILL.md), [담당자 인계](molla-cli/docs/HANDOFF.md)를 제공합니다.

Node.js 24 이상에서 `node molla-cli/bin/molla.mjs capabilities`로 시작하세요.

현재 CLI는 로컬 통합용 API 클라이언트입니다. 앱 서버는 별도로 필요합니다. 운영 인증·클라우드 VM 생성·자동 결제/전송은 아직 연결되지 않았으며 웹 앱 구현은 별도 작업에서 진행 중입니다.

## Family AI Agent 카카오톡 데모

[카카오톡 목업과 중앙 FA 라우터](fa-kakao-demo/README.md)에서 가족별 VM 선택, 조회 위임, 소유자 승인 흐름을 로컬 샘플로 시연합니다.
