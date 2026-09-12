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

## Coordinated integration (03:46 follow-up)

The user authorized coordination and merging without dropping current
functionality. The concurrent maintainer identified upcoming work on Scan,
analysis cards, pregnancy/monitoring/cycle onboarding, Android and
non-Liquid-Glass fallback. Coordination did not authorize unrelated account,
message, or desktop changes. Private correspondence is not included here.

Local checkpoint `1109b9af` preserves OCR/chat work and the two auth commits.
Branch `codex/integrate-sfera-ocr-chat` merges `9fe6ef89`: new sheets, assistant
feed, animations, scan/cards and profile screens are retained, alongside local
OCR review, safe contact changes, connection policy and keyboard/draft guards.
The new chat on/off preference is retained. Ordinary text chat can work without
medical cloud sync, but the preference is not provider consent: the existing
versioned consent is still checked server-side before and after generation.
Medical assistant context continues to require explicit cloud opt-in.

The combined backend deployment completed at 03:43:30, preserving the main chat
contract as well as auth and OCR functions. Fresh read-only checks confirmed
REQUIRED/ALLOW_LEGACY flags and exactly two active email-bound audited store
review exceptions; no store-account password login was performed. Guest OCR
denials passed 3/3. Two synthetic accounts verified legacy login, rejection of a
malformed new-client ticket without sending mail, verified-account new-client
login, disabled document interpretation, and ownership/internal-API boundaries;
both accounts were exactly purged.

Merged `npm test`, standalone admin verification, and Chrome/WebKit read-only
scenarios (4/4) passed. Type checking exposed a recursive generated-API return
inference in chatAction; an explicit result type fixed it. A full `verify` run
under concurrent native compilation timed out in one 5-second real-password
unit test (37/38 passed); the timeout must be rerun without competing builds,
not waived or treated as a product assertion failure. Focused contact/chat
tests passed 27/27 separately. Android QA package rebuilt successfully with the
new masked-view native dependency. Fold's merged native run is in progress;
new iOS packages and merged native results remain unverified. No main push or
preview publication yet.

The first merged Fold run was deliberately stopped after inspection found that
the old auth flow searched for the removed onboarding name field. Exact account
cleanup passed; this interruption is not an app-crash or a native test pass.
Both native auth flows now follow the new five-step UI. The QA seed is restricted
to the authenticated generated fixture email instead of an editable profile
display name. Inspection also found implicit cloud/analytics/AI activation in
the incoming onboarding code: the new screens remain, but completion now starts
locally and does not call any provider-consent or automation mutation. Explicit
activation stays in Profile and the existing disclosure sheets. Regression
coverage fixes all three onboarding defaults to false and rejects automatic
consent calls. Focused privacy/chat/layout tests passed 24/24 and TypeScript
passed. No previously stored real-account consent or preferences were changed.

## Merged-source verification (04:12 follow-up)

Root `npm run verify` passed without competing native builds, including all
38 contact tests and the admin export. The earlier timeout is not suppressed.
Fresh admin UI passed 6/6. Chrome/WebKit desktop and narrow-screen checks passed
4/4; the read-only demo notice now occupies its own layout row rather than
overlapping navigation, with a bounding-box regression assertion.

Merged Fold phases passed native keyboard, conversation/history/rename and
local-proxy outage/recovery (`035400`, `035520`, `035730`). Document runs
`035807` and `040246` ended while the native test driver was still performing
an assertion/scroll; both have failed status and exact account cleanup. The
second run failed before OCR started. ADB disconnect logs alone do not establish
the root cause. Neither run verified a live Fold posture transition.

An explicitly selected independent Android UI driver is available through
`E2E_ANDROID_DOCUMENT_DRIVER=adb`. It uses the disposable emulator's native
UIAutomator hierarchy for selectors and scroll bounds, retains OCR text,
offline save, reopen and process-restart assertions, and writes screenshots only
to ignored private output. It does not silently retry a failed Maestro test or
replace a native test with browser emulation. Its execution result is pending.
The merged iOS package is rebuilding; pre-merge native passes are not evidence
for the new binary. Main push and preview publication remain gated.

## Registration UX revision and latest native evidence

