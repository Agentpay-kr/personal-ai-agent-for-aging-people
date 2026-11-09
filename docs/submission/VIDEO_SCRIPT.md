# FA 2분 데모 영상 대본 (c0mpiled-17 Seoul)

얼굴 20초 → 화면 녹화 75초 → 슬라이드 15초 → 얼굴 10초. 내레이션은 영어, 화면은 한국어 UI 그대로, 영어 자막을 입혀요.
`[ ]`는 촬영 전에 채우는 칸, `⟦ ⟧`는 리허설에서 2분을 넘길 때 먼저 빼는 문장이에요.

## 규칙과 심사 기준 (Luma 페이지 원문 기준)

- 제출: **데모 영상 2분 이하** (Loom·YouTube 권장) + GitHub 저장소 URL. 빌드 시간(10:00) 전 커밋은 심사 제외. 빌드 세션은 15:00에 끝나요.
- 심사 기준 세 가지: **Problem-solution clarity, technical implementation/execution, creativity.** 안내문에 "문제를 얼마나 날카롭게 정의했고, 해결책이 얼마나 직접적으로 그 문제를 겨냥하는지를 본다"고 따로 적혀 있어요. 그래서 대본의 첫 20초를 문제 정의에 다 써요.
- 행사 언어는 영어. 심사위원 7명 중 4명(Rex, Circleback)은 한국어를 못 읽는다고 봐야 해요.
- 심사위원 Daniel Park은 Pickle(YC W25) 대표예요. 우리 계정 연결 카드가 Pickle 방식인 건 말로 하지 말고, 화면에서 자연스럽게 보이게만 두세요.

## 우리가 맞출 YC RFS 문장 (Max Kolysh, "AI for the Aging Population", Fall 2026)

| RFS 원문 | 영상에서 대응하는 장면 |
|---|---|
| "By 2030, one in five Americans will be over 65 … 53 million family members are already doing this work unpaid." | 장면 1 첫 문장에 그대로 인용 |
| "almost no technology is actually built for older people." | 장면 1 "isn't the tech, it's that I have to drive over" |
| "software that helps family caregivers coordinate care, appointments, and emergencies." | 장면 3(가족이 원격으로 대신 처리) + 장면 4(사기라는 emergency) |
| 같은 파트너의 또 다른 RFS "Proving You're Human": 보이스 클론·딥페이크 사기, "knowing there's a verified human on the other end of a call, a message, a transaction." | 장면 4 보이스피싱 보류 + 장면 5 ZK 기기 증명 |

---

## 장면 1 · 0:00–0:20 · 문제 (얼굴)

**화면:** 카메라 정면, 상반신. 하단 자막 띠 `c0mpiled-17 Seoul · YC RFS: AI for the Aging Population`. 10초쯤 작은 캡션 `Korea: 1 in 5 people is 65+ (since Dec 2024)`.

**말 (EN):** YC's RFS says one in five Americans will be over 65 by 2030, and 53 million family members already do the caregiving, unpaid. ⟦I'm one of them.⟧ What keeps my mom from AI isn't the tech. It's that I have to drive over and set it up.

**뜻 (KR):** YC의 RFS는 2030년이면 미국인 다섯 중 하나가 65세 이상이고, 이미 5,300만 명의 가족이 무급으로 돌봄을 하고 있다고 말합니다. 저도 그중 하나예요. 저희 엄마와 AI 사이를 막는 건 기술이 아니에요. 제가 직접 가서 설정해 드려야 한다는 거예요.

## 장면 2 · 0:20–0:32 · 해결 (얼굴 → 화면)

**화면:** 0:24쯤 컷. 아들(승빈) 화면에서 `우리 가족` 방 → `FA 초대` → `추가`. FA 인사말이 뜨는 순간까지. 구석에 작은 캡션 `KakaoTalk UI: mockup`.

**말 (EN):** So we built FA, a family AI agent that lives in the group chat our parents already use. I invite it into our family KakaoTalk room. Mom installs nothing.

**뜻 (KR):** 그래서 FA를 만들었어요. 부모님이 이미 쓰는 단톡방에 들어가 사는 가족 AI 에이전트예요. 제가 가족 카톡방에 초대하면 끝이고, 엄마는 아무것도 설치하지 않아요.

## 장면 3 · 0:32–1:00 · 데모 1: 구독 정리 (화면 녹화)

