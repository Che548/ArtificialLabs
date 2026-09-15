---
title: "Chat feedback fixes and verification"
document_id: SFERA-4796A984C4
audience: developer
status: archived
updated: 2026-09-14
baseline_commit: ea85ac93db13b81d674aefc2cbe55f67428471bf
source_scope: working-tree
---

> Архивный материал. Описанные ниже действия и результаты относятся к исходной дате и ревизии; они не являются проверкой текущей рабочей копии. Действующие контракты и команды: [текущая документация](<README.md>).

# Chat feedback fixes and verification

## Implemented

- Connectivity separates network `online/offline/unknown` and backend
  `connected/connecting/unavailable`. A working socket contradicting a failed
  OS probe is unknown, not a reason to block requests. Backend failure alone
  never means the device has no internet. Existing `isOffline/isKnown` remain.
- Chat distinguishes sign-in, cloud opt-in, loading, offline, backend/query
  errors, disabled mode, and consent. Profile/permissions navigation does not
  enable sync. Draft editing is independent of submit availability.
- Consent saves are single-flight, failures keep the draft, and standalone
  consent does not submit text. The scrollable sheet is presented inside the
  active conversation modal on iOS. Query inputs are memoized: a browser test
  caught and verified the fix for a render-loop introduced during this change.
- Keyboard-visible docks omit tab/safe-area bottom space and the disclaimer;
  message-list padding follows measured dock height. Only the active iOS
  keyboard-avoiding container is enabled. Android uses the active container's
  `height` behavior: the native test reproduced a covered composer when relying
  on window resize alone. There is no separate manual keyboard-height offset or
  native configuration change. The decorative empty state is hidden while the
  keyboard is visible, and a disabled text submission keeps the send icon instead
  of presenting a voice-input icon.

## Reproducible checks

- `npm run test:chat-feedback`: connectivity, availability, and async consent.
- `npm run test:chat-feedback:web`: actual Expo read-only chat on Chrome and
  Playwright WebKit, desktop 1280x900 and mobile viewport 390x844. WebKit is not
  an actual Safari-device test. The local DEV demonstration never authenticates
  a real account or grants cloud access.
- `.maestro/chat-keyboard.yml`: signed-in disposable account, visible composer
  with the native keyboard, draft retained across tabs, screenshot; no message
  submission. Included before the existing iOS product-surface flow and after
  successful Android sign-in. Native E2E warms each local development bundle
  before opening the client to avoid a cold Metro transform timing out.
- `npm test`, `npm run verify`, `npm --prefix admin run verify`,
  `npm run test:admin-ui`; backend and contacts checks coordinated with the
  contact-verification task, without real SMS/USSD.

## Verification record (2026-09-11)

- Focused tests: 22 passed. General `npm test`: passed.
- Final Chrome + Playwright WebKit read-only chat: 4/4 passed, desktop and mobile
  viewports. Screenshots are in ignored `output/playwright/chat-{chrome,webkit}-
  {1280,390}.png`.
- Final-source `npm_config_offline=true npm run verify` passed, including
  Expo Doctor 18/18 checks. The npm offline flag uses the cached Doctor package
  because online package resolution stalled; it does not disable Doctor checks.
  Explicit admin verify passed. Admin UI tests 6/6 and public guest `/kit`
  protection smoke passed.
- Contact integration reported by its owning task: UI 6/6 and live backend
  smoke passed with exact cleanup. Its standard 5-second crypto tests can time
  out under concurrent simulator/build load; no timeout was raised in source.
- Android read-only emulator initially failed native preflight with UI automation
  timeout. After restart, explicit ADB configuration and shutting down the
  dedicated iOS QA simulator, preflight passed. A direct-backend attempt then
  failed on emulator DNS resolution; exact disposable-account cleanup passed.
  The proxy-over-ADB attempt passed registration/onboarding but the existing
  sync-settings flow could not locate its save/sync button. Cleanup passed.
  A separate keyboard run reproduced the covered composer, prompting the
  Android `height` behavior change. A subsequent manual native check showed the
  composer and typed text above the real keyboard (intermediate screenshot:
  `output/playwright/android-keyboard-height-intermediate.png`). This screenshot
  predates the final empty-state/icon polish. Long Maestro runs stalled during
  tab navigation; no complete native keyboard E2E pass is claimed. Registration
  and onboarding passed with exact backend cleanup. Multiline, draft restoration,
  conversation overlay, and folded/unfolded checks still require verification.
