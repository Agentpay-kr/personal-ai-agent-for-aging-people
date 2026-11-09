# 제출용 초안: FA (Family Agent)

구글폼(13:30 도착)에 붙여넣을 설명문, GitHub README 첫 화면, 90초 영상 영어 자막 초안이에요.
`[ ]` 부분만 팀 상황에 맞게 채우세요.

- **영어를 기본으로** 썼어요. 심사가 "YC 파트너가 지원서를 보듯이" 진행돼서 영어로 읽힐 가능성이 높아요. 한국어판도 같이 넣었어요.
- **실제로 만든 것만** 적었어요. UI에 빠진 기능이 있으면 그 문장은 지우세요. 데모에서 흉내만 낸 부분(카톡 연동, VM 실행)은 그렇다고 밝히는 편이 YC 심사에서 더 신뢰를 얻어요.

---

## 0. 한 줄 소개 (50자 이내)

| 후보 | 글자 수 |
|---|---|
| **AI help for parents, with family guardrails** | 43 |
| An AI agent the whole family shares | 35 |
| A family AI agent that stops voice phishing | 43 |

한국어: **가족 단톡방에 사는 AI 비서** / 부모님 AI, 가족이 함께 지킨다

---

## 1. 구글폼 "Short project description"

### 1-A. 영어 (약 140단어) ← 기본으로 이걸 쓰세요

> **FA is a family AI agent that lives in the group chat parents already use.** Today, getting a parent over 60 to use an AI agent means driving over and setting it up in person. With FA, the son invites the agent into the family KakaoTalk chat. Mom logs in on her own phone with a one-tap card, and FA handles real chores, like finding and canceling forgotten subscriptions, once she approves.
>
> The hard part is trust, so we built that first. Code, not the LLM, decides what runs: risky or irreversible actions need two of three family approvals, session keys are split so even our server can't act alone, and task data self-destructs. Scams win by isolating the victim ("don't tell your family"). When a fake prosecutor tells Mom to wire ₩3M to a "safe account," FA holds it, alerts the family, seals the evidence, and locks down. Korea lost ₩1.26T (~US$0.9B) to voice phishing in 2025.

### 1-B. 영어 짧은 버전 (약 60단어, 글자 수 제한이 있을 때)

> FA is a family AI agent inside the parents' group chat. Kids help parents use AI remotely: Mom logs in on her own phone, and FA cancels her forgotten subscriptions with one tap from her. Our security core makes it safe: 2-of-3 family approvals, keys even our server can't use alone, self-destructing data, and voice-phishing holds that alert the whole family.

### 1-C. 한국어

> **FA는 부모님이 이미 쓰는 단톡방에 들어가는 '가족 AI 에이전트'예요.** 지금은 60대 부모님이 AI를 쓰시게 하려면 자식이 직접 찾아가서 설정해 드려야 해요. FA는 아들이 가족 카톡방에 초대하면 끝이에요. 엄마는 자기 폰에서 카드 한 장으로 로그인하고, 그 뒤로는 잊고 있던 구독 해지 같은 일을 엄마의 원탭 승인으로 처리해요.
>
> 핵심은 신뢰라서 그것부터 만들었어요. 실행 여부는 LLM이 아니라 코드가 정해요. 위험하거나 되돌릴 수 없는 일은 가족 3명 중 2명이 승인해야 하고, 세션 열쇠는 3조각으로 나뉘어 저희 서버도 혼자서는 못 열고, 작업 데이터는 끝나면 소멸해요. 보이스피싱은 "가족에게 말하지 마세요"로 피해자를 고립시켜요. 가짜 검사가 "안전계좌로 300만 원 옮기라"고 하면 FA는 송금을 보류하고, 가족에게 알리고, 증거를 봉인한 뒤 잠가요. 2025년 국내 보이스피싱 피해액은 1조 2,578억 원이었어요.

---

## 2. GitHub README 첫 화면 (YC 지원서 형식)

