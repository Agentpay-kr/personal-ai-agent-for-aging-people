# Molla — Personal AI Agent for Aging People

가족별 개인 공간에서 작동하는 AI 도우미 프로젝트입니다.

[Molla CLI](molla-cli/README.md), [라우팅 스킬](molla-cli/skills/molla-router/SKILL.md), [담당자 인계](molla-cli/docs/HANDOFF.md)를 제공합니다.

[FA 엔진](fa-engine/README.md)은 가족 권한 엔진과 Claude 에이전트가 들어 있는 로컬 API 서버입니다. Molla CLI가 그대로 붙는 Molla 호환 API와 카카오톡형 단톡방 UI용 API를 함께 제공합니다 (`cd fa-engine && npm install && npm start`).

Node.js 24 이상에서 `node molla-cli/bin/molla.mjs capabilities`로 시작하세요.

현재 CLI는 로컬 통합용 API 클라이언트입니다. 앱 서버는 별도로 필요합니다. 운영 인증·클라우드 VM 생성·자동 결제/전송은 아직 연결되지 않았으며 웹 앱 구현은 별도 작업에서 진행 중입니다.
