# ArtificialLabs

Expo SDK 54 / React Native 0.81 application for pregnancy planning and
pregnancy monitoring. It combines a secure local-first health diary,
self-hosted Convex synchronization, and the local StripCV image-analysis
pipeline.

## Implemented core

- Email/password accounts through Convex Auth.
- One planning or pregnancy monitoring program per profile.
- Daily symptoms, mood, energy, and nutrition journal.
- Manual laboratory results with optional source image.
- Pregnancy/ovulation test capture with local StripCV analysis followed by
  explicit manual confirmation.
- In-app reminders and pause/resume program controls.
- Idempotent structured-data synchronization through a local outbox.

Medical records are written to SQLCipher SQLite first. Scan images and lab
source documents remain in app document storage on the device and are never
included in Convex mutations. StripCV provenance, quality flags, signal ratio,
algorithm version, and confidence are stored as structured values; the final
result remains explicitly user-confirmed and is not diagnostic. The web build
is a read-only product demo.

Email verification, password reset, medical interpretation, AI chat, push
notifications, and the admin panel are deferred.

## Run

Use Node.js 20.19.4 or newer and create the public app configuration:

```bash
npm install
cp .env.example .env.local
npm run start
```

`EXPO_PUBLIC_CONVEX_URL` must point at the Convex backend. SQLCipher and the
StripCV native module require a development or release build; Expo Go is not a
verification target. Generate and run native projects with `npm run android`
or `npm run ios` (wrappers around `expo run:android` and `expo run:ios`).

## StripCV

Camera buffering is temporarily disabled with `ENABLE_CAPTURE_BUFFERING = false`
in `services/scanning/capture-burst.ts`. Live checks retain the full CV and the
two-check readiness gate, but now wait 1.5 seconds after each completed cycle
instead of collecting frames between checks. Their temporary images are deleted
immediately after use. Shutter capture takes and analyzes exactly one full-quality
photo; no burst voting runs and temporary export contains only that photo. The
buffer implementation is retained for a later, explicit re-enable.

The native test camera uses the physical rear wide-angle lens at 1×. An iOS
camera config-plugin patch resolves that lens by device type instead of its
localized name, preventing fallback to the system's preferred virtual lens.
This camera patch requires a new native build.
The iOS test camera requests the `Photo` session preset and the largest supported
still-photo dimensions, with native quality prioritization. JPEG bytes and
orientation/colour metadata are saved directly from AVFoundation: the original
is not cropped to the tall preview or re-encoded. The preview stays aspect-fill;
the full photo is normally 4:3. During framing, iOS samples the existing video
output instead of repeatedly invoking the high-resolution still-photo pipeline.
The output drops late frames, retains at most one pending request and encodes
only requested frames on a utility queue (sRGB JPEG, at most 1920 px on the long
side, no upscaling). The capture delegate copies a requested frame into a private,
reusable pixel-buffer surface and releases the camera-owned surface before JPEG
encoding. Encoding runs on a separate utility queue with low-priority Core Image
requests; at most one encode and one private surface are allowed, so work cannot
accumulate behind the preview. A missing frame times out without triggering still capture.
With buffering enabled, samples have a 200 ms cooldown after processing; platforms
without this bridge use an 800 ms still-capture cooldown. While disabled, both use
the 1.5-second live-check cooldown above. Native CV uses its own serial utility queue
instead of blocking Expo's shared native-call queue. The iOS bridge disables
OpenCV's internal GCD fan-out once, before any CV work: otherwise OpenCV submits
parallel work at default priority and bypasses that utility queue. All models and
quality checks still run; individual analyses may take longer to preserve preview
responsiveness. The 1.5-second full-CV interval remains measured after completion.
When buffering is enabled, at shutter tap the ring freezes and one full-quality original is added, replacing
only its oldest sample if necessary. All up to 30 frames pass through the existing
weighted consensus. The full-quality image is preferred for presentation only if
its reportable result agrees with accepted consensus; it cannot override a conflict.
If that optional still fails, the completed ring remains usable.
The test camera has the same glass flash button as its header controls. It
cycles Off → On → Auto → Off (default Off). On uses continuous torch light,
with per-photo flash disabled so buffered captures do not pulse. Auto takes one
native auto-flash metering photo, discards it, then latches the EXIF fired bit
into a steady torch decision for the camera session (missing metadata leaves
the light off). Native iOS capture waits for focus, exposure and white balance
to settle; platforms without the native metering bridge retain a 350 ms lighting
delay. Light stays on through shutter/buffer freeze and turns off on background
or leaving the camera. Switching
waits for the current photo/CV operation and restarts the buffer and readiness
checks, so photos from different lighting modes are not mixed in one series.
The initial framing guide is smaller (280 pt high). Animated tracking strokes
cover the entire preview beneath the glass controls, without a reserved clipping
lane. The exposure slider uses the same clear glass surface as the flash button.
On iOS the native focus point follows the actual detected box center, converted
through the preview's aspect-fill crop. Confident or twice-stable detections can
update the focus point at most once per 1.5 seconds after a meaningful position/size
change. Continuous native autofocus follows depth at that point without periodic
resets (Expo iOS calls this mode `autofocus="off"`; `on` maps to single autofocus).
Manual tap focus takes priority for five seconds. Before each new photo, metering
must remain settled for 120 ms within a bounded 2.5-second wait. A timeout retries
without taking a blurry frame or resetting CV hints/readiness. Frames exposed
across a manual focus/exposure change are discarded. No timer substitutes for
native metering readiness on iOS. Autofocus does not change CV thresholds.

