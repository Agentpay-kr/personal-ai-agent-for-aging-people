# Native design handoff

2026-11-09 · Supporting the main chat “노인 AI 에이전트 기획 구현”.

**Handoff update:** the main session has begun real-model/VM integration in `apps/mobile/src/services`, `ConnectScreen`, and `RuntimePanel`, and may update the shared providers/navigation next. The checks in `VERIFICATION.md` apply to the identified exported design checkpoint. Preserve the main session's subsequent changes and rerun integration checks against its final source. New `variant="display"` headings need font-subset regeneration, or should use the system-font title variant.

## Delivered

- `apps/mobile/`: independent Expo/React Native application, assets, tokens, screens, state adapter, lockfile, and verification scripts.
- `DESIGN.md`: audit, three art directions, selected Cloud Letter system, components, motion, accessibility, and source notes.
- `docs/design/directions.html`: three static direction studies, clearly labelled as studies.
- `docs/design/screenshots/`: before/after and mobile review captures.
- `docs/design/ui-report.json`, `accessibility-report.json`, `VERIFICATION.md`: evidence and practical limits.
- `scripts/capture-design.mjs`: original web-app baseline capture.

The existing `src/`, `server/`, `agent/`, workers, shared `package.json`, and root lockfile were not changed by the native design work. The copied mascot is unchanged. No user-supplied Pickle screenshots are bundled into the app or repository.

## Integration boundary

The native client shares the existing API contract, not its implementation. The current API is still a local rehearsal without production authentication. The default offline design mode is intentionally explicit. Connect a production API only after identity/session/authorization requirements are implemented by the owning server session.

Follow-up: provision the authenticated owner API, native secure session storage if token auth is selected, iOS/Android signing IDs, and device review. Keep real-time voice/transcription separate from the working Expo read-aloud control.

## Repository preparation

At inspection, neither the outer `molla ai` directory nor `molla-app` had a `.git` directory or configured Git remote. This session therefore does not invent a destination, initialize a competing repository, commit other sessions' unfinished changes, or claim a push occurred. The main session received the file ownership and handoff information with the user's explicit permission.

Preserve the existing `molla-app` root as the product repository. Its desktop web client and server already live here; the native client is neatly grouped under `apps/mobile`. Vendor/reference checkouts (`rea`, `phone-harness`, `tooling`) and `backups` are outside the product repository and should not be swept into its first commit. Include any reference manifests/license notices authored by the main session instead.

Once the main session has the intended checkout/remote and its own checks pass, this design work's explicit staging scope is:

```powershell
git add -- DESIGN.md apps/mobile docs/design scripts/capture-design.mjs
git diff --cached --stat
git diff --cached --check
```

The native `.gitignore` excludes `node_modules`, `.expo`, `dist`, `.env`, generated native folders, and build metadata. Include the native pnpm lockfile and OFL license. Main may combine this scope with its own reviewed product/server files before committing and pushing to the user's repository. No credentials, generated SQLite state, runtime logs, or `backups` should be staged.

## Review entry points

- Native development preview while Metro runs: `http://localhost:4321` (React Native Web review surface; may reflect ongoing main-session edits).
- Exported review while the local preview server runs: `http://127.0.0.1:4323` (last exported bundle).
- Device run instructions: `apps/mobile/README.md`.
- Primary screenshots: `screenshots/mobile-home-390.png`, `screenshots/mobile-chat-390.png`.
- Native source: `apps/mobile/src/screens/HomeScreen.tsx`, `ChatScreen.tsx`.
