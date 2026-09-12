# Local document recognition — implementation under verification

## Boundaries

PDF, JPEG and PNG are inspected by content in app-owned storage, limited to
20 MiB and 20 pages. iOS uses PDFKit/ImageIO; Android uses PdfRenderer and sampled
Bitmap decoding with EXIF orientation. Tesseract 5.5.0, Leptonica 1.85.0 and
rus/eng tessdata_fast commit 87416418657359cb625c412a48b6e1d6d41c29bd are pinned
with SHA-256 in `modules/document-ocr/dependencies.lock.json`. Models/licences
are bundled; no runtime model download. TIFF/curl/archive/graphics are disabled.
One page runs off the UI thread, with cancellation and private temporary previews.

## Data and migrations

Idempotent `CREATE TABLE IF NOT EXISTS document_extractions` adds a SQLCipher-only
table keyed by document ID: engine version, state, page text/confidence, edited
text, candidate values, explicit date and confirmation timestamp. It is not a
health entity, snapshot, outbox item or FTS input. Account switch, local wipe
and document deletion remove its rows. Interrupted jobs restore as cancelled
drafts, not confirmed data.

Candidates preserve decimal separators, units and reference strings. Every row
requires review; missing information is not invented. Confirmation atomically
updates the linked local result and OCR row without copying the file. Only
structured values use the existing outbox. Optional `LabResult.confirmedAt`
means checked transcription, not clinical normality; clinical status remains
`unreviewed`. Confirmation does not complete plans or create diagnoses.

## Explicit interpretation

`AI_DOCUMENT_INTERPRETATION_ENABLED=1` is required; absent/other values disable
the server mode. Keep it off until native release gates pass. The user selects
and previews a substring of confirmed text, then accepts the separate
`2026-09-11-selected-document-v1` consent. Nothing is selected by default.
Only text (up to 24,000 characters), policy version and request ID are sent.
Files, pictures, paths, OCR drafts and the archive are not request fields.
Auth, active-account checks, consent and transactional per-user/request-ID
reservation precede the provider call. At most 8 attempts per rolling day;
a failed or uncertain request ID cannot send twice. The server stores only
request metadata. Account deletion cleans it in bounded batches. No provider
tools or retries; request logging is disabled. Document instructions are
untrusted data. Answers cannot mutate records/plans. Client review is not
proof of medical correctness and the server cannot attest to physical review.

## Local native build

Run `node scripts/prepare-document-ocr.mjs` first to verify artifacts and copy
models/licences. It replaces only generated dependency trees. For iOS run
`node scripts/package-document-ocr-ios.mjs`, Expo prebuild, then pods. The
XCFramework contains arm64 device and arm64 simulator slices. For Android run
`node scripts/build-document-ocr.mjs android-<ABI>` for every configured ABI
(`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`), then Expo prebuild. NDK CPU feature
sources are checked against 27.1.12297006 hashes. Only arm64 dependency/bridge
builds have been checked so far; other configured ABIs must not be silently
omitted from store builds. Generated dependencies/binaries are ignored.
These scripts publish nothing; OTA cannot add this module.

For the local Maestro iOS package specifically, run
`node scripts/build-document-ocr-e2e-ios.mjs` after packaging the dependency
XCFramework. It prebuilds and compiles Debug with E2E mode and without inherited
store/signing overrides. This changes only generated local native configuration;
normal production configuration still requires OTA signatures. Run
`scripts/run-document-ocr-e2e-ios.mjs` with an explicitly disposable QA simulator.
The runner rejects a signed-OTA package before boot and warms the real manifest
and its exact local launch asset rather than guessing a bundle URL.
The simulator package uses local ad-hoc code signing, not a distribution
certificate: `CODE_SIGNING_ALLOWED=NO` loses entitlements required by Keychain
and is not a valid SecureStore/SQLCipher E2E package. The flow also dismisses
the first-launch Expo developer-menu introduction before checking login.

## Verification checkpoint