```markdown
# FA: AI help for parents, with family guardrails

FA is a family AI agent that lives in the group chat parents already use (KakaoTalk).
An AI-native family member helps Mom or Dad use AI remotely, and every risky step is
visible to the family and gated by cryptography, not by the LLM's judgment.

## The problem
- 10.24M Koreans are 65+ (20.0%); Korea became a super-aged society in Dec 2024.
  Parents need the most help with digital life, but they can't set up AI agents alone.
  Help today means an in-person visit.
- Parents are also the main target of scams: ₩1.26T (~US$0.9B) was lost to voice phishing
  in 2025 (+47% YoY), 78.6% of it through fake-authority calls.

## Our insight
1. **The unit is the family, not the person.** Personal agents assume one tech-savvy owner.
   Parents need a family member to help remotely, inside the messenger they already use
   (KakaoTalk: ~48M monthly users in a country of 51M).
2. **Scams run on isolation.** Fake prosecutors tell victims to keep it secret.
   An agent that sits in the family chat breaks that isolation by design.
3. **Trust is the bottleneck, not capability.** Nobody hands an agent their accounts unless
   no single party (not a family member, not a hacker, not us) can misuse it.

## How it works
- KakaoTalk-style family group chat with FA (mockup; a real Kakao integration needs a partnership).
- Secure login card: the owner logs in on their own phone. Only a session token reaches FA;
  passwords are never stored.
- **fa-trust**, our security core (`fa-trust/`):
  - **Policy gate:** the LLM proposes, code decides. An LLM risk score can only raise risk.
    Reads run automatically, small reversible actions need the owner's tap, money moves and
    irreversible actions need the owner plus one family member (2-of-3), and loans, gift cards,
    remote-control apps and sharing ID/OTP are never executed.
  - **Korean scam signals:** fake authorities, "safe accounts", secrecy demands,
    child impersonation, gift cards, remote-control apps.
  - **Zero-knowledge device proofs (Schnorr):** an impostor texting from a new number cannot approve.
  - **2-of-3 key custody (Shamir):** owner's phone / FA server / guardian. Neither our server
    nor the guardian alone can open a session.
  - **Hierarchical family keys** adapted from a 2021 CBDC key-management design (KNOM 2021):
    leaving the chat re-keys the family.
  - **Crypto-shredding:** each task runs in a throwaway workspace whose keys are deleted
    when it ends; linked sessions expire after 30 days.
  - **Evidence sealing:** scam attempts are never auto-deleted. They are sealed under a
    2-of-3 family key, with a hash-chained audit log.
  - 30 tests, a terminal demo (`npm run demo`) and a browser example.

## Why now
- Agents can finally operate real accounts (browser / VM agents).
- Korea just became super-aged, and scam losses hit a new high.
- Korea already offers anti-fraud locks that FA can help parents turn on
  (loan lock since Aug 2024, non-face-to-face account-opening lock since Mar 2025).

## Market and business model
- Start with Korean families with parents 60+ (10M+ seniors, nearly all on KakaoTalk),
  then LINE markets (Japan, Taiwan, Thailand): aging, messenger-native Asia.
- Hypothesis: a family subscription paid by the adult child, plus B2B2C with banks,
  telcos and insurers who pay for fraud losses today.

## Competition
- Personal AI agents: one user, no family graph, no delegated authority.
- Senior-care apps and devices: they monitor; they don't get things done.
- Bank fraud detection: sees the transaction, not the conversation or the family.
- FA combines the family graph, the chat context and cryptographic delegation.

## What is real vs. mocked in this demo
- Real: the fa-trust security core (all crypto, policy decisions, scam detection). [LLM agent: 붙었으면 여기로]
- Mocked: KakaoTalk UI, actions inside the parent's VM (simulated). Bank transfers are never
  executed in v1: FA only holds, verifies and alerts.

## Team
- 백승빈 [English name]: security & cryptography. Built fa-trust.
- 이승준 [English name]: [product & UX — 확인]
- 임현수 [English name]: [역할]
```

---

## 3. 90초 영상: 영어 자막 (화면은 한국어 UI 그대로)

| 시간 | 화면 | 영어 자막 |
|---|---|---|
| 0–10초 | 문제 제기 | Korea became a super-aged society in 2024: 1 in 5 people is 65+. Getting Mom onto AI still means driving to her house. |
| 10–25초 | 아들이 '우리 가족' 단톡방을 만들고 엄마·아빠·FA 초대 | Meet FA, a family AI agent that lives in the family group chat. |
| 25–40초 | 엄마 폰에 로그인 카드 → 아들 화면엔 ✅만 | Mom logs in on her own phone. Her son never sees the password, and the session key is split three ways. |
| 40–55초 | 구독 정리 → 엄마 원탭 → 🔥 소멸 | "Cancel Mom's unused subscriptions." Mom taps once: two of three family keys. Done, and the task data self-destructs. |
| 55–75초 | 보이스피싱 보류 → 아들 "사기야" → 🔒 잠금 | A fake prosecutor tells Mom to move ₩3M to a "safe account" and keep it secret. FA holds it, tells the family, seals the evidence and locks everything. |
| 75–90초 | 마무리 | Scams win through isolation. FA breaks it. Korea lost ₩1.26 trillion to voice phishing last year. FA: AI help for parents, with family guardrails. |

---

## 4. 제출 전 체크리스트

- [ ] 3명 모두 체크인했고 현장에 있음 (아니면 실격)
- [ ] 영상 90초 이하 + 영어 자막
- [ ] GitHub README 첫 화면을 2번 내용으로 교체, 실행 방법 포함
- [ ] 13:30 구글폼이 오면 1번 설명부터 붙여넣기
- [ ] 14:15 기능 동결, 15:00 전에 제출
- [ ] GStack/GBrain을 썼다면 README에 한 줄 추가 (트랙 상금 $500)

---

## 출처

- 행정안전부 발표: 65세 이상 1,024만 4,550명, 20.0% (2024.12.23 기준), [뉴시스](https://www.newsis.com/view/NISX20241224_0003009655)
- 2025년 보이스피싱 피해액 1조 2,578억 원(+47.2%), 기관사칭형 78.6%: 국회의원실의 경찰청 자료 분석, [아이뉴스24](https://www.inews24.com/view/2008688) · 연간 1조 원 첫 돌파, [Korea Herald](https://www.koreaherald.com/article/10631462)
- 카카오톡 MAU 4,797만 명 (와이즈앱·리테일, 2025년 10월), [한국경제](https://www.hankyung.com/article/202511180069g)
- 여신거래 안심차단(2024.8)·비대면 계좌개설 안심차단(2025.3.12), [금융위원회](https://www.fsc.go.kr/edu/news/84142)
- 한정수 외, 「블록체인 기반 CBDC 아키텍처 및 트랜잭션 키 관리 시스템 설계」, KNOM Conf. 2021
