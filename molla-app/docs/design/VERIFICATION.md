# Yellow Buddy — design verification

2026-11-09. Supersedes the earlier Cloud Letter design checkpoint.

Repository integration: the mobile package has its own Playwright dependency and lockfile. Review can run from a fresh checkout without an unpublished parent `package.json`. The included API tests use synthetic fixtures; the API implementation is deployed independently.

## Review surface

Actual React Native Web renders at **320 × 700**, **360 × 800**, **390 × 844**, captured with Playwright/Edge. Requests are intercepted by an explicit authenticated API fixture. These are not iOS/Android simulator or physical-device screenshots, and do not prove live model or VM operation.

## Checks

- TypeScript checking and iOS/Android/web JavaScript + asset exports.
- Conversation and explore at three phone widths; no horizontal document overflow.
- Shared drawer navigation, empty requests, profile, light and dark modes.
- Category filtering, draft handoff, send and clear through the real app provider against fixture responses.
- Visible interactive geometry ≥48 × 48; 14 text token pairs ≥4.5:1 (minimum **5.07:1**).
- Existing authenticated API UI suite: bad bearer, rejected demo server, explicit AI consent, exact approval before execution, VM quote before start, retained failed drafts/retry UUID, and account isolation.
- Interactive inline preview tabs, category filtering and draft handoff.

Current machine-readable results: `yellow-review.json` and `../live/ui-contract-report.json`. Current screenshot directory: `screenshots/yellow/`. Older reports and screenshots are historical and should not be used as evidence for current screens.

## Screenshot-driven corrections

1. Replaced the cream/green serif hero with a small yellow identity and direct conversation.
2. Restored full gray assistant bubbles and aligned yellow user bubbles, removing repeated per-message avatar chrome.
3. Reduced composer height and removed duplicate bottom safe-area spacing above navigation.
4. Kept the Explore rows flat, with working categories and no fake recommendation counts.
5. Checked dark-theme yellow surfaces use black text; made selected appearance radio state explicit on the web review surface.
6. Waited for menu and theme state before capturing, so evidence shows the rendered state rather than a transition frame.

## Reproduction

From `apps/mobile`, run `pnpm typecheck`, `pnpm export`, and `pnpm preview`. With the static review server on 4323, run `node scripts/verify-live-ui.mjs` and `node scripts/verify-yellow-design.mjs`.

The optional inline preview check reads `.output/yellow-preview-check.html`, generated with the Visualize renderer from the thread's inline source. It is a local review helper, not required for the app or GitHub checkout. Skip that optional portion if the preview file is absent.

Before release, verify physical-device soft keyboard, Dynamic Type, VoiceOver/TalkBack, Android back gesture, haptics and secure credential storage on native devices. Exported Hermes bundles are not signed APK/IPA files.