Policy/orchestration tests use a synthetic engine port, not real OCR. Server
tests cover auth, consent, bounds, duplicates, ownership and metadata-only
persistence. `scripts/create-document-ocr-fixtures.py` generates RU/EN samples
in ignored `output/pdf/document-ocr/`: PDF/photo, 20/21 pages, oversized,
encrypted, damaged, rotated and poor-quality cases. Compare to `expected.json`;
never claim clinical accuracy. The first PDF page has been visually inspected.

Dependency libraries compile for iOS device/simulator arm64 and Android arm64;
the Android JNI library links. The full iOS Debug simulator app builds and links
successfully (including the OCR module). Host Tesseract recognized all three
expected tokens in the synthetic image; this is not native or clinical evidence.

The initial 2026-09-11 iOS OCR E2E stopped before authentication. Native diagnostic
output established `EXUpdates.CodeSigningError.SignatureHeaderMissing`: the
package retained the production OTA certificate while QA Metro was unsigned.
The launcher showed an unhelpfully clipped error and the password-field assertion
timed out; document import and OCR were never reached. A dedicated E2E build and
preflight check address that mismatch without weakening production signatures.
The temporary diagnostic edit in the installed Expo loader was reverted.
The rebuilt package reached registration, confirming the manifest fix. That run
then exposed missing Keychain entitlements from the previous unsigned native
build (`A required entitlement isn't present`). Ad-hoc simulator signing is now
part of the QA build. A rerun passed registration, local onboarding and PDF
import. iOS accessibility combines the date button's icon and text, so the flow
matches the complete accessible label rather than an exact inner Text node.
The first OCR invocation then exposed a React Native API mismatch:
`AbortSignal.throwIfAborted` is unavailable. Recognition now uses `signal.aborted`
in both orchestration and native adapter. A regression test supplies a signal
without that browser method, including cancellation and cleanup.

**Passed on 2026-09-11, dedicated iPhone 17 Pro / iOS 26.5 simulator:** registration,
local onboarding (cloud sync off), import of the synthetic two-page PDF, native
Tesseract recognition, numeric-token assertions (`1,25`, `12.50`), saving the
SQLCipher-only draft, closing/reopening the document and checking the same text.
Both pages and the fixture date are visible in the captured output. This does
not establish clinical accuracy or perfect transcription (the English disclaimer
contains an OCR typo and still requires review).

The run also found and fixed nested multiline-input scrolling: the OCR editor
delegates scrolling to the outer form, dismisses the keyboard on drag and keeps
the top safe area outside the scrollable content. Maestro uses run-relative
screenshot names and scrolls to save feedback before asserting it.
Evidence is private and ignored under
`output/e2e/document-ocr-ios/artifacts/2026-09-11_235401/ios-ocr-local/takeScreenshot/`:
`document-ocr-synthetic.png` and `document-ocr-restored-draft.png`.
Exact backend-account cleanup passed; the QA app was uninstalled and its
simulator shut down. No other simulator was booted during the run.

The original iOS launch/OCR blockers are resolved. On 2026-09-12 the full Android
arm64 Debug app compiled successfully, including Kotlin and the OCR JNI bridge.
The module now respects the explicitly requested `reactNativeArchitectures` for
local builds; without that property it retains all four configured ABIs. This
fixes a local arm64 build incorrectly requiring absent 32-bit OCR prebuilts, and
does not silently reduce the architectures of store builds.
Use `scripts/build-document-ocr-e2e-android.mjs`, then the Android runner with
`E2E_ANDROID_AVD` and `E2E_DISPOSABLE_EMULATOR=1`. It refuses concurrent devices,
boots a read-only AVD, connects through ADB-reversed local proxies, and cleans
its exact temporary account, installation and synthetic fixture on exit.

**Passed on 2026-09-12, Android API 36 arm64 phone emulator:** registration,
local onboarding, native chat keyboard/draft restoration, two-page PDF import,
Tesseract recognition, both numeric tokens, SQLCipher draft save and reopening.
The complete automatic rerun needed no manual intervention and exact disposable
account cleanup passed. Screenshots are under
`output/e2e/document-ocr-android/artifacts/2026-09-12_001541/android-ocr-local/takeScreenshot/`.
The earlier diagnostic run required manual dismissal of the Expo menu and then
stalled with software graphics; it is not counted as a pass. The runner now
defaults to the host GPU (an explicit allowlisted QA override is available).

