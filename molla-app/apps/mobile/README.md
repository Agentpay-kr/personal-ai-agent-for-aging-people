# Molla mobile — actual API connection

An actual React Native application for iOS and Android, built with Expo SDK 58. It does not embed the existing website in a WebView. The web target exists for convenient visual review.

This repository snapshot adds the mobile client alongside `molla-cli`. An authenticated Molla API is a separate deployment; its required contract is documented in `../../docs/live-api-handoff.md`. The repository's independent CLI is not an HTTP server. No backend or credentials are required for type checking, exporting, or the fixture UI checks below.

## Run

Requires Node 24+ and pnpm. This package has its own lockfile to avoid changing the existing web/server dependency tree.

```powershell
cd apps/mobile
pnpm install --frozen-lockfile
pnpm start
```

Open the development link in an Expo Go version supporting SDK 58, or use a development build. On the same trusted local network, use Expo's LAN mode. `pnpm android` requires an installed Android SDK/device; `pnpm ios` requires macOS and Xcode. Signing and store publishing are not configured by this design package.

```powershell
pnpm web           # React Native Web preview, port 4321
pnpm typecheck
pnpm exec expo install --check
pnpm export        # iOS/Android JS+asset bundles and web export, not IPA/APK binaries
pnpm test:runtime  # Real local HTTP transport/auth/error tests
pnpm verify:live   # Mobile UI against an explicit mocked live API contract
pnpm verify:ui     # Yellow Buddy screenshots, touch geometry, contrast and navigation
```

The mobile package declares its own Playwright dependency. Browser checks use Microsoft Edge on Windows; on other platforms run `pnpm exec playwright install chromium` once. Set `MOLLA_BROWSER_CHANNEL` to choose another installed supported browser channel. These checks use synthetic local fixtures and do not call a real model or VM. Older `verify-ui.mjs` and `verify-accessibility.mjs` files preserve the earlier design study and are not current verification entry points.

For stable review of the exported build (without development Fast Refresh): run `pnpm preview`, then set `MOLLA_PREVIEW_URL=http://127.0.0.1:4323` before the verification commands. To avoid another local session, set `MOLLA_PREVIEW_PORT` on the preview server and use the matching URL for tests. The server binds only to loopback. This is a review server, not production hosting. In an environment where npm is absent from PATH, Expo Doctor can run with `pnpm --package=npm --package=expo-doctor dlx expo-doctor`.

## Screens and behavior

- First tab: conversation, with a small original yellow companion, gray assistant bubbles and yellow user bubbles.
- Explore: flat suggestion rows, functional category filters and draft handoff to the conversation. See `../../DESIGN.md` for the current Yellow Buddy system.
- Conversation: persistent multiline draft across tabs, real submit state, retained text after failure, manual task review, read-aloud, and a jump-to-latest control when reading older messages.
- Tasks: owner-scoped pending/completed requests and native task-detail navigation.
- Connection: owner-specific app token, native SecureStore, exact server origin, no automatic demo fallback.
- Profile: light/dark/system appearance, family status, AI/memory consent, Android permission, VM quote/start/stop/diagnose, private contacts, owner consent withdrawal and disconnect.
- Native stack/back behavior, safe-area insets, keyboard avoidance, 48-point targets, dynamic text scaling, reduced motion, and discrete haptic feedback.

The voice control reads the assistant's latest answer with Expo Speech. Voice transcription is not available from the current server, so the app uses normal text input and the user's keyboard dictation; no fake call or microphone workflow is shown.

## Real connection

The default is the connection screen. No credentials means no actor, no sample conversation and no scripted AI. `EXPO_PUBLIC_API_URL` only prefills the server address; it is not authentication. The server must return `mode: 'live'` and the same owner from `/state` and `/runtime` before the app opens that person's space.

The owner enters their app token from the server's local `.data/owner-access.txt` file. Model and Phone Harness credentials stay on the server and must never be placed in the app or `EXPO_PUBLIC_*`. On native devices the token is saved with Expo SecureStore; the browser review uses memory only and requires reconnection after reload. Disconnect clears local credentials, conversations, draft text and request IDs.

`src/data/LiveCompanionStore.tsx` uses the contract in `../../docs/live-api-handoff.md`:

| Action | Request |
| --- | --- |
| Read owner space | `GET /api/state` |
| Runtime and readiness | `GET /api/runtime` |
| Send real AI request | `POST /api/chat` with `{ text, requestId }` |
| Review task | `POST /api/task/decision` with `{ id, decision }` |
| AI processing consent | `POST /api/ai/consent` with separate memory opt-in |
| Owner acceptance/withdrawal | `POST /api/consent` |
| Android permission | `POST /api/preferences` with the owner's scopes |
| VM cost preview | `POST /api/phone/quote` |
| Explicitly accepted start | `POST /api/phone/start` with a one-use quote ID |
| Stop / diagnose | `POST /api/phone/stop`, `POST /api/phone/diagnose` |

Requests use an `Authorization: Bearer` header, omit cookies, reject redirects, and never send an actor override. Failed chat retries retain the same UUID. VM start is never automatically retried. The approval screen shows exact body, recipient and app; POST acceptance is not displayed as completion. Completion without verified evidence is labelled as an unverified prior record.

Release connections require HTTPS. For a USB-connected Android development device and a local live server:

```powershell
adb reverse tcp:4318 tcp:4318
# Copy .env.example to .env, then set:
# EXPO_PUBLIC_API_URL=http://127.0.0.1:4318
# EXPO_PUBLIC_ALLOW_LOCAL_API=1
```

Native local-development cleartext policies may require a development build. The explicit local flag accepts loopback/emulator hosts, not arbitrary public HTTP. Native releases need a reachable HTTPS server. The server must explicitly allow the chosen host and browser review origins (4321/4323); authentication remains required. Live model and VM readiness depend on actual server credentials and owner consent; a successful bundle export does not verify them.

## Structure

```text
src/
  App.tsx                    Native navigation and providers
  components/ui.tsx          Text, buttons, companion, feedback
  data/                      Authenticated API state and contracts
  services/                  Request transport and platform credential storage
  design/                    Semantic tokens and theme
  screens/                   Home, conversation, tasks, task review, profile
assets/
  molla.png                  Main session's original character, unchanged
  fonts/                     Heading-only font subset and OFL license
scripts/
  verify-live-ui.mjs         Authenticated API contract UI checks (mocked API)
  runtime.test.mjs           Local HTTP transport and isolation tests
  subset-font.py             Font regeneration tool
```

Full direction, tokens, and references: `../../DESIGN.md`. Evidence and integration handoff: `../../docs/design/`.

## Font maintenance

The original Gowun Batang font is OFL licensed. Only the characters used in static editorial headings are bundled. Body text and all dynamic task titles use system fonts, with system-font fallback if loading fails. When changing editorial headings, update the text in `scripts/subset-font.py`, install Python `fonttools`, and run it. The original font package is retained for reproducible regeneration; it is not imported into runtime bundles.

## Verification limits

`docs/live/ui-contract-report.json` distinguishes mocked API verification from real providers. Historical `docs/design/` screenshots and demo scripts are design snapshots, not proof of current AI or VM calls. Native JS/asset exports have passed; native binary compilation, SecureStore/device behavior, VoiceOver/TalkBack, keyboard/safe areas, TTS and haptics still require device validation. See `../../docs/live/MOBILE-VERIFICATION.md` for current integration status.

SecureStore implementation follows the [official Expo documentation](https://docs.expo.dev/versions/latest/sdk/securestore/).