**화면 순서 (fa-kakao-demo, http://127.0.0.1:4173):**
1. 아들: `엄마 구독 좀 정리해줘` 전송
2. 아들 화면에서 엄마 전용 버튼이 잠긴 부분을 **1초 확대**
3. `보는 사람 → 엄마` → `데모 계정 연결하기` (로그인 카드) → `목록 보기 허용`
4. 아들 화면: `엄마 구독 목록 보기` → `티빙 해지 요청`. 실행 대상이 `엄마의 VM`으로 표시되는 부분 확대
5. 엄마 화면: `해지 승인하기` → FA 결과 카드가 가족톡에 올라옴

fa-engine 쪽 UI로 찍는다면: 구독 4건·월 40,090원 카드 → 왓챠·운세 선택 → 엄마 `[네, 해지해 주세요]` → `매달 17,300원 절약`. 금액은 화면에 뜨는 숫자를 그대로 두고 말로는 읽지 않아요.

**말 (EN):** I type: "Mom, let's clean up your subscriptions." Only Mom's own phone can link her account. Her password never shows up in the chat, or on my phone. FA finds the subscriptions she never uses. I pick them, and Mom gets one big button: "Yes, cancel it." One tap, done, and the whole family watched it happen.

**뜻 (KR):** "엄마 구독 좀 정리해줘"라고 보냅니다. 엄마 계정은 엄마 폰에서만 연결할 수 있어요. 비밀번호는 채팅에도, 제 폰에도 나타나지 않아요. FA가 엄마가 안 쓰는 구독을 찾아내고, 제가 고르면 엄마 폰에 큰 버튼 하나가 떠요. "네, 해지해 주세요." 한 번 누르면 끝이고, 그 과정을 온 가족이 봤어요.

## 장면 4 · 1:00–1:32 · 데모 2: 돈과 사기 (화면 녹화)

**화면 순서:**
1. 아빠 화면: `엄마의 계좌에서 50만원만 내 계좌로 옮겨줘` → 🔒 카드 (엄마 + 승빈 승인 필요, 아빠는 승인 불가). 카드 확대 2초
2. 보이스피싱: fa-trust 브라우저 예제 (`cd fa-trust && npm run serve` → http://localhost:8790/examples/browser.html)에서 `보이스피싱` 버튼 → 보류 → 가족 알림 → 증거 봉인 → 잠금 로그가 흐르는 화면. 카톡 UI에 붙였다면 그 화면으로 대체. 터미널 `npm run demo`로 찍어도 돼요.

**말 (EN):** Now, money. Dad asks FA to move 500,000 won from Mom's account to his. Locked. Money needs the owner plus one more family member, ⟦and whoever receives it can't approve it⟧. Then a "prosecutor" calls Mom: move three million won to a safe account, don't tell your family. FA holds the transfer, alerts the family, and seals the evidence. Scams win by isolation. An agent in the family chat breaks it by design.

**뜻 (KR):** 이제 돈이에요. 아빠가 FA에게 엄마 계좌에서 50만 원을 자기 계좌로 옮겨 달라고 해요. 잠깁니다. 돈은 계좌 주인에 가족 한 명이 더 승인해야 하고, 돈을 받는 사람은 승인자가 될 수 없어요. 그다음 "검사"가 엄마에게 전화해요. 300만 원을 안전계좌로 옮기고, 가족에게는 말하지 말라고. FA는 송금을 보류하고, 가족에게 알리고, 증거를 봉인해요. 사기는 고립으로 이깁니다. 가족 단톡방에 사는 에이전트는 그 고립을 구조적으로 깨요.

## 장면 5 · 1:32–1:47 · 기술 (슬라이드 1장)

**화면:** 슬라이드 1장. 왼쪽에 흐름 `LLM proposes → policy gate → owner + 1 family (2-of-3) → owner's VM → crypto-shred`, 오른쪽에 `Shamir 2-of-3 · Schnorr ZK device proof · hash-chained audit · 191 tests`. 슬라이드 대신 터미널 세 개에 `npm test` 결과를 나란히 띄워도 돼요.

완성된 슬라이드: [slide/tech-slide.png](slide/tech-slide.png) (원본 [slide/tech-slide.html](slide/tech-slide.html), 1920×1080). 191개 = main(`feafc64`, PR #12까지) 기준 fa-trust 50 + fa-engine 26 + fa-kakao-demo 24 + molla-cli 25 (네 개는 직접 돌려 확인) + molla-app 서버 66 (PR #8 설명 기준, 직접 돌리진 않음). PR #10이 머지되면 fa-trust가 52개로 늘어요. 녹화 전에 숫자가 바뀌었으면 슬라이드 HTML의 `191`과 내레이션·자막을 같이 고치고 다시 렌더해요.

**말 (EN):** Under the hood, the LLM only proposes; code decides. Session keys are split three ways, so even our server can't act alone, ⟦and task data is shredded when the job is done⟧. 191 tests, all written today.

**뜻 (KR):** 내부에서는 LLM이 제안만 하고, 실행 여부는 코드가 정해요. 세션 키는 세 조각으로 나뉘어서 저희 서버도 혼자서는 못 움직이고, 작업이 끝나면 데이터는 소멸해요. 테스트 191개, 전부 오늘 썼어요.

## 장면 6 · 1:47–2:00 · 마무리 (얼굴)

**화면:** 얼굴. 마지막 3초는 엔드카드 `FA — AI help for parents, with family guardrails` + `github.com/him55710-sudo/personal-ai-agent-for-aging-people` + 팀원 세 명 이름.

**말 (EN):** Korea lost 1.26 trillion won, almost a billion dollars, to voice phishing last year. Caring for our parents with AI starts in the family chat. FA: AI help for parents, with family guardrails.

**뜻 (KR):** 작년 한국은 보이스피싱으로 1조 2,600억 원, 거의 10억 달러를 잃었어요. AI로 부모님을 돌보는 일은 가족 단톡방에서 시작한다고 믿어요. FA, 부모님을 위한 AI, 가족이 함께 지킵니다.

---

## 분량

영어 내레이션 전체 275단어. 분당 145단어로 읽으면 1분 54초, 천천히(130단어) 읽으면 2분 7초라 그대로는 넘쳐요. 화면 녹화 위에 얹는 내레이션은 보통 145~160단어 속도가 나오지만, 리허설로 꼭 재세요.
- 리허설에서 2분을 넘기면 ⟦ ⟧ 세 문장부터 빼요 (21단어, 약 9초 → 254단어).
- 그래도 넘기면 장면 1의 "YC's RFS says"를 "By 2030,"으로 줄이고, RFS 이름은 자막 띠에만 남겨요.
- 화면 녹화는 1.25배속까지 올려도 읽히니, 말보다 화면이 늦으면 화면을 빨리 돌려요.

## 촬영·편집 순서 (제출 15:00 기준)

| 시각 | 할 일 |
|---|---|
| ~13:40 | **화면 녹화 먼저.** 데모 상태 초기화(`시연 안내 → 처음부터 다시 시연` / fa-engine은 `POST /api/reset`). 브라우저 확대 125~150%, 북마크 바 숨김, 알림 끄기. 장면 2~4를 말 없이, 천천히, 한 번에 녹화. 실수하면 그 장면만 다시 |
| ~13:55 | **얼굴 촬영.** 폰 가로, 창문 빛 마주 보고, 장면 1과 6을 각각 2테이크. 대본은 카메라 바로 아래에 |
| ~14:05 | **내레이션 녹음.** 조용한 구석에서 폰 음성 메모로 장면 2~5를 한 번에. 화면 영상을 보면서 읽으면 길이가 맞아요 |
| ~14:15 | **편집 (CapCut 또는 iMovie).** 얼굴 → 화면 → 슬라이드 → 얼굴 순으로 붙이고, 영어 자동 자막을 켠 뒤 고유명사(FA, KakaoTalk, Shamir)만 손봐요. 자막은 발음이 걱정될 때 가장 큰 보험이에요 |
| ~14:40 | 1080p로 내보내기 → YouTube 미등록(unlisted) 업로드 → 길이 **2:00 이하** 확인 → 링크를 제출 폼에 |

## 주의

- **보이스피싱 장면은 fa-trust에만 있어요.** 카톡 UI에 안 붙었으면 브라우저 예제나 터미널 데모로 찍고, 자막에 `security core demo`라고 적어요. 없는 척 UI로 흉내 내는 것보다 솔직한 쪽이 YC 심사위원에게 점수가 높아요.
- 화면에 `mockup`, `mock VM` 캡션을 작게 남겨요. SUBMISSION.md의 "What is real vs. mocked" 항목과 말이 맞아야 해요.
- 금액·구독 이름은 UI마다 달라서(티빙 vs 왓챠·운세) 말로는 읽지 않고 화면에 맡겨요.
- 한국어로 말하는 게 편하면 **뜻 (KR)** 줄을 그대로 읽고 **말 (EN)** 줄을 자막으로 넣으면 돼요. 길이는 거의 같아요.

## 영어 자막 복붙용 (장면 순서대로)

```
YC's RFS says one in five Americans will be over 65 by 2030, and 53 million family members already do the caregiving, unpaid. I'm one of them. What keeps my mom from AI isn't the tech. It's that I have to drive over and set it up.

So we built FA, a family AI agent that lives in the group chat our parents already use. I invite it into our family KakaoTalk room. Mom installs nothing.

I type: "Mom, let's clean up your subscriptions." Only Mom's own phone can link her account. Her password never shows up in the chat, or on my phone. FA finds the subscriptions she never uses. I pick them, and Mom gets one big button: "Yes, cancel it." One tap, done, and the whole family watched it happen.

Now, money. Dad asks FA to move 500,000 won from Mom's account to his. Locked. Money needs the owner plus one more family member, and whoever receives it can't approve it. Then a "prosecutor" calls Mom: move three million won to a safe account, don't tell your family. FA holds the transfer, alerts the family, and seals the evidence. Scams win by isolation. An agent in the family chat breaks it by design.

Under the hood, the LLM only proposes; code decides. Session keys are split three ways, so even our server can't act alone, and task data is shredded when the job is done. 191 tests, all written today.

Korea lost 1.26 trillion won, almost a billion dollars, to voice phishing last year. Caring for our parents with AI starts in the family chat. FA: AI help for parents, with family guardrails.
```

## 출처

- 행사 규칙·심사 기준·심사위원: [c0mpiled-17: Seoul (Luma)](https://luma.com/compiled-8lsr)
- YC RFS Fall 2026 원문: [ycombinator.com/rfs → Fall 2026](https://www.ycombinator.com/rfs?season=fall-2026) ("AI for the Aging Population", "Proving You're Human", 둘 다 Max Kolysh)
- 통계 출처는 [SUBMISSION.md](SUBMISSION.md) 하단과 같아요 (65세 이상 20.0%, 보이스피싱 피해 1조 2,578억 원).
