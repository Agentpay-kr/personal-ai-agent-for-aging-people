# Molla — Yellow Buddy

Current mobile design · 2026-11-09. Supersedes Cloud Letter after explicit user feedback: brighter, clearer, Pickle-like interaction, yellow and black as the main colors.

## Product and stack

Molla is a Korean AI companion for individuals and families, including older adults. Conversation is the first destination. Everyday suggestions help someone start; personal actions remain reviewable.

The existing React/Vite web client and Node API stay in the product root. The app is **React Native + Expo**, in `apps/mobile`, with native stacks, bottom tabs, safe-area handling, multiline input, keyboard avoidance, haptics and Expo Speech. It is not a WebView. The main session owns API, identity, owner consent, real-model and VM integration.

Audit findings: the original web UI was dense at phone sizes. The first native Cloud Letter pass then overcorrected into an oversized editorial hero, cream/green colors and a serif heading. The user rejected that direction. The current design replaces that composition rather than merely recoloring it.

## References and directions

The user's five Pickle screenshots are the primary visual reference: white canvas, small persistent companion, generous rounded gray messages, compact top controls, floating bottom navigation, flat discovery rows, clear empty states and a side menu. Use those interaction principles while retaining original Molla naming, yellow speech-bubble character, accessible contrast and labelled navigation. No Pickle images, logo or character are shipped.

Earlier Muse/Grok reference research informed conversational entry and restrained chrome. Source notes and the original three studies remain in `docs/design/archive/CLOUD-LETTER.md`; those studies are historical, not the current specification.

| Current direction | Composition | Assessment |
| --- | --- | --- |
| **Yellow Buddy — selected** | White canvas, gray assistant bubbles, yellow user bubbles and selection, small yellow companion | Closest to the user's reference and easiest to scan; bright without filling the whole screen with color |
| Lemon Paper | White canvas, restrained yellow marks, larger typographic opening | Clear but repeats the hero-first approach the user disliked |
| Signal | Black navigation and large yellow action areas | Memorable contrast, but visually heavier and less conversational |

## Color tokens

Canonical source: `apps/mobile/src/design/tokens.ts`.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#FFFFFF` | `#171717` |
| Surface | `#FFFFFF` | `#222222` |
| Primary text | `#181818` | `#FAFAFA` |
| Secondary text | `#686868` | `#B5B5B5` |
| Quiet surface / assistant bubble | `#F4F4F4` | `#2B2B2B` |
| Brand yellow | `#FFE24A` | `#FFE24A` |
| Text on yellow | `#181818` | `#181818` |
| Primary action | `#181818` | `#FFE24A` |
| Text on primary action | `#FFFFFF` | `#181818` |
| Separator | `#EAEAEA` | `#393939` |

Default appearance is light. System and dark modes remain selectable. Yellow is a surface accent, never small text on white. Green is reserved for actual success state, red for actionable errors. No gradients.

## Typography and spacing

Use platform system sans-serif for all Korean and Latin text. The earlier serif subset is not loaded. Dynamic text scales with the platform; avoid fixed text container heights.

| Token | Size / line height | Weight |
| --- | --- | --- |
| Display | 28 / 38 | 700 |
| Title | 24 / 34 | 700 |
| Conversation | 17 / 27 | 400 |
| Action | 16 / 24 | 600 |
| Caption | 14 / 21 | 400 |
| Tab | 12 / 18 | 600 |

Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48. Screen gutters 18–24. Message padding 16 × 18; gap 12, additional gap around user turns. Minimum interactive target 48 × 48. Message radius 24, tail corner 7; controls 28, composer 32, navigation 36. Separators only divide list rows.

## Screens and components

- **Conversation** opens first after account connection and consent. Small centered yellow companion and name; working menu; latest-answer read-aloud. Gray assistant bubbles, right-aligned yellow user bubbles. Compact multiline composer with black send control. Empty suggestions insert drafts; they never send without a tap. Retain input on failure, clear on successful send, preserve scroll position while reading earlier messages, and show jump-to-latest when needed.
- **Explore** is the second tab (`HomeScreen`, `/explore`). Four icon categories filter three practical starting points. Rows hand text to the conversation composer. No invented popularity metrics or pretend task completion.
- **Requests** lists owner-scoped tasks and verified statuses. Empty state uses a quiet icon and one conversation action. Detail/approval flow remains owned by the main session.
- **My Molla** groups personal information, privacy copy, appearance, family and existing live controls. Account, consent, VM and contact functionality is preserved.
- **CompanionHeader** is shared by the four tabs. The side menu opens a real native Modal, closes with backdrop/back/close, and navigates to all four destinations.
- **Companion** is an original yellow speech-bubble face drawn with native Views. It replaces the purple image in the active interface; it is not a Pickle flower.

No microphone or phone button promises unsupported transcription/calling. The working speaker control is explicitly labelled as reading the latest answer.

## Motion and native behavior

Press feedback: 100ms target, subtle opacity, optional selection haptic. Entrance: spring stiffness 180, damping 22, mass 1, 8-point translation, only when explicitly requested. Navigation uses native default transitions. Menu uses a brief fade. Reduced-motion preference disables entrance/motion transitions. No ambient loops, bouncing mascots or typing animation that invents progress.

Safe areas belong to the header/navigation; avoid a second bottom inset above the tab bar. Tabs hide with the keyboard. Accessible labels remain on every icon action. System back, modal dismissal, adjustable text and native keyboard behavior need physical-device review before release.

## Evidence and ownership

Current screenshots: `docs/design/screenshots/yellow/`. Current reports: `docs/design/yellow-review.json` and `docs/live/ui-contract-report.json`. Review methods and limits: `docs/design/VERIFICATION.md`. Integration and repository scope: `docs/design/HANDOFF.md`.

The inline interactive preview is a design illustration with local sample content, not a running model. App screenshots are actual React Native Web renders using an intercepted, authenticated API fixture. Real model/VM validation remains separate.
