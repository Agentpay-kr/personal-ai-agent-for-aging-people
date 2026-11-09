# Cloud Letter — design verification

2026-11-09 · Design handoff checkpoint. This report concerns the exported design demo. The main session is subsequently adding authenticated AI/VM integration; that work needs its own updated end-to-end checks.

## Evidence

| Check | Observed result |
| --- | --- |
| TypeScript | `pnpm typecheck` passed |
| Expo dependency compatibility | `expo install --check`: dependencies up to date |
| Expo Doctor | **20/20 passed**; run with an npm-equipped ephemeral tool environment because this host does not expose npm on PATH |
| Native/web bundle generation | `expo export --platform all`: iOS, Android, and web passed |
| Primary interaction | Home → conversation → send → review → manually approve → local draft passed |
| Alternative actions | Reject request and cancel destructive reset passed |
| Navigation continuity | Tabs preserve the current document; no full-page reload |
| Persistence | Sent demo conversation and task state survive reload |
| Layout | 360×800, 375×667, 390×844, 844×390 landscape, 820×1180 tablet reviewed; no document horizontal overflow |
| Input | Empty, disabled, multiline/long draft, send and clear verified |
| Theme | Light and dark home/conversation screenshots reviewed |
| Text contrast | All **18** token foreground/background pairs exceed 4.5:1; lowest **5.10:1** |
| Touch geometry | Visible measured buttons on home, chat, review, profile are at least **48×48 CSS pixels** |
| Keyboard | Focus and Enter activation verified in the browser |
| Motion preference | Screens exercised with `prefers-reduced-motion: reduce` |
| Runtime errors | No page errors in the final UI suite |

Machine-readable evidence: `ui-report.json` and `accessibility-report.json`. There are 20 PNGs including the before screens and direction board. These are real React Native Web renders captured with Playwright/Edge, **not native simulator or physical-device screenshots**.

Final reviewed web bundle:

```text
index-2edd283de7188a1fc4c2d62ab937b1d6.js
SHA-256: BA10FE2AC8CDF8F234FEA2C0A185B9D6602B16CB217338135396CE642A27BB28
```

Generated bundles remain excluded from Git; the hash identifies the design checkpoint, not every later edit from the main session.

## Screenshot review and resulting fixes

1. Original mobile web: very small pale labels, several nested cards, constrained chat region. The native version replaces this with an editorial home, an open conversation surface, and readable 17/27 body text.
2. First native pass: disclosure was below the fold; moved it beneath the main action. The empty composer was too tall; it now starts compact and grows for multiline text.
3. First native pass: selected tab backgrounds appeared rectangular; corrected the control clipping/radius.
4. Compact chat review: preserve the latest message when the available list area changes; added layout-aware scrolling while respecting users reading older messages.
5. Functional regression from the custom tab button: web anchors reloaded the document. Corrected web default-link handling and added a continuity assertion.
6. Measured accessibility review: the default review-header back button had a 30×30 web target and an English label. Replaced it with the shared 48×48 button and Korean accessible name.
7. Bundle review: the original font barrel included unused large fonts. The delivered heading-only OFL subset is 14,136 bytes; dynamic text uses system fonts.

## Representative captures

- `screenshots/mobile-home-390.png`
- `screenshots/mobile-chat-390.png`
- `screenshots/mobile-chat-empty-390.png`
- `screenshots/mobile-chat-dark-390.png`
- `screenshots/mobile-home-dark-390.png`
- `screenshots/mobile-chat-long-draft.png`
- `screenshots/mobile-task-review-390.png`
- `screenshots/mobile-profile-390.png`
- `screenshots/art-directions.png` (clearly labelled static art-direction study)

Five-second comprehension assessment: the home shows the companion, one primary conversation action, and two useful starters. Chat exposes the assistant, the transcript, and the next input. Task review names the request, owner, decision, and non-execution boundary. This is a designer assessment; no user research is claimed.

## Not verified here

- APK/IPA compilation, signing, store submission, physical device installation.
- Native keyboard behavior, native safe-area rendering, Android hardware/predictive back and iOS swipe-back execution.
- Native Dynamic Type at maximum sizes, VoiceOver/TalkBack and switch access.
- Actual TTS audio, haptic hardware, or sustained frame-rate profiling.
- Authenticated backend cookies/keys, real model streaming, cloud VM execution, or production data isolation. The main session owns live integration.
- Better Design MCP review: the requested skill was installed, but its dedicated tools were not connected. No MCP check is claimed.

The source contains native safe-area, keyboard, accessibility and reduced-motion support. These code paths and successful JS/asset exports are evidence of implementation, not substitutes for the device checks above.

## Reproduce the design checkpoint

From `apps/mobile`, after exporting the design/demo source and starting `pnpm preview`:

```powershell
$env:MOLLA_PREVIEW_URL = 'http://127.0.0.1:4323'
pnpm verify:ui
pnpm verify:a11y
```

The UI scripts intentionally exercise the labelled design demo. If the main session changes default boot to authenticated connection, retain these as a demo fixture suite and add a separate live connection suite rather than weakening authentication to satisfy screenshots.