Temporary native capture export: the result/retake screen has a **Скачать снимки**
button for the last shutter's buffered originals (up to 30), including failed
recognition attempts. It opens the system folder picker and copies unchanged
files into a new `Sfera-capture-*` folder. No automatic uploads, photo-library
permission, image encoding, or extra CV runs are involved. The private cache
keeps only the latest set, is cleared on closing the scan flow, and prunes any
interrupted session's leftovers at the next capture. A failed optional copy
never prevents CV. Set `ENABLE_TEMPORARY_CAPTURE_EXPORT = false` in
`services/scanning/temporary-capture-export.ts` to disable both copies and UI.
For complete removal, delete that file, its test and
`components/TemporaryScanCaptureExport.tsx`, remove their scan-flow imports,
hook/prop/button and `preserve` wrapper, and remove the test from `test:strip-reader`.

With buffering enabled, once detector confidence reaches 0.8 or the detected test passes the existing
stable-framing gate twice in succession, the camera retains a rolling buffer of
up to 30 local temporary video-frame samples (maximum age 30 seconds). Capture
freezes the existing buffer immediately and adds the shutter photo as described
above. Backgrounding, leaving the camera, and losing the test clear the buffer.
The buffer size and per-frame progress are not displayed. Once capture is armed,
the buffering mode samples frames serially with a 200 ms scheduling gap and refreshes
test tracking every 800 ms; minor framing motion does not disarm the buffer while
the detector still sees the test. Once armed, the full reader also checks a
preview photo immediately, then waits at least 1.5 seconds after each completed
check (including failures) before checking again. Its quality feedback stays in
the existing hint; preview results never replace the final buffer analysis.
The ready hint requires two consecutive reportable full-CV checks in the current
camera session. Detection alone cannot show readiness; a failed full check,
confirmed loss or camera restart resets it.
After acquisition, brief detector/camera misses preserve the hint, readiness
and completed buffer. Recovery checks each new photo and discards unlocated
frames; loss is confirmed after at least three consecutive misses spanning
two seconds. Small translations (up to 5% in normalized image coordinates,
with strip length between 80% and 125% of the previous detection) do not reset
locked tracking. Initial acquisition, image-edge and minimum-size gates remain.
The tooltip has one feedback controller: after the first full CV result,
tracking/framing messages cannot replace its status. A different CV warning must
recur in two full checks; one unconfirmed good frame preserves the actionable
warning until the two-success ready gate passes. Confirmed loss or analysis
failure revokes readiness, but preserves a specific quality warning. After a
test has been found, the initial search instruction is not replayed in that
camera session. This only controls feedback; frame quality and final voting
remain unchanged.
Capture and CV stay serial, so photo collection pauses during each full check
and resumes between checks. These are scheduling intervals, not
claimed measured camera FPS. Full photo quality and orientation handling remain
enabled, and the hardware still determines capture/encoding latency.
When buffering is enabled, after capture every buffered photo runs through the same pipeline serially.
Only reportable frames vote, weighted by squared quality-gated confidence.
At least half the frames must be usable, at least three must support the result
(or all available frames if fewer than three), and weighted agreement must reach
80%. An opposing frame with confidence ≥0.9 forces review. Abstentions never
vote for an absent line, and aggregation cannot make an individual rejected
frame reportable. Confidence is not inflated by the number of correlated frames.
Only the best supporting original photo is retained for the existing confirmation
screen; all other temporary photos are deleted. These aggregation settings are
engineering safeguards, not a validated accuracy estimate. Device camera and
thermal/performance behavior still require a physical-device check.

