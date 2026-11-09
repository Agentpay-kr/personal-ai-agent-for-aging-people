# Molla — Cloud Letter

Design support for the main Molla session · 2026-11-09

## Product and implementation

A personal AI companion for Korean families, including older adults. The primary job is to start a conversation and understand the next action. The character is a familiar presence, not a dashboard ornament.

The existing application is React 19 + Vite + TypeScript, with a local Node/SQLite API, Lucide icons, a lavender Molla character, and owner-scoped tasks and memories. Its phone layout has small text (some labels 6–10px), low contrast, many nested cards, and a conversation composer constrained by page chrome. The existing app remains the family-management/web reference.

**Delivery target: an actual React Native + Expo iOS/Android application in `apps/mobile`.** React Native Web is only the review surface. It is not a WebView wrapper or the native binary. Native compilation/device review is a separate verification step, requiring an Android SDK or macOS/Xcode.

Design read: a reassuring family companion with an editorial, character-led interface for iOS and Android. Dials: variance 7/10, motion 3/10, density 3/10; permission and approval screens use variance 3 and motion 2.

## References studied

- **Pickle:** five user-supplied iPhone screenshots. Principles: persistent assistant identity, conversational hierarchy, restrained chrome, lower-screen input, generous empty states, predictable peer navigation. Do not copy its green character, exact header/tab silhouettes, screen layouts, emoji categories, or very pale secondary text.
- **Muse:** [official product overview](https://ai.meta.com/muse/) and [Meta introduction](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/). Conversational entry and approachable personal assistance inform product decisions; no claim of a full authenticated UI audit.
- **Grok:** [public conversation surface](https://grok.com/) and [official overview](https://docs.x.ai/grok/overview). Sparse chrome, direct input, and strong typographic hierarchy. No copied branding or companion design.
- Native decisions checked against [React Native keyboard avoidance](https://reactnative.dev/docs/keyboardavoidingview), [native stack navigation](https://reactnavigation.org/docs/native-stack-navigator/), and [Expo safe areas](https://docs.expo.dev/versions/v58.0.0/sdk/safe-area-context/).

## Three art directions

| Direction | Material and typography | Assistant presence | Strength / tradeoff |
| --- | --- | --- | --- |
| **Cloud Letter — selected** | Porcelain grey, ink, a small warm apricot accent; Korean editorial heading + system body | Original Molla sits in a quiet oval pool of light; no purple UI gradient | Most readable and welcoming across generations; distinctive without making conversation harder |
| **Night Orbit** | Midnight blue, chalk, restrained amber; geometric sans | Small luminous character, large uninterrupted conversation field | Strong evening identity, but less approachable as the default family experience |
| **Peach Studio** | Pale peach, espresso, brighter orange; compact bold sans | Cropped character and more graphic compositions | Energetic and memorable, but feels more like a lifestyle brand than everyday assistance |

Selection criteria (designer assessment, not user research): comprehension 30%, legibility 25%, identity 25%, continuity with the main session 20%. Cloud Letter wins on comprehension and continuity. Night Orbit informs the accessible dark theme; Peach Studio contributes only a restrained warm accent.

## Tokens

Canonical implementation: `apps/mobile/src/design/tokens.ts`.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#F6F6F2` | `#191C20` |
| Surface | `#FFFFFF` | `#24282D` |
| Primary text | `#292D2A` | `#F5F5F0` |
| Secondary text | `#656A64` | `#B5BCB4` |
| Quiet surface | `#EDEFE9` | `#303630` |
| Action / on action | `#303D35` / `#FFFFFF` | `#DCE6D9` / `#202A23` |
| Accent wash | `#F1E4CD` | `#443B2D` |
| Accent ink | `#77562E` | `#E7C38E` |
| Success | `#4D6853` | `#A9CFAD` |
| Error | `#A13636` | `#FFB1AC` |
| Divider | `#DEE2D8` | `#40483F` |

Color is never the sole carrier of state. Lavender belongs to the existing character, not to global actions or gradients.

Typography: Gowun Batang Regular for short, static Korean editorial headings (SIL Open Font License, bundled as a 14,136-byte subset); platform system sans for all operational content and dynamic task titles. Heading 34/46, screen title 28/38, chat/body 17/27, action 16/24 semibold, secondary 14/21, navigation 12/18 semibold. System font scaling stays enabled; heights are minimums and text wraps. The wordmark is understated system sans with negative tracking. Update `apps/mobile/scripts/subset-font.py` when adding editorial copy.

Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48. Phone gutters 24; compact gutters 20; tablet content max width 640. Radii: control 16, message 24, sheet 28, circle/pill 999. Targets: minimum 48 × 48; primary action minimum 60 high. Native safe-area insets are measured, never hardcoded as a fake status bar.

## Component contracts

- **Companion:** existing mascot, fixed image dimensions, accessible label only where meaningful; single entrance, no endless distracting bounce. A small status label names availability/demo state.
- **Button:** primary, quiet, and destructive semantic variants; pressed, focus, disabled, loading. 48 minimum target; input stays available during transitions.
- **Home:** identity → editorial greeting → assistant → one conversation action → two useful starters. No metric cards or marketing dashboard.
- **Conversation:** full-height scrolling messages, quiet assistant typography, compact user bubbles, visible review action when a task exists, multiline composer pinned above the keyboard. New messages auto-scroll only while near the end; otherwise show a jump control.
- **Navigation:** four labelled peer destinations (home, conversation, tasks, profile), native-stack task detail, platform back handling. No hidden gesture-only actions.
- **Task review:** explicit owner and task state. Approval is manual. Demo mode creates a local draft and never claims it sent a message, booked, or paid.
- **Feedback:** real in-flight status, retained draft on request failure, retry, clear offline/error banner. Configured API failures never silently switch to the local demo.

## Motion

Press feedback 100ms; content entrance 260ms; native stack transitions owned by iOS/Android. Gentle spring: stiffness 180, damping 22, mass 1. Only transform/opacity animate. Haptic selection is limited to deliberate tab/selection events; sending gets a light impact. Haptics never block work. Reduce Motion removes entrance transforms, spring feedback, and custom navigation animation.

## Data and capability boundaries

At the design verification checkpoint, without `EXPO_PUBLIC_API_URL`, the app is an explicitly labelled offline design demo. Local scripted replies demonstrate the conversation/task workflow and are not presented as an LLM. With the URL configured, requests use the existing `/api/state`, `/api/tasks`, and `/api/task/decision` contract. Request payloads never choose an actor. The main session is now adding authenticated live-model and cloud-VM integration; its final runtime behavior and security checks supersede this design-demo adapter. See the handoff for ownership and checkpoint details.

Text-to-speech uses Expo Speech. Keyboard dictation is the honest voice-input fallback; no nonworking microphone/call button is shown. Voice transcription/real-time voice is not yet a server capability.

## Verification and handoff

See `docs/design/VERIFICATION.md` for measured results, screenshot paths, limitations, and native follow-up. Changes are isolated from the main session's server and web UI. `apps/mobile/README.md` contains launch and integration instructions; `docs/design/HANDOFF.md` lists the exact integration boundary and repository staging scope.

Skills: installed `better-design` (marvkr), `mobile-design` (RubenGlez), `frontend-design-pro` (PGraeff). The last two were read and applied, including design-system/UX searches. Better Design's dedicated MCP is unavailable; no MCP guidance/review success is claimed. Its own instructions pause that MCP workflow pending connection.
