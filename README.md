# Molla — Personal AI Companion

노년층과 가족을 위한 개인 AI 동반자입니다. React Native 모바일 앱과 독립 CLI를 각각 실행할 수 있습니다.

## 모바일 앱

흰색·노랑·검정의 대화 중심 UI입니다. iOS/Android용 Expo 앱이며 WebView 래퍼가 아닙니다.

- [모바일 설치와 실행](molla-app/apps/mobile/README.md)
- [디자인 시스템](molla-app/DESIGN.md)
- [화면 검증과 한계](molla-app/docs/design/VERIFICATION.md)
- [서버 연결 계약](molla-app/docs/live-api-handoff.md)

```sh
cd molla-app/apps/mobile
pnpm install --frozen-lockfile
pnpm start
```

앱의 실제 대화·Android 실행에는 별도로 운영하는 인증된 Molla API가 필요합니다. 이 변경은 모바일 클라이언트를 추가하며 서버나 모델 자격증명을 포함하지 않습니다. UI 검증은 합성 데이터를 사용하는 명시적 API fixture로 실행합니다.

## 독립 CLI

**웹 서버·HTTP API·브라우저 없이 실행하는 독립 CLI와 라우팅 스킬입니다.**

- [CLI 실행법](molla-cli/README.md)
- [라우팅 스킬 SKILL.md](molla-cli/skills/molla-router/SKILL.md)
- [담당자 인계](molla-cli/docs/HANDOFF.md)
- [명령 목록](molla-cli/docs/capabilities.json)

Node.js 24 이상에서 시작하세요. npm 설치나 웹 앱 체크아웃은 필요 없습니다.

[FA 엔진](fa-engine/README.md)은 카카오톡형 단톡방 데모용 로컬 API 서버(가족 권한 엔진 + Claude 에이전트)입니다. Molla CLI v0.2는 HTTP 없이 독립 실행되므로 FA 엔진 없이도 동작합니다 (`cd fa-engine && npm install && npm start`).

```sh
node molla-cli/bin/molla.mjs capabilities
node molla-cli/bin/molla.mjs health
```

v0.2는 로컬 SQLite와 권한·실행 코어를 직접 사용합니다. 승인 비교는 원자적으로 처리하며, 승인 후 `task execute`를 명시적으로 호출합니다. 15개 테스트에는 웹 사용을 금지한 독립 패키지 실행 검증이 포함됩니다.

현재 기본 실행은 로컬 초안입니다. 실제 클라우드 Android VM은 운영자가 소유자별 ADB 연결을 준비해야 하고, 운영 인증·VM 생성·자동 결제/전송은 포함하지 않습니다.

## Family AI Agent 카카오톡 데모

[카카오톡 목업과 중앙 FA 라우터](fa-kakao-demo/README.md)에서 가족별 VM 선택, 조회 위임, 소유자 승인 흐름을 로컬 샘플로 시연합니다.
