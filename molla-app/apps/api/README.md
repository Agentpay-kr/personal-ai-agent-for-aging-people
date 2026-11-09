# Molla owner API

The live mobile backend. It imports the **same** `molla-cli` policy, domain, memory, SQLite store and execution core. `molla-app/server` re-exports those modules for legacy compatibility. The older demo server and `fa-kakao-demo` simulations are separate; they are never an execution fallback.

## Run locally

Node 24+, pnpm, and Python 3.10+ for Phone Harness. From the repository:

```powershell
cd molla-app/apps/api
pnpm install --frozen-lockfile
Copy-Item .env.example .env
# Fill provider settings in this server-only file.
pnpm owner issue mom 엄마
pnpm owner issue dad 아빠
pnpm owner issue son 자녀
pnpm start
```

The operator issues each owner a separate 256-bit credential; only its SHA-256 hash and 30-day expiry enter `owners.json`. Issuing a replacement revokes previous keys for that owner. `pnpm owner revoke mom` revokes all mom credentials. Raw keys are stored only in private `.data/<owner>-access.txt` for direct delivery to that owner, never a URL/family chat. API keys are not app credentials. Windows uses a private directory ACL; Unix uses mode 0700/0600. The API has no demo login or cookie fallback.

Then in `../mobile`: `pnpm install --frozen-lockfile`, `pnpm start`. Enter the API HTTPS origin and that owner's app key. Development HTTP is allowed only for loopback (`localhost`, `127.0.0.1`, Android emulator `10.0.2.2`). Native public/LAN builds require HTTPS. Owner acceptance, AI processing, memory use by AI, Android permission, VM cost acceptance and individual task approval are distinct decisions.

## Environment

| Variable | Purpose |
| --- | --- |
| `MOLLA_ENV=development` | Explicit loopback HTTP; omit for production |
| `MOLLA_HOST`, `PORT` | Default `127.0.0.1:4319` |
| `MOLLA_TLS_CERT`, `MOLLA_TLS_KEY` | Direct HTTPS with PEM files |
| `MOLLA_TRUST_LOOPBACK_PROXY=1` | Alternative: HTTPS proxy on same host, API bound only to loopback; proxy replaces forwarded headers |
| `MOLLA_ALLOWED_HOSTS`, `MOLLA_ALLOWED_ORIGINS` | Exact host/CORS allowlists; no wildcard credentials |
| `MOLLA_API_DATA_DIR`, `MOLLA_API_AUTH_FILE` | Private storage/auth paths; defaults inside this package's `.data` |
| `MOLLA_LLM_PROVIDER` | `openai-compatible`, `letsur`, or `vercel`; no automatic provider fallback |
| `MOLLA_LLM_BASE_URL`, `MOLLA_LLM_API_KEY`, `MOLLA_LLM_MODEL` | Generic compatible endpoint/key/model with function calling |
| `LETSUR_API_KEY`, `LETSUR_MODEL` | Letsur preset, official `https://gw.letsur.ai/v1` |
| `AI_GATEWAY_API_KEY`, `MOLLA_MODEL` | Vercel compatible preset |
| `MOLLA_LLM_ENABLED=1`, `MOLLA_LLM_TIMEOUT_MS` | Enable inference; default 40-second overall turn deadline |
| `MOLLA_LLM_DAILY_REQUEST_LIMIT` | Per-owner rolling 24-hour request limit, default 40; max six model turns/request |
| `MOLLA_RATE_PER_MINUTE` | Persistent per-owner HTTP limit, default 120 |
| `MOLLA_ADB` | Absolute path to official Android Platform Tools |
| `MOLLA_ALLOW_ANDROID_APPS/COMPOSE/UI=1` | Enable corresponding executors, still subject to owner policy |
| `MOLLA_PHONE_BINDINGS` | Optional unique local ADB bindings, JSON by owner |
| `MOLLA_CLOUD_BINDINGS` or `MOLLA_CLOUD_BINDINGS_FILE` | Unique saved Phone Harness profiles by owner |
| `MOLLA_PHONE_HARNESS_PATH`, `PHONE_HARNESS_HOME` | Pinned official client checkout and private operator login directory |
| `MOLLA_VM_MAX_MINUTES` | 1–5 minute cap; quote shown before each paid start |

Phone Harness setup: run `node ../../scripts/setup-phone-harness.mjs`, install its documented Python requirements and official ADB, then log in directly through `../../scripts/phone-cloud.ps1`. Use `../../scripts/cloud-bind.mjs` to assign an actual saved profile. This account currently has one saved Android, assigned to mom. Dad/son have their own app identities but no VM. No public profile-creation API is assumed. Phone login/password/OTP stays with the account owner.