`services/scanning` owns the app-facing API, bundled profiles, and QR profile
validation. `modules/strip-cv` contains the portable C++/OpenCV core plus its
Kotlin/JNI, Swift/Objective-C++, TypeScript, browser, and Node adapters.

Native iOS and Android analyze the captured local image through the Expo
module. For local web-adapter development, export the app, build the C++ helper,
and run the combined static/API server (bound to `127.0.0.1` by default; set
`HOST` explicitly only when LAN access is required):

```bash
npm run web:full
```

`npm run build:strip-cv` requires CMake and a compatible OpenCV 4+ development
installation. Android uses the OpenCV 5 AAR/Prefab dependency and iOS uses the
OpenCV 4.10 XCFramework pod configured by the StripCV module.

The bundled profile is `handled-paper-two-line-strip` version
`1.0-observed-real-layout`. It has no validated biological cutoff. QR payloads
are parsed and schema-validated locally, but unsigned QR data cannot override
the algorithm, calibration profile, or cutoff. Until signed profile envelopes
are implemented, only an exact bundled profile with no cutoff is accepted; QR
product metadata remains display-only.

StripCV `0.4.1` also carries the frozen
`transverse-width-p1-base1-correct-s16-top-4` geometry proposal head. On mobile
it is applied only when the strongest fully ranked classical bare-strip anchor
would otherwise fail content or rectification checks, and can replace that
geometry only when deterministic edge/content evidence improves. Activation is
observable as geometry mode `bare_transverse_width` and always returns for
manual corner review; it cannot create an automatic reportable decision. Its
historical `198/210` result is rank-1024 proposal recall at IoU 0.75, not top-1,
reportable, diagnostic, or universal accuracy.

The `0.4.1` quality policy admits only three narrow, observable corroboration
paths: strong signal may confirm a 0.48--0.55 rail-support margin or a
3.0--3.25 canonical-pixel rectification residual; a high-confidence coherent
C/T pair may disambiguate a broad illumination gradient; and a geometrically
strong one-line capture may ignore an isolated assay-region ripple only when
the selected T evidence is non-positive. Missing controls, faint-line
warnings, stains, ambiguous assignments, and transverse-width geometry remain
non-reportable.

## Convex development

Add `CONVEX_SELF_HOSTED_URL` and a freshly generated
`CONVEX_SELF_HOSTED_ADMIN_KEY` to the untracked `.env.local`, then run:

```bash
npm run convex:dev
npm run convex:deploy
npm run convex:codegen
```

`JWT_PRIVATE_KEY` and `JWKS` are deployment secrets for Convex Auth. Set them
with `npx convex env set`; do not place them in Expo environment files or Git.

## Verify

```bash
npm test
npm run verify
npm run test:strip-cv
```

The supplied Figma assets and project fonts live in `assets/figma` and
`assets/fonts`, so builds do not depend on temporary design URLs.

## Preserved Swift baseline

The original native Swift/Xcode prototype remains in `ArtificialLabs/`,
`ArtificialLabs.xcodeproj/`, and `project.yml`. Its pre-migration checkpoint is
commit `62cc12b9e734e3357f68c1dfb1d8d21ba24a8216`, so the native baseline and its
history can be restored independently of the Expo application.
