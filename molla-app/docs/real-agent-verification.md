# Real agent upgrade verification

Branch: `feat/real-agent-mobile-vm`. Reused the backend merged at `f7e79de`, then synchronized with main `23572ff` before the PR. Verification date: 2026-11-09.

## Implemented

- `apps/api/src/server.mjs`, `storage.mjs`, `schema.mjs`: authenticated mobile routes, expiring/revocable owner credentials, strict owner identity, separate SQLite files, TLS or trusted loopback proxy, private ACLs, rate limits, durable idempotency receipts and recovery.
- `apps/api/src/agent.mjs`, `provider.mjs`: real provider adapter, JSON Schema function calls, consented owner memory/contact lookups, finite planning loop and exact-action approval. Unsupported/fabricated tool calls stop execution. Model text cannot invoke ADB or approve a task.
- `molla-cli/runtime/lifecycle.mjs`, `lib/execute.mjs`, `runtime/{domain,phone,orchestrator}.mjs`: canonical policy/execution reuse, durable lifecycle, pre-effect permission checks, observed evidence and conservative uncertainty handling. Legacy server modules re-export this core instead of duplicating it.
- `apps/api/src/android.mjs`: real ADB executor, foreground verification, SMS recipient/body UI verification without sending, Settings-only element inspection and navigation with screen-hash checks.
- `server/cloud-vm.mjs`, `workers/cloud_manager.py`: recorded owner/session/request recovery, no unrelated-session adoption, provider deadline and cleanup confirmation, connection status polling without re-renting.
- `apps/api/src/family.mjs` and mobile `FamilyControls.tsx`: parent-issued relationship code, explicit parent acceptance, request-only helper role, parent-only task approval and revocation. Helper sees a receipt only.
- Mobile `LiveCompanionStore.tsx`, `runtime.ts`, `types.ts`, `TaskScreen.tsx`, `ProfileScreen.tsx`: exact reviewed approval hash, stable mutation IDs, lifecycle labels, device/risk display and cancellation. Existing design and 8-second polling remain.

## Automated fixtures (no external model or rented phone)

| Suite | Observed result |
| --- | --- |
| New owner API, tool adapter, Android evidence and mobile HTTP integration | 17/17 pass |
| Python Phone Harness receipt/recovery adapter | 4/4 pass |
| Existing server/policy/phone/screen tests | 66/66 pass |
| Mobile TypeScript | pass |
| Mobile HTTP runtime | 5/5 pass |
| React Native Web UI flows | 9 checks pass; mocked API, not live provider evidence |
| Mobile web export | pass |
| `fa-kakao-demo` current main | 27/27 pass |
| `fa-engine` | 26/26 pass |
| `fa-trust` current main | 52/52 pass (`node --import tsx --test test/*.test.ts`) |
| Standalone CLI on Windows | 23/25 pass, same two baseline failures: POSIX mode assertion and Windows symlink creation permission |

The Windows CLI failures were not hidden or converted into passes. The new API separately applies a private Windows directory ACL. A Linux CI workflow runs the original CLI permission/symlink tests on a platform that supports them. Until that CI completes, it is not a locally verified Linux result.

The fixture pipeline uses the actual mobile `apiRequest` implementation, real HTTP API and SQLite, plus controlled model/ADB responses. It verifies that an unapproved action cannot execute, a different owner cannot approve/read it, a changed hash is rejected, a duplicate cannot run twice, cancellation/timeout/restart never invent success, and family helpers cannot inherit parent privileges.

## Real environment

Credentials were loaded from the existing private local configuration. No API key, app token, provider session ID or ADB unlock secret is committed. Read-only account catalog confirms one saved Android profile; only mom is mapped. Dad/son remain unassigned.

User authorized an aggregate maximum of US$0.15 for this phone verification and six model calls, with no SMS sending. First attempt: actual Letsur `gpt-4.1-mini` conversation through the new owner API and mobile transport **passed**. VM was admitted, but connection diagnosis failed before app execution. The official create receipt subsequently confirmed cleanup; session history reports one minute / US$0.05. See `live/agent-upgrade-live-attempt-1.json`.

A second bounded attempt used only the remaining two-minute / US$0.10 allowance and at most five remaining model calls. The model and Phone Harness requests encountered provider/network errors (`URLError`, remote disconnect, connection timeout during read-only diagnostics). The original create receipt subsequently confirmed `released`, `cleanup_complete=true`, and no active session matching that request. Total model calls across both attempts: 2. First rental billed US$0.05; the second was capped at US$0.10, so aggregate authorized maximum was US$0.15. No further VM was created. Final observed status is recorded in `live/agent-upgrade-live-report.json`; it must not be interpreted as a passing Android demonstration.

**Scenario B (real Kakao foreground) and Scenario C (real SMS compose UI) are not verified on this upgraded backend.** Installed Kakao and a supported SMS app must be checked by the owner on a reachable VM. No live text was sent. Native APK/IPA installation, physical-phone rendering and a deployed public HTTPS endpoint were not tested. Prior legacy-server Settings demonstrations and mock screenshots do not prove these new scenarios.

## Run / finish verification

See [`apps/api/README.md`](../apps/api/README.md) for variables, credential issuance, TLS, local execution and bounded live test commands. This branch has its own `.env` and owner keys in `apps/api/.data`, separate from the original app's credentials/state. On this PC, use API port 4319 and native-web review port 4325. Parent consent is initially pending; a family member cannot enable it on their behalf.

Remaining release gates: restore reliable Phone Harness API/ADB connectivity, confirm real session cleanup when a receipt is unavailable, run B/C with a fresh explicitly approved budget, test the native installed app, configure public HTTPS, and review token delivery/rotation with the actual owners. The PR should remain draft while live Android gates are unmet.
