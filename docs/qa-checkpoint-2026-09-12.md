# QA checkpoint — 2026-09-12

This is a partial verification checkpoint, not release approval.

## Fixed verification blockers

- Dedicated signed iOS simulator package: no production OTA signature bypass;
  valid Keychain entitlements for local encrypted storage.
- Android OCR build honors the requested local arm64 architecture. Default
  store architecture coverage is not silently reduced.
- One dedicated device at a time; explicit ADB path, local backend proxy,
  warmed Metro launch asset, exact disposable-account and fixture cleanup.
- First-launch developer-menu handling and scrollable onboarding on short,
  wide Fold windows. Fold state changes explicitly wake the test display.
- iOS accessible composer name and safe keyboard dismissal in the test.
- Inspector OCR matrix lowers async syntax before Hermes evaluation. Its
  regression test does not depend on a running device.
- Android Profile navigation uses the tab's ID instead of matching page text
  in the full process-restart scenario. The initial restart attempt failed at
  navigation and is not evidence of lost or restored OCR data.

## Confirmed checks

| Target | Passed | Not established by that run |
| --- | --- | --- |
| Android arm64 phone | Native keyboard, wrapped draft, background/foreground, tab retention, two-page OCR, draft save/reopen **and full process-restart restoration** | Conversation overlay and network loss/recovery |
| Pixel Fold open | Native split keyboard, composer visibility, tab retention, OCR save/reopen | Wide-screen multiline, changing posture while editing; latest lifecycle assertion |
| Pixel Fold closed | Native keyboard, wrapped draft, tab retention, OCR save/reopen | Changing posture while editing; latest lifecycle assertion |
| iPhone SE 3 / iOS 26.5 | Native keyboard, wrapped draft, background/foreground, tab retention, OCR save/reopen; no hero/disclaimer overlap | Full process restart; conversation overlay |
| iPhone 17 Pro / iOS 26.5 | Same main-screen flow and OCR save/reopen | Full process restart; conversation overlay |
| Android native OCR engine | 48/48 synthetic checks | Clinical accuracy, remaining store ABIs |
| iOS native OCR engine | 48/48 synthetic checks | Clinical accuracy, physical-device camera capture |
| Chrome + Playwright WebKit | 4/4 read-only chat checks, desktop/mobile viewports | Native keyboard or physical mobile Safari |
| Actual macOS Safari | Read-only desktop chat smoke | Physical mobile Safari |
| Admin UI | 6/6 checks; earlier guest `/kit` protection smoke | New interpretation API live deployment |

Both native OCR matrices cover PDF/JPEG/PNG, Russian and English words, decimal
tokens and units, 20 sequential pages, rotation, rejected malformed/password/
oversized/21-page/unsupported/remote sources, bounded poor-quality output,
cancellation, and engine reuse. They return only safe boolean metadata.

After the inspector fix, `npm test` and `npm run verify` passed again. Root
verify includes `npm --prefix admin run verify`; Expo Doctor passed 18/18.
`git diff --check` passed. No test triggered SMS or USSD.

## Private evidence

All paths below are relative to the repository and ignored, synthetic-only:

- `output/e2e/document-ocr-android/native-matrix.json`
- `output/e2e/document-ocr-ios/native-matrix.json`
- Android phone final pre-restart UI: artifacts run `2026-09-12_010716`.
- Android full restart passed after the tab-selector fix: run
  `2026-09-12_013056`, `document-ocr-after-process-restart.png`. The same
  SQLCipher draft and numeric tokens were visible after killing/relaunching
  the process. Exact account cleanup passed; the emulator was shut down.
- Fold open/closed: artifacts runs `2026-09-12_002422` / `2026-09-12_003300`.
- iPhone SE / ordinary iPhone: runs `2026-09-12_005656` / `2026-09-12_010134`.
- Screenshots live below each run's `takeScreenshot/` directory.

Do not publish raw private runner logs; they may include disposable credentials.

## Remaining release gates

