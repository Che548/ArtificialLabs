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