At that checkpoint, the remaining fixture variants and lifecycle scenarios
were not yet checked; later results below supersede that limited coverage.
The full keyboard/device matrix, dynamic fold/unfold and migration replay remain
separate release gates. Main push remains deferred until the mandatory checks
pass. No OTA, store release or feature enablement.

The same automatic Android OCR/draft flow also passed on the OPENED Pixel Fold
AVD (state 2), run `2026-09-12_002422`, with exact account cleanup. Its first run
exposed an existing onboarding layout bug: width-based vertical scaling put the
form outside a wide, short window. The bounded layout now reserves scroll space
and caps decorative scaling; geometry regression tests cover phone, Fold and
keyboard-resized windows. The name-field step scrolls when needed. The reopened
OCR draft and native split-keyboard screenshots are in that run's private
`takeScreenshot/` directory. This does not yet test folding with an active draft.
The CLOSED external Fold display (state 0) passed the same full flow in run
`2026-09-12_003300`, with exact account cleanup. The runner validates the requested
state against the device inventory, wakes the active display after posture
changes and extends screen timeout only in the disposable read-only AVD. The
first closed-display attempt stopped before login because the display slept;
that attempt is not counted. Android background/foreground is not covered by
these runs; that assertion was added to the shared flow afterwards.

The full flow passed on iPhone SE (3rd generation), iOS 26.5, in run
`2026-09-12_005656`, including chat background/foreground and reopened OCR draft.
Exact account cleanup passed. On the first new-simulator launch the Expo intro
appeared after the old optional tap timeout; the fresh-install flow now waits
for Continue explicitly. The small-screen OCR run also showed that returning
to a Close button above a long document was cumbersome; Close is now fixed
outside the scrollable content and the rerun passed. Native source rejection
also releases the OCR engine lease before a draft is created (unit regression).
The final same flow passed on the ordinary iPhone 17 Pro in run
`2026-09-12_010134`, including native keyboard, background/foreground, tab draft
retention and reopened OCR text, with exact cleanup. No simulator remained
booted after these runs. Earlier iOS failures are recorded above, not counted
as passed runs.

### Native fixture matrix

`E2E_OCR_MATRIX_ONLY=1` on either dedicated native runner tests the actual Expo
module through its **local** Hermes inspector. The runner copies only generated
synthetic fixtures into the disposable app, accepts the exact QA app ID and
loopback inspector, and writes only named boolean results to `native-matrix.json`.
OCR text stays in the runtime; no provider request or app account is needed.
Inspector eval bypasses Metro, so its async test body is explicitly lowered
with Babel and inline helpers. A regression test covers that launch failure.

iOS native matrix: 48/48 passed on 2026-09-12. This covers PDF/JPEG/PNG,
Russian/English sample words, decimal tokens, units, two-page and 20-page PDF,
90-degree correction, bad rotation, password/corrupt/21-page/oversized and
unsupported-file rejection, remote-source rejection, bounded poor-quality
output, real cancellation and engine reuse. Poor-quality handling is not an
accuracy score. Synthetic fixtures are not clinical validation.

Android also passed the expanded 48/48 matrix on 2026-09-12, including the
eight additional language and unit assertions.
Both runners shut down their dedicated device and perform exact cleanup.
After the inspector-runner correction, `npm test` and `npm run verify` passed
again, including admin verification and Expo Doctor 18/18. These green checks
do not mark the remaining native UI/release gates as complete.

Android run `2026-09-12_013056` additionally passed full process-restart draft
restoration, after selecting the Profile tab by its explicit ID. The initial
attempt's text-only tap did not navigate and its subsequent document search
failed; it was not a data-loss failure. The final screenshot shows the saved
numeric tokens after a real kill/relaunch, with exact cleanup afterwards.
iOS full process restart is still unverified.

## Privacy assessment — no store submission changed

Local OCR itself uploads nothing. Explicit interpretation sends health-related
text to Yandex and must be disclosed separately from automatic metadata context.
Before enablement, recheck App Privacy/Google Data Safety purposes, optionality,
linking and provider retention against deployed declarations. Do not assume
the existing chat declaration covers this flow. App Store Connect is unchanged.
