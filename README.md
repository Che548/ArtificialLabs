# Private Expo

Expo SDK 54 / React Native implementation of the supplied Figma screen with a
native StripCV scanning pipeline.

The CV analyzer is the same local C++ StripCV core on iOS/Android. The web
export uses a small Node adapter: the browser decodes the captured camera
image to RGB, posts it to `/api/strip-cv`, and the adapter invokes that same
C++ core. This keeps the web result/profile schema aligned without shipping
Python, Streamlit, or a second CV implementation.

## Run

```bash
nvm use
npm install
npm run ios
```

You can also use `npm run android` or `npm run web` for the UI-only Expo
development server. For a web scan with the C++ analyzer loaded, export the
app, build the native helper, and run the combined server:

```bash
npm run web:full
```

The combined server serves `dist/` and exposes the analyzer at
`POST /api/strip-cv`. It requires a local OpenCV 5 development installation
for `npm run build:strip-cv` (the native iOS/Android builds continue to use
their existing platform dependencies).

The first native run generates the platform project and installs the module's
native dependencies. Android uses the official OpenCV 5 AAR/Prefab package;
iOS uses the OpenCV dynamic XCFramework pod. On native platforms, camera photos
stay in native memory and only the versioned JSON analysis result crosses into
TypeScript; the web adapter intentionally sends browser RGB pixels to its
local C++ helper.

## CV scanning

`services/scanning` owns the app-facing TypeScript API, the bundled test
profile, and QR profile updates. `modules/strip-cv` contains only the portable
C++ production pipeline, the browser RGB bridge, and small Kotlin/JNI,
Swift/Objective-C++, and Node adapters. No Python, Streamlit, desktop UI,
Docker, benchmark, or test dependency is shipped with the app.

The bundled default is `handled-paper-two-line-strip` version
`1.0-observed-real-layout`, the latest test profile from the source pipeline.
It has no validated biological cutoff, so the UI reports the T/C measurement
without inventing a positive/negative classification.

A QR code can replace the active in-memory CV configuration using either raw
JSON or a percent-encoded `artificial-labs://cv-profile?payload=...` value:

```json
{
  "schema_version": "artificial-labs.cv-profile/1",
  "assay_profile": { "schema_version": "1.0", "id": "...", "version": "..." },
  "card_profile": null,
  "cutoff": null,
  "product": { "label": "...", "batch": "...", "expires_at": "..." }
}
```

The full assay profile fields are required and validated before activation.
Unknown QR formats continue with the bundled configuration. A production
remote-profile rollout should add authenticity/signature verification and
persistence at this boundary without changing the analyzer ABI.

## Checks

```bash
npm run typecheck
npm run check:expo
npm run doctor
npm run build:web
npm run build:strip-cv
```

The original Figma image and SVG assets are stored locally in
`assets/figma`, so the project does not depend on temporary Figma asset URLs.
