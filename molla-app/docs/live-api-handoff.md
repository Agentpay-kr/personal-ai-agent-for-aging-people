# Mobile API contract

The native client connects to an independently deployed Molla HTTP JSON API. This mobile-design change does not publish the backend, provider credentials, a VM deployment or a working model account. The independent `molla-cli` package does not provide these HTTP routes.

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

`llm` reports `enabled`, `configured`, `model`, `consented`, `includeMemories` and `ready`. `phone` reports `configured`, `state`, optional `provider`, `phoneId`, `expiresAt` and `actions`. `limits` reports `vmMaxMinutes` and `vmPricePerMinuteUsd`.

`Task.action` contains the exact `type`, `body`, `recipient`, `appId` and `execution` the person reviews. Supported execution modes are `local`, `android-compose`, and `android-app`. A successful decision POST does not establish completion: the refreshed task must include verified evidence. Draft preparation, unverified state, actual app opening and message sending must not be conflated.

## Verification

Run `pnpm test:runtime`, `pnpm verify:live`, and `pnpm verify:ui` from `apps/mobile`. Runtime tests exercise a temporary local HTTP server; UI tests intercept a named test origin with synthetic data. They never require or demonstrate a real model or VM. Release integration requires backend deployment, reachable HTTPS, owner tokens, configured providers and real-device testing.