The user approved automatic feature activation after the existing signup choice
for the upcoming demo; Apple submission work remains separate. The signup text
now discloses cloud sync, Yandex AI Studio, data categories and purposes. A
device-only registration receipt survives the email-verification step. A new
owner/freshness/version-checked mutation applies chat and assistant consent
atomically; old accounts, mismatched email, stale receipts and revocations are
not migrated. Analytics and document interpretation are not activated. See
`registration-consent.md`. Four backend tests and four onboarding/registration
tests passed; full `verify` passed. A subsequent automation guard also requires
cloud opt-in, a prepared cloud profile and completed onboarding; TypeScript and
the UI-policy regression passed after that guard.

The merged iOS native build succeeded. iPhone SE passed every native phase:
keyboard (`041724`), conversation/history (`041822`), local-proxy recovery and
OCR offline save/reopen/full restart (`041954`), with exact account cleanup.
These runs used ordinary login before the new registration revision; they do
not verify the new signup/email-code/activation path.

The independent Fold driver stopped at its first hierarchy parse, before any
document interaction. No OCR or posture pass is claimed for that attempt.
Diagnostics now distinguish a failed UIAutomator dump from malformed XML and
retain invalid XML only in ignored private output. Fold stability, the ordinary
iPhone merged run, the new registration native flow and final release checks
remain outstanding. No main push, preview OTA or store publication occurred.

## 04:57 follow-up: registration and Android driver

The ordinary iPhone 17 Pro merged run passed all native phases, including
conversation/history (`043505`) and document offline save/reopen/full process
restart (`043642`), with exact disposable account cleanup. Like the SE run,
this uses a preverified login fixture, not the new signup/email-code flow.

Registration backend coverage is now 6/6, including independent chat and agent
revocation replay tests that verify neither stored consent is changed. Device
receipt storage passed 2/2, contact UI 6/6 and Chrome/WebKit registration/read-only
UI 6/6. The browser signup test does not submit or send email. Full `npm test`
passed before the two additional revocation tests; those passed separately.

Independent Fold attempts exposed a concrete runner defect: the API 36 legacy
UIAutomator WatcherResultPrinter aborts on missing `android.test.RepetitiveTest`
yet prints `OK (1 test)`. Snapshot assertions correctly rejected these runs.
The explicitly selected driver now uses the documented simple result reporter,
rejects aborted/error output, and requires actual XML returned in the same
instrumentation response. This does not change the app or weaken UI assertions.
One separate attempt failed the preflight guest-network probe; its readiness
check now has five bounded attempts and requires a real HTTP 204 status.
All failed attempts completed exact fixture cleanup. A fresh Fold run is pending;
no native Fold/OCR/posture success or publication is claimed from these fixes.

Final `npm run verify` passed after the registration UI/automation changes and
both revocation tests (`/tmp/sfera-demo-final-verify.log`), including the admin
verification/export. The simple Android reporter removed the missing-class
failure but the next snapshot still failed. Device logs established an ENOENT
write at `/data/local/tmp/local/tmp/sfera-document-ui.xml`: the shell runner
relocates Android's data directory. It was not evidence of a missing UI root.
The helper now matches UiDevice's Environment-based destination, creates its
temporary parent, and reads/deletes that same exact file. A bounded ten-second
snapshot wait remains; Java build and host syntax/parser checks pass. The next
device run, not those build checks, must establish native success.

The Environment-based snapshot correction allowed the next Fold run to verify
recognition, expected numeric text, offline draft persistence and reopening
(`adb-document-ocr-synthetic.png`, `adb-document-ocr-restored.png`, 05:03).
That attempt then failed at the test harness's `monkey` launch command after
force-stop, so full cold restart and posture remain unpassed. The runner now
launches the exact manifest MainActivity via `am start` and preserves private
ADB failure diagnostics. Exact cleanup passed. Remote main was rechecked and
remains `9fe6ef896a0567c7212a47937b954e695cca52ca`.

The next independent Fold document phase passed in full: recognition, numeric
assertions, offline draft save, reopen and cold process restart. It closes the
document viewer after the final screenshot so the separate posture scenario can
reach chat navigation. Evidence: `adb-document-ocr-cold-restart.png` in the same
private Android report directory. Live folding is a separate, still pending
phase; this document pass does not count it or native signup as passed.

