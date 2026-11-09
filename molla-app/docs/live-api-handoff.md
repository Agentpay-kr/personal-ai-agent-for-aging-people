# Mobile API contract

The current owner API is `apps/api`; see its README and `real-agent-verification.md`. All task approvals now include `expectedActionHash` from `Task.approvalHash`. Mutations carry `Idempotency-Key`; chat/family requests also carry the same stable `requestId`. The server rejects mismatches and unknown actor/owner/device fields. The older contract below describes compatible routes; the current approval hash is mandatory for execution.

Additional lifecycle states are `created`, `planned`, `approved`, `executing`, `verifying`. Completion requires verified evidence. `prepared` remains a local-text artifact only. Task actions include a safe device label and server-assessed risk; raw session IDs and ADB serials are not returned. Family invite/join/decision/request routes grant request-only access with explicit parent acceptance, never shared account administration.

The native client connects to the Molla HTTP JSON API implemented in `server/`. This repository includes its code, not provider credentials or deployed accounts. The independent `molla-cli` package does not provide these HTTP routes. See `STATUS.md` for verified boundaries and unfinished device/deployment work.

## Identity and transport

Every private request sends `Authorization: Bearer <owner-app-token>` to the exact configured HTTPS origin. Tokens identify the owner on the server; the client never sends an actor override. Native credentials use Expo SecureStore. Browser review credentials remain in memory. The owner obtains an app token from the backend operator, not from a model provider.

`GET /api/runtime` and `GET /api/state` must agree on the authenticated owner. Normal builds require `runtime.mode='live'`. An explicitly enabled recording build can accept `local-demo` only with `simulation:true` and a loopback server; it is not a production fallback. Model processing and memory sharing require separate consent.

## Endpoints

| Route | Input | Result |
| --- | --- | --- |
| `GET /api/runtime` | None | `mode`, `me`, `llm`, `phone`, `limits` |
| `GET /api/state` | None | Owner `me`, `messages`, `tasks`, `memories`, `contacts`, allowed family `members` |
| `POST /api/consent` | `{value:'active'|'revoked'}` | Owner acceptance/withdrawal |
| `POST /api/ai/consent` | `{enabled,includeMemories}` | Explicit processing choices |
| `POST /api/chat` | `{text,requestId}` | Reply and optional reviewable task; UUID deduplicates retries |
| `POST /api/preferences` | `{agentName,scopes}` | Owner preferences; `phone` scope gates Android actions |
| `POST /api/contacts` | `{name,relation,phone}` | Owner-scoped contact |
| `POST /api/task/decision` | `{id,decision:'approve'|'reject'|'cancel'}` | Applies the reviewed decision; client refreshes state |
| `POST /api/phone/quote` | `{durationMinutes}` | `{quoteId,durationMinutes,estimatedMaxUsd,expiresAt}` |
| `POST /api/phone/start` | `{quoteId}` | Explicitly accepted, owner-scoped start; no automatic retry |
| `POST /api/phone/stop` | `{}` | Stop owner's running session |
| `POST /api/phone/diagnose` | `{}` | Refresh owner's connection information |
| `GET /api/phone/screen` | None | Owner-authorized `{dataUrl,width,height,capturedAt,refreshAfterMs}` PNG; no serial/viewer credentials; no-store |

`llm` reports `enabled`, `configured`, `model`, `consented`, `includeMemories` and `ready`. `phone` reports `configured`, `state`, optional `provider`, `phoneId`, `expiresAt` and `actions`. `limits` reports `vmMaxMinutes` and `vmPricePerMinuteUsd`.

`Task.action` contains the exact `type`, `body`, `recipient`, `appId` and `execution` the person reviews. Supported execution modes are `local`, `android-compose`, and `android-app`. A successful decision POST does not establish completion: the refreshed task must include verified evidence. Draft preparation, unverified state, actual app opening and message sending must not be conflated.

## Verification

Screen capture requires active owner consent and phone scope, binds to the owner's current device, rechecks identity/permissions after capture and rate limits requests. The client polls only while its viewer is open and foregrounded; it clears failed/stale private images. This is periodic capture, not streaming video or arbitrary touch control.

Run `pnpm test:runtime`, `pnpm verify:live`, and `pnpm verify:ui` from `apps/mobile`. Runtime tests exercise a temporary local HTTP server; UI tests intercept a named test origin with synthetic data. They never require or demonstrate a real model or VM. Release integration requires backend deployment, reachable HTTPS, owner tokens, configured providers and real-device testing.