- iOS cold-start restoration, conversation-overlay/history keyboard,
  dynamic Fold posture changes, native network loss/recovery.
- Recheck the new in-app feedback and history rename on both native platforms.
- Remaining privacy/ownership and new interpretation API live checks on an
  isolated deployment; the new server feature remains disabled.
- Final diff review and coordination with the parallel authentication work,
  thematic commits, push, Actions and deployed admin/Convex verification.

No commit or main push was made for this checkpoint. No OTA, store release,
production OCR interpretation enablement or Apple submission change occurred.

## Follow-up: feedback, overlay and transport checks

- Replaced the modified chat/analyses screens' legacy blocking dialogs with
  in-screen feedback; asynchronous failures preserve the edit and offer retry.
- Android run `2026-09-12_020240` passed focused overlay input, long wrapped
  text, attachment feedback and background/foreground draft retention. It then
  failed finding the visible history rename action. The popup extended beyond
  its 44px parent row. The row now reserves the popup bounds; native retest is
  still required. This run is **not** an overall pass.
- Split native QA into independently bounded phases. Synthetic proxy faults
  affect only the local QA transport, never the deployed backend. These checks
  must not be described as system airplane-mode coverage.
- Removed the E2E-only connectivity-policy branch. Tests exercise the same
  connection policy as normal clients.
- Fresh Chrome/WebKit read-only feedback checks passed 4/4 after stopping the
  exact stale test server; the user's separate preview was not stopped.
- A parallel auth snapshot deployment temporarily removed OCR functions. The
  combined current backend was restored after coordinated checks. Guest calls
  to interpretation status, consent and generate were rejected 3/3 before AI
  invocation. OCR interpretation remains disabled; no OCR content was sent.
- The separate auth task enabled its approved verification/legacy flags after
  the Android run and exact account cleanup completed. New native QA signup
  must not bypass verification or send real mail: prepare an isolated confirmed
  fixture and test ordinary login. Native email verification is not claimed.

Preview publication is now requested, but remains gated on the unfinished native
checks and a compatible phone runtime. OCR adds native code; OTA cannot upgrade
an older installed binary to that runtime. No preview publication has occurred.

The new native fixture preparer is internal/admin-key-only and accepts only a
fresh (under ten minutes), exact generated `example.test` account ID, with one
matching password account and no profile, admin membership or review exception.
Eight guard/idempotence tests passed. It changes only email verification marks;
the unchanged current native client then uses ordinary login. The combined
backend was deployed once in coordination with the auth task; its flags and
reviewer exceptions were not changed. Disposable fixtures use exact cleanup.

At this follow-up, `npm test`, root `verify`, standalone admin `verify` and fresh
read-only web 4/4 passed. After adding the fixture guard, document policy 25/25
Vitest tests plus its Node tests and both TypeScript checks passed. Native reruns
are still outstanding; these software checks do not clear the release gate.

Android follow-up `2026-09-12_021739` passed the complete conversation phase:
focused multiline input above the real keyboard, in-screen attachment feedback,
background/foreground draft retention, history rename/save/reopen. The prior
rename retest saved a suffix from the original text because the tap placed the
cursor mid-value; the rename field now selects its value on focus. The updated
test passed without relaxing its exact title assertion. Transport recovery,
iOS and Fold follow-ups remain separate gates.

Android transport phase `2026-09-12_021952` passed connected → unavailable →
connected with draft edits retained and exact account cleanup. Screenshot review
nevertheless found the decorative empty-chat hero overlapping suggestions after
returning with a long draft. Empty-state art and suggestions are now suppressed
while a draft is nonempty, with policy regression coverage (chat tests 26/26).
That visual fix still needs fresh native screenshot confirmation; the transport
pass alone is not evidence of a clean layout.