## Latest gate status

The live Fold 2→0 transition retained both draft lines. The post-transition
screenshot shows the real keyboard, cursor and send button, but Maestro stopped
at its focused-state assertion. This is not recorded as a passing automated
posture test. The revised assertion verifies real editing of the retained input
instead of relying only on focus metadata. Its next run stopped earlier in
`chat-keyboard` while launching the app after Home, before reaching the revised
posture step. It did pass typing/wrapping, keyboard dismissal and draft retention
before that stop. Exact account cleanup passed on both attempts. Neither
automated background/return nor the revised folding check is marked passed.

Three additional isolated integration tests execute the real OnboardingScreen
completion callback, native receipt logic (mock SecureStore), and real consent
mutation in convex-test. They passed absent-session rejection/receipt retention,
authenticated activation/consumption, no-receipt login/recovery behavior and
local-failure retry with no duplicate grants. No email or SMS is sent. This does
not establish a native email-code end-to-end pass.

Auth-task coordination confirmed no outstanding peer edits or planned deploy;
their commits are preserved. REQUIRED=1/ALLOW_LEGACY=1 and the two exact review
exceptions must remain intact. Main push, preview OTA and store publication
remain on hold. Ordinary Android merged-source full QA and native signup are
still unverified; no production readiness or Apple approval is claimed.

Final verification after adding those integration tests passed again, including
the admin verify/export. `git diff --check` passed. The disposable emulator is
stopped and ADB lists no attached devices. No code was pushed or newly deployed.

## Continued Android verification

The Android runner now preserves the shared scenarios while splitting Home and
resume into two bounded Maestro sessions. Between them ADB starts the exact
manifest Activity without force-stop. Tests verify that all shared assertions,
screenshots and the real Home action are retained; iOS scenarios are unchanged.
Fold's main keyboard/background/return scenario passed with this runner.

Posture QA now captures the entire draft before inserting synthetic text, then
requires an exact full-text comparison after removing that one insertion. This
does not assume that tapping a multiline input places the caret at its end.
The app's outside-tap dismissal no longer exits early on cached focus=false;
that stale flag could leave the actual keyboard open after a Fold resize. The
real handler is regression-tested for both cached focus states.

The complete Fold 2→0 run then passed, including OCR, offline save/reopen/cold
restart, retained multiline draft, native editing, visible send action and
keyboard dismissal/navigation (`2026-09-12_054134`), followed by exact cleanup.
The ordinary Android full run is next; it is not implied by this Fold pass.

Registration activation additionally requires the user's stored email
verification timestamp, not just a session accepted under legacy compatibility.
The rejected attempt retains its receipt and performs no cloud/local activation.
Seven backend plus three onboarding integration tests passed. Full npm test and
TypeScript passed before the small outside-tap fix; its focused test passed
afterward. Final full checks will be repeated after native runs.

## Final integration checks before main push

The ordinary Android run passed all phases: main keyboard and Home/resume
(`054512`), conversation/history/rename (`054700`, `054820`), backend proxy
interruption/recovery (`054856`), and local document OCR/offline save/reopen/cold
restart. Exact disposable account cleanup completed. Together with the Fold
`054134` run this clears the earlier Android driver/posture blockers.

The latest iPhone SE rerun completed every mandatory command in keyboard
(`055243`) and conversation/history (`055458`); platform-inapplicable commands
were skipped. Screenshots were visually checked on SE and ordinary Android:
the real keyboard, multiline caret and send action remain visible. Earlier
merged iPhone 17 Pro and SE OCR/recovery passes are recorded above; the final
outside-tap change was rerun on SE, not on iPhone 17 Pro.

Fresh `npm test`, `npm run verify` (including admin verify/export), Chrome/WebKit
6/6, contact UI 6/6 and isolated admin UI 6/6 passed. Diff whitespace checks
passed. Contact UI uses test fixtures: native email delivery/code/automatic
registration activation is still not an end-to-end verified scenario. No
physical Android, physical iPhone or mobile Safari pass is claimed. Backend
proxy interruption is not an airplane-mode test.

Only source/admin/backend publication is being prepared. OCR interpretation
remains disabled; OTA/store publishing and Apple submission are separate.
Docker context excludes private test artifacts, environment files and sessions.
