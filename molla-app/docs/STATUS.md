# 구현·검증 상태

새 [소유자 API](../apps/api/README.md)는 별도의 인증과 작업 승인을 사용한다. 아래 실제 설정 앱 결과는 기존 서버에서 얻었다. 새 API의 실제 Android 작업과 T world 로그인은 별도 검증 항목이다. [소유자 API 검증](real-agent-verification.md)

2026-11-09, Asia/Seoul. 노랑·검정 Yellow Buddy 앱 디자인을 유지한 실제 연결 구현이다.

| 기능 | 구현·검증 |
|---|---|
| React Native iOS/Android 앱 | 타입 검사와 JS·리소스 export 통과. APK/IPA 설치는 미검증 |
| Letsur 모델 | 기본 `gpt-6.1-terra`, 추론 `medium`. 실제 한국어 응답·승인 대기 초안 검증. `live/terra-model-smoke-report.json` |
| Vercel Gateway 모델 | 실제 `openai/gpt-5-mini` 응답·초안·중복 요청 방지 검증. `live/gateway-model-smoke-report.json` |
| 가족·기억·동의·승인·화면 접근 | 서버 테스트 68개 통과. 다른 소유자의 기기·화면에 접근하지 않음 |
| 앱 인증·승인·VM 견적·화면 확인 | 명시적 테스트 API를 사용한 UI 흐름 9개 통과. `live/ui-contract-report.json` |
| 클라우드 Android | 엄마의 저장형 VM에서 실제 Letsur 계획·승인·설정 앱 실행 및 종료 검증. 아빠·자녀 VM은 미배정. `live/letsur-android-live-report.json` |
| 실제 Android 화면 보기 | 소유자 인증·권한을 검사하는 캡처 API와 3초 갱신 UI에서 클라우드 Android의 실제 설정 화면 표시 확인. 다른 소유자 접근 거부 확인 |
| 일반 휴대폰 원격 제어 | ADB로 승인·연결된 Android 어댑터만 구현. 임의의 상대방 휴대폰을 인터넷으로 제어하는 제품은 아님 |
| 공개 배포 | 로컬 API 검증. 운영 HTTPS 서버·스토어 배포·서명 미완료 |

실제 모델 검증은 합성 사용자와 임시 DB를 사용했다. 실제 가족의 동의를 대신하거나 메시지·구매·결제를 실행하지 않았다. UI fixture의 Android 결과와 과거 촬영 영상은 실제 VM 실행 증거가 아니다.

2026-11-09 실제 VM 검증은 3분 제한으로 한 세션만 실행했으며, 시작 약 100초 후 종료 확인, 최종 활성 세션 0, VM 크레딧 US$0.05 차감이었다. 화면은 React Native Web에서 확인했으며 APK/IPA 설치나 실제 개인 휴대폰 제어를 검증한 것은 아니다.

## 로그인 없는 실제 시연 흐름

1. 테스트 소유자의 앱 접속 코드로 연결하고 도움·AI·Android 권한을 선택한다.
2. 배정된 VM의 예상 시간·비용을 확인하고 직접 시작한다.
3. “설정 앱 열어 줘”라고 입력한다. 실제 AI가 실행할 앱을 선택하고 승인 대기 부탁을 만든다.
4. 정확한 앱과 소유자를 확인한 뒤 승인한다. 서버가 Android 전경 패키지를 확인해야 완료로 표시한다.
5. “실제 Android 화면 보기”에서 캡처를 확인한다. 이는 약 3초마다 갱신하는 화면이며 동영상 스트리밍이나 자유 터치 제어가 아니다.
6. Android 사용 종료를 요청하고 종료 상태를 확인한다.

이 시연은 Google·쿠팡·전화번호 인증을 요구하지 않는다. 실제 서비스에 로그인하는 시연은 계정 주인이 정상 인증을 완료해야 한다. 기기 인증을 우회하지 않는다.

## 비용과 외부 소스

Phone Harness의 [공식 요금](https://phone-harness.com/#pricing)은 Basic Android 분당 US$0.05, 신규 크레딧 US$5다. 계정 잔액·프로모션은 변경될 수 있다. Vercel AI 크레딧과 Letsur 사용료는 VM 크레딧과 서로 별개다. 일반 CI는 외부 모델이나 유료 VM을 호출하지 않는다.

Phone Harness는 MIT 라이선스 커밋 `4bebff105af853215fb74c958c2c5e78bc275be2`를 별도 설치한다. REA(MIT, `c78c8aed403b955680a342f5ad38680867e3858f`)는 개발 참고 소스이며 앱 실행 의존성이 아니다. 대용량 원본 체크아웃, 서브모듈 아카이브 및 도구 설치 파일은 이 제품 저장소에 포함하지 않는다.