iPhone 17 Pro follow-up passed all selected phases with exact cleanup:
`2026-09-12_022928` conversation keyboard/history/rename,
`2026-09-12_023051` backend interruption/recovery and no decorative overlap,
`2026-09-12_023125` OCR save while proxy unavailable, reopen and full-process
restart restoration. The cold-start test now waits for fresh Home content before
selecting Profile. iOS input assertions use the observed system keyboard and
actual typed text because XCUITest reports `focused=false` even with a visible
caret; Android retains its strict focused assertion. A separate Simulator URL
dispatch timeout was addressed by explicitly launching the local app before
opening its Metro link. Fold/SE follow-ups are still pending.

Live disabled-service/ownership checks also passed using two fresh synthetic
accounts: status exposes only its three allowed fields; provider generation and
new consent are disabled; an extra foreign `userId` is rejected; the internal
generation action cannot be invoked publicly. Both accounts were exactly purged.

Fold follow-ups have **not passed**. One run hung while reading the hierarchy
after closing the conversation; later runs exited at different steps without an
assertion result. Pre-cleanup capture showed a live app and the fully entered
long draft, not an app crash. The runner now captures bounded private diagnostics,
records subprocess exit/signal, isolates the Android driver/proxy process groups,
and splits long input into short RPCs without removing content assertions. Added
explicit newline assertions and an opt-in real emulator posture transition.
These harness changes are not yet proof of stability. The conversation viewport
now ends above the measured dock (with only 16px content padding), fixing message
text showing behind the dock on a wide display. Small-iPhone and Fold checks of
this latest viewport are pending. No release/push/preview gate is cleared.

iPhone SE follow-up passed the latest viewport, explicit Enter newline,
conversation/history/rename (`2026-09-12_025008`) and transport recovery. Its first
cold OCR run was blocked by the Expo developer welcome overlay, not a missing
document. The test now waits for fresh Home or that identified developer welcome
and dismisses only the latter. Isolated OCR rerun `2026-09-12_025800` passed full
process-restart restoration and exact cleanup. This is QA package handling, not
a production consent bypass. Fold remains the unresolved native release gate.

## Concurrent main deployment and release gate (03:20 follow-up)

The Android SDK client was 37.0.0 while the shared ADB server was the Homebrew
36.0.2 binary. With no connected devices, the server was restarted using the
matching SDK binary. The runner now rejects mismatched binary/version pairs.
This did **not** resolve every Fold failure: conversation passed, but the next
transport phase still lost its driver connection. Do not attribute all failures
to ADB version mismatch. The opt-in emulator posture transition is not passed.

The Android QA runner now advertises the emulator's reserved host alias
`10.0.2.2` for Metro/backend, while the host proxy remains loopback-bound, to
separate app network traffic from ADB reverse. It probes that path before UI QA.
This change is **not native-verified**: the next run stopped before boot because
the deployed fixture function had disappeared. No devices remain booted and the
last disposable account cleanup completed.

Read-only inspection found main commit
`9fe6ef896a0567c7212a47937b954e695cca52ca`, a substantial concurrent Sfera UI
merge. GitHub workflow `34660579302` deployed its Convex snapshot at
03:09:37–03:09:47 Moscow time. The live function spec subsequently lacked
`prepareVerifiedNativeFixture`, document interpretation and email verification
functions. The auth task confirmed it had not performed another deployment.
Its local commits `a61d272a` and `e551a02e` are not included in that main snapshot.
Previously passing live tests are therefore **not current deployment evidence**.

Do not restore the older full snapshot blindly: current main also changes chat
server contracts and shared screens. Integration must preserve both the new UI
and the approved verification/OCR work, then repeat checks on the merged source.
No auth flags, review exceptions or production data were changed in this
follow-up. Verification enforcement cannot be inferred from flags while its
server code is absent.

Native fixture setup now reads the deployed function spec before creating an
account and rejects missing required functions or the wrong deployment URL with
`NATIVE_QA_DEPLOYMENT_MISMATCH`. It logs only an allowlisted failure category and
stage, never the raw backend error/spec/credentials. Eight harness unit tests
passed; read-only evaluation of the observed live spec correctly rejected it.
No preview, production OTA, store release or root-task push has occurred.
