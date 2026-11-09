# Molla 촬영용 데모

외부 API·유료 Android VM 없이 동작하는 별도 촬영 모드이다. 제품의 실제 연결 상태는 `STATUS.md`를 참고한다.

## 열기

현재 데모 서버: **http://127.0.0.1:4319/stage**

서버가 꺼졌으면 PowerShell에서 실행:

```powershell
# molla-app 디렉터리에서
& ./scripts/start-demo.ps1
```

API 키, Vercel 설정, Phone Harness 계정, 결제 설정이 필요하지 않다. 데모 서버는 루프백에만 열리며 개인 데이터 대신 합성 데이터만 사용한다. 공개된 demo-mom / demo-dad / demo-son은 시연용 선택 코드이며 실제 접속 자격 증명이 아니다.

## 시연 순서

1. 엄마: “딸에게 내일 병원에 간다고 알려줘” → 받는 사람과 문구 확인 → 승인 → 오른쪽 가상 휴대폰에 문자 작성 화면. 실제 전송은 없다.
2. 아빠: 가족 선택 → “설정 앱 열어줘” → 승인 → 아빠의 가상 설정 화면.
3. 자녀: 가족 선택 → 엄마·아빠의 대화가 보이지 않는 별도 공간.
4. “시연 처음부터 다시 시작”으로 세 가족의 합성 데이터를 초기화한다.

앱 디자인은 현재 React Native 앱을 그대로 export한다. 촬영 화면에는 DEMO 및 가상 Android 표시가 항상 보인다. `demo-script`는 촬영용 규칙/응답 시나리오이며 LLM 추론 결과가 아니다. Android는 시연용 UI이며 Android VM 또는 네이티브 시뮬레이터가 아니다. 실제 연결 코드의 실행 성공으로 해석하면 안 된다.

## 녹화와 반복 검증

프로젝트 폴더에서:

```powershell
node scripts/record-demo.mjs --check
node scripts/record-demo.mjs
```

`--check`는 실제 로컬 데모 서버와 모바일 웹을 연결해서 요청·승인·가상 화면·가족 격리를 검사한다. 브라우저 요청을 가로채어 가짜 API 응답을 주지 않는다. 모든 외부 웹 요청을 차단하고 요청이 있었다면 실패한다. 녹화는 Edge와 Playwright로 수행하며 결과는 `demo/recordings/molla-demo.webm`이다. 무음 영상이며 화면 내 자막이 포함된다.

앱 화면 변경 후 촬영 빌드만 갱신:

```powershell
& .\scripts\build-demo.ps1
```

`demo/mobile/`에 별도 출력하며 앱의 일반 `dist/`를 덮어쓰지 않는다. `EXPO_PUBLIC_DEMO_MODE=1`을 명시한 빌드만 `simulation:true`인 로컬 데모 서버를 허용한다. 기본 모바일 빌드는 기존의 실제 인증/API 계약을 유지한다. 실제 서버(`server/index.mjs`, 포트 4318)와 데모 서버(`server/demo.mjs`, 포트 4319)는 데이터 파일과 실행 경로가 분리되어 있다.

## 검증 범위

- 서버 로직 테스트 55개 통과: 기억/권한/승인, LLM 어댑터 검증, VM 어댑터 격리와 중복 시작 방지. 외부 서비스는 테스트 대역으로 검사했다.
- 모바일 TypeScript 검사 및 별도 Expo Web export 통과.
- 데모 브라우저 흐름 통과. `demo/recordings/verification.json`에 기록.
- 이 시연 과정은 실제 모델 호출, Phone Harness VM 생성, SMS 전송을 수행하지 않는다.
