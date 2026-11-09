# Real agent integration plan

Initial baseline: main `ade7882`, branch `feat/real-agent-mobile-vm`. Main advanced during inspection; the branch fast-forwarded to `f7e79de` before implementation and reused the newly merged legacy backend, provider adapters, screen service and Phone Harness worker. Before PR creation, it also fast-forwarded to `23572ff`, preserving the separate FA/security/design changes and rerunning the changed suites.

1. Reuse `molla-cli/runtime/{policy,domain,memory,phone}` and `lib/{store,execute}`. Keep standalone CLI behavior. Add an explicit durable lifecycle for HTTP-created tasks and conservative recovery after uncertain external effects.
2. Add `apps/api`: expiring hashed owner credentials, per-owner SQLite, strict request validation, rate limits, durable request receipts, TLS, and owner-only mobile routes. Production has no demo login or client-selected identity.
3. Add a configurable OpenAI-compatible adapter and validated, bounded tool-call loop. Read tools expose only consented owner data. Write tools create exact reviewable tasks; the model cannot approve or execute them.
4. Add Android evidence and narrowly allowed navigation. Resolve commands from fixed server implementations. Reject changed devices/screens, login screens and unsupported actions. SMS completion means verified compose UI, never sent.
5. Connect Phone Harness through its pinned official client and documented session/receipt APIs. Recover only recorded session/request IDs, never adopt arbitrary account sessions. Quotes require explicit owner acceptance; cap session lifetime.
6. Keep mobile design and polling. Add approval hashes, lifecycle labels, visible device/risk, and cancellation while work runs.
7. Test authentication, tenancy, policy, schema validation, duplicate requests, timeouts, restart recovery, evidence and mobile transport with deterministic fixtures. Run live model/VM tests only with explicit billing approval. Distinguish all fixture tests from live evidence.
8. Document installation, environment, owner setup, limitations and real validation; open a PR.

## Initial observations

- No HTTP backend exists on main. Mobile already has a bearer-auth API contract and secure credential storage.
- CLI uses SQLite and exact-action policy fingerprints; no network dependency is required. Local draft execution is correctly distinct from verified app execution.
- CLI baseline: 23/25 pass on Windows. POSIX mode assertion and unprivileged symlink creation fail because of the host platform. Do not claim these security checks passed.
- `fa-kakao-demo`: 18/18 pass; its simulated VM is not a real execution provider and will not be wired into production.
- One saved Phone Harness Android is assigned to mom; dad/son remain unassigned. Prior request authorized setup only, not starting a paid session.

## Acceptance gates

All live task approvals bind the complete action, owner, app, device, recipient, text and risk. A started external action is never automatically retried. A cancelled/revoked action with an uncertain outcome becomes `needs_verification`. Completion requires executor evidence. Unknown model tools and invalid schema fail closed. Real account login stays with the owner.
