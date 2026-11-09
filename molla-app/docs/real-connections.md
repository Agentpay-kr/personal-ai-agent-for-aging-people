# 실제 연결 상태와 사용 방법

2026-11-09 현재 기본 서버는 **Letsur의 gpt-4.1-mini**를 호출한다. 실제 한국어 답변과 메시지 초안을 확인했다. 대역 응답으로 성공 처리하거나 실패 시 다른 공급사로 자동 전환하지 않는다.

## 이 PC에서 사용하기

1. **http://127.0.0.1:4318**을 연다. React Native 앱의 로컬 웹 실행 화면이다.
2. 서버 주소는 이미 입력되어 있다. `.data/owner-access.txt`의 `mom:` 뒤에 있는 개인 앱 접속 코드를 ‘내 앱 연결 키’에 입력한다. **Letsur API 키를 입력하는 칸이 아니다.**
3. 엄마 공간에서 도움을 수락한다. ‘나의 몰라’에서 ‘AI와 대화하기’를 켜면 실제 모델과 대화할 수 있다. ‘내 기억을 함께 참고하기’는 별도 선택이며 기본으로 꺼져 있다.
4. Android를 사용하려면 같은 화면에서 ‘내 Android 앱 열기’를 허용하고, 비용·시간 안내를 확인한 뒤 시작한다. 현재 요청대로 VM은 시작하지 않았다.

아빠와 자녀도 각자의 개인 접속 코드로 대화할 수 있다. 현재 이 두 사용자에게 Android는 배정하지 않았다. 엄마 VM을 공유하지 않는다.

이 주소는 같은 PC의 로컬 실행용이다. 별도 휴대폰에서 연결하려면 네트워크 주소/HTTPS 서버 또는 개발용 연결 설정이 추가로 필요하다. 공개 인터넷 배포나 네이티브 기기 설치 성공을 뜻하지 않는다.

## 연결 및 검증

| 부분 | 현재 상태 |
|---|---|
| Letsur | 모델 목록 인증 및 실제 한국어 응답·초안 확인 |
| 가족별 기억·대화 | 토큰으로 사용자 구별, 본인 데이터만 제공 |
| 동의 | 실제 설치에서는 모두 미동의 상태로 시작; 본인이 수락 |
| 엄마 Android | Phone Harness 저장형 프로필 배정, 로그인 완료, 정지 상태 |
| 실제 VM 실행 | 사용자 요청으로 보류; 이 작업에서 실행 비용 없음 |
| 아빠·자녀 Android | 미배정 |
| 모델 키 | 서버의 `.env`에만 저장; 모바일 번들 미포함 확인 |

실행 기능은 승인한 앱 열기와 문자 작성 화면 열기까지 구현했다. 문자 자동 전송, 실제 주문·결제·병원 예약은 지원하지 않는다. 실제 VM 위의 앱 실행 성공은 아직 검증하지 않았으므로, 설정 완료와 기기 실행 검증을 구분한다.

읽기 전용 재검사: `node scripts/verify-live-setup.mjs`

서버 재실행: `node --env-file-if-exists=.env server/index.mjs`

앱 변경 후 로컬 실연결 화면 재빌드: `& .\scripts\build-live-local.ps1`

증거: `docs/live/letsur-model-smoke-report.json`, `docs/live/live-setup-report.json`. 서버 로직 테스트 60개 통과. VM 어댑터는 테스트 대역으로 검사했으며, 유료 실제 실행은 하지 않았다.

공식 API 참고: [Letsur 첫 API 호출](https://docs.platform.letsur.ai/ai-gateway/getting-started), [Phone Harness 세션 생성](https://phone-harness.com/docs/api-reference/sessions/create-session).