- Dedicated iPhone 17 Pro simulator: native run failed before authentication.
  Screenshot shows the development bundle connection error; Metro took 168 seconds
  for its first iOS bundle. Small iPhone, background/foreground, and keyboard
  coverage are NOT claimed. A warmed-bundle retry is needed.
- Actual macOS Safari desktop read-only chat smoke passed. Mobile Safari on an
  iPhone is NOT verified; the WebKit viewport tests are not device coverage.

No email/auth implementation files or production feature flags are changed by
this patch. No OTA or store release is part of this work. Merging source into
main does not deliver these UI changes to installed native applications.

## Android follow-up (2026-09-12)

A fresh arm64 Debug package on `ArtificialLabs_API_36` passed the native
keyboard assertions and draft restoration across Profile → Chat. The screenshot
shows a two-line synthetic draft, cursor and disabled send button above Gboard;
cloud sync is off and the reason/action are visible. No message was submitted.
Evidence: `output/e2e/document-ocr-android/artifacts/2026-09-12_001541/
android-ocr-local/takeScreenshot/chat-keyboard.png`.

The Android first-launch Expo developer menu requires Back after Continue
(there is no Close button on that sheet); the runner handles that condition.
The initial SwiftShader run stalled at tab navigation; the same transition
passed using the host GPU. The read-only emulator is the only active native
device. Other screen sizes, conversation overlay and lifecycle/network scenarios
are still separate, unpassed gates. Clearing the fixed keyboard fixture now
uses its actual 72 characters rather than 1,200 native deletion events.

## Small iPhone follow-up (2026-09-12)

iPhone SE (3rd generation), iOS 26.5, run `2026-09-12_005656`: the complete
chat + OCR flow passed with exact account cleanup. Native keyboard, cursor/send
visibility, wrapped input, Home → foreground without restart and draft retention
across tabs passed. `chat-keyboard.png` and `chat-without-keyboard.png` are under
that run in `output/e2e/document-ocr-ios/artifacts/…/ios-ocr-local/takeScreenshot/`.
The latter confirms both disclaimer lines are above the floating tabs.

Fixes found by this device: measured available space now suppresses a decorative
hero that overlapped suggestions; the closed-keyboard iOS inset clears floating
tabs even without a home-indicator inset. Tests cover both geometry decisions.
The iOS input accessible name includes its placeholder, so the selector accepts
that suffix. Generic `hideKeyboard` tapped the settings action on this layout;
the flow now taps the visible Chat header, checks tab/draft visibility, then
tests background/foreground. This is a test correction, not lost-draft recovery.
The ordinary iPhone 17 Pro also passed that final full flow in run
`2026-09-12_010134`; native keyboard screenshots were visually inspected on both
iPhone sizes. Exact cleanup passed and both simulators were shut down.

## Consolidated native status (2026-09-12)

- iPhone SE and iPhone 17 Pro: keyboard, wrapped draft, foreground return,
  tab navigation, two-page native OCR and SQLCipher draft save/reopen passed.
- Android phone: the same final UI flow passed, including foreground return.
- Pixel Fold open (`2026-09-12_002422`) and closed
  (`2026-09-12_003300`): keyboard/composer visibility, tab draft retention and
  OCR save/reopen passed. These runs preceded the later sticky document Close
  button and lifecycle assertions. The wide-screen fixture fit on one line;
  it is not evidence for multiline entry on an unfolded Fold.
- The Fold run exposed onboarding vertical spacing based on unbounded screen
  width. A bounded layout now reserves scrollable input space on wide/short
  screens. Pure layout tests cover those constraints.
- The small iPhone exposed a document Close action that scrolled out of view.
  Close now stays outside the document scroll area, within the safe area.
- `test:chat-feedback` now has 26 passing tests. Full `npm test`, root verify
  (including admin verify), Chrome/WebKit 4/4 and admin UI 6/6 passed after
  the UI fixes. Actual desktop Safari read-only smoke passed separately.

Still unverified: conversation-overlay/history keyboard scenarios, network
loss/recovery on native, changing Fold state while editing, and the new full
process-restart OCR assertion on iOS. Android passed the latter in run
`2026-09-12_013056`: the Profile tab now uses its explicit accessibility ID,
and the stored draft survived process restart. Native OCR matrices passed
48/48 on both platforms (see `document-ocr.md`);
successful two-page UI OCR is not a substitute for its malformed-file, rotation,
limit and cancellation checks. No clinical accuracy claim is made.
