# Yellow Buddy — native design handoff

2026-11-09. Supporting the main chat “노인 AI 에이전트 기획 구현”. The user explicitly authorized sharing responsibilities and results.

## Approval and integration status

The user approved Yellow Buddy on 2026-11-09 and requested a merge into `him55710-sudo/personal-ai-agent-for-aging-people`. This change adds the native client at `molla-app/apps/mobile`, design documentation and review evidence, alongside the existing independent `molla-cli`. The client's real-connection code is preserved. Backend deployment and provider validation remain separate from this design change.

## Current deliverable

- `DESIGN.md`: active white/yellow/black system, audit, direction choice, tokens and behavior.
- `apps/mobile/src/design/`: colors and system typography; light mode default, optional dark/system.
- `apps/mobile/src/components/CompanionHeader.tsx`: shared native header and working side menu.
- `apps/mobile/src/components/ui.tsx`: original yellow companion and shared controls.
- `apps/mobile/src/screens/`: conversation, discovery, task and profile layouts.
- `apps/mobile/src/App.tsx`: conversation first, four labelled capsule tabs, preserved authentication and owner-consent gates.
- `docs/design/screenshots/yellow/`, `yellow-review.json`: current visual evidence.
- `docs/design/archive/`: superseded Cloud Letter documents. The root-level older screenshots and `directions.html` are historical studies, not the current approved direction.

## Integration boundary

Preserved the main session's live provider, request/credential services, consent screen, connection screen, RuntimePanel, LiveControls and task execution/approval semantics. No hardcoded conversational fixture is in app runtime. The design test intercepts HTTP only in its browser context.

Navigation change: `Chat` is the default route at `/`; `Home` now means Explore at `/explore`. Existing tab IDs `nav-chat`, `nav-home`, `nav-tasks`, `nav-profile` are retained. `verify-live-ui.mjs` was adapted only for the first Chat entry; its account/auth/approval/VM/retry assertions remain.

The old font and purple asset can remain as historical project assets but are not used by the current interface. Avoid reintroducing the Cloud Letter hero or serif font from earlier screenshots.

## Repository preparation

The original shared workspace was not a Git checkout. An isolated clone of the user-specified repository was used to retain its existing CLI history. New product files live under `molla-app`, with the native package at `apps/mobile`. Reference checkouts, backups, tokens, `.env`, `.data`, dependency folders and exported bundles are excluded.

The mobile package owns its Playwright development dependency, so fixture checks no longer depend on an unpublished parent package. The preview server accepts `MOLLA_PREVIEW_PORT` for isolated review. The clean API contract describes required backend behavior without including private runtime state or chat history. Future server integration can add `molla-app/server` without moving the native client or modifying the existing CLI.

No Pickle screenshot, private key, runtime credential or generated application bundle is part of this change. Included screenshots use synthetic fixture data; previous Cloud Letter documents and screens are historical evidence.