## Contracts and guarantees

All `/api/*` calls require a server-verified bearer credential. The request cannot choose actor, owner, serial, session, tool command or policy. Each owner's personal state is in a separate SQLite database. `family-links.sqlite` contains relationship metadata only. One API process owns a data directory; horizontal scaling requires a coordinated execution queue/lease service and is intentionally refused by the process lock.

GET `/runtime`, `/state`, `/phone/screen`. POST `/chat`, `/consent`, `/ai/consent`, `/preferences`, `/task/decision`, `/contacts`, `/phone/quote`, `/phone/start`, `/phone/stop`, `/phone/diagnose`. Additional owner memory/contact deletion routes and family invite/join/decision/request routes are implemented.

Send `Idempotency-Key` on mutations. `/chat` and `/family/request` require a stable `requestId`; if both identifiers are provided they must match. Durable receipts never replay interrupted calls. Task approval additionally requires `expectedActionHash` from the reviewed task. Contact duplicates are deduplicated. VM start consumes a policy-bound quote once. There are no automatic retries of model calls, VM creation or device actions. Read-only VM status polling can recover a connection; it cannot rent another VM.

API-created task lifecycle: `created → planned → awaiting_approval → approved → executing → verifying → completed`. Rejection, cancellation, failure and uncertain outcomes are distinct. Verified local drafts finish as `prepared` (legacy-compatible, not an external completion). Restart recovery never executes approved/started tasks. Mid-effect cancellation or missing evidence leaves `needs_verification`. Approvals bind owner/requester/content/recipient/app/device/risk and expire after five minutes.

Tools use strict JSON Schema and a server allowlist. Reads: `memory.search` (separate memory consent), `contact.lookup` (no phone numbers sent to the model). Writes are plans only: `memory.remember`, `phone.app.open`, `phone.sms.compose`, `phone.screen.inspect`, `phone.navigation.step`; the owner must approve. A local draft tool explicitly prepares shopping/calendar text only. Unsupported tools fail closed. Financial transactions, payments, ordering, message sending and subscription cancellation are not implemented.

App opening verifies the foreground package. SMS completion requires a supported SMS app plus exact recipient digits and body visible in the UI; otherwise it remains uncertain. It **never presses Send**. UI navigation currently supports only Settings search controls and list scrolling from a freshly inspected, unchanged screen. Arbitrary taps/coordinates/shell, login screens, password fields and OTP capture are rejected. These narrow capabilities are intentional, not a general phone-control claim.

## Family ownership

The parent generates a 10-minute, one-use **relationship code**. The helper claims it; the parent then explicitly accepts request-only access in their own app. Linking does not share memory, contacts, conversations, credentials or results. Family requests are planned in the parent's private store, and the helper receives only a receipt. Only the parent can approve that exact plan. Revocation immediately blocks new requests and cancels pending ones. This live path does not inherit the simulated finance/subscription actions in the FA demos.

## Verification

```powershell
pnpm test                         # fixtures only, no billing
python tests/cloud_worker_test.py # receipt/cleanup API fixtures
```

Live tests are separate and need explicit authorization. `scripts/verify-live.mjs --android` uses actual model requests and a saved VM, ephemeral private owner state and the mobile HTTP client. It requires `MOLLA_CONFIRM_LIVE_MODEL_CALLS` (1..6), `MOLLA_VERIFY_VM_MINUTES` (1..3), and matching `MOLLA_CONFIRM_VM_MAX_USD`. Keep a cumulative budget across attempts. It opens Kakao if installed, prepares an SMS to a reserved fictional test number, never sends, and requests shutdown in `finally` and a watchdog. The provider's deadline limits the rental even if this process dies. It does not prove APK/IPA rendering or a public HTTPS deployment.

See [upgrade verification](../../docs/real-agent-verification.md) for observed results and remaining work. Never copy a fixture result into a live success claim. Installing/login to Kakao and SMS app availability are owner/environment prerequisites.

Protocol references: [Letsur tool calls](https://docs.platform.letsur.ai/ai-gateway/api-reference/endpoints/chat-completions), [Phone Harness session creation](https://phone-harness.com/docs/api-reference/sessions/create-session), [durable create receipts](https://phone-harness.com/docs/api-reference/sessions/recover-create-request). Client pin: `4bebff105af853215fb74c958c2c5e78bc275be2`.
