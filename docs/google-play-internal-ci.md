# Google Play internal releases

Release tags run the existing complete validation job, then independent iOS
and Android jobs. Android targets only `engineering.brainwaves.sfera` / `internal`.
The marketing version is 1.0.0; versionCode exceeds all visible bundles, APKs,
track versions and the workflow run number. Existing tracks are read but only
internal is written. Google may still require processing/review or initial
manual setup of a draft application; CI never promotes to production/open testing.

## Owner setup

1. Enable Google Play Android Developer API in the selected Google Cloud project.
   Create a dedicated service account and JSON key. Do not grant Cloud Owner/Editor.
2. Invite that service-account email in Play Console, restricted to Sfera.
   Grant application read access and release-management access to testing tracks;
   no production-release, finance or administrator permission. Confirm the app
   already supports API uploads; the first app setup/upload may need the console.
3. Reuse the EXISTING upload keystore registered in Play App Signing. Do not
   generate/rotate keys. The upload certificate is distinct from Google's app
   signing certificate; do not change the SMS Retriever hash to the upload hash.
4. A GitHub repository administrator creates `google-play-internal`, restricts
   deployment to protected `v*` tags, and keeps tag updates/deletions forbidden.
5. Add these environment secrets through GitHub Settings or `gh secret set`
   using file/stdin input, never command-line literals or chat:
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: complete service account JSON.
   - `ANDROID_UPLOAD_KEYSTORE_BASE64`: base64 of the existing upload keystore.
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
6. Add environment variable `ANDROID_UPLOAD_CERT_SHA256`: upload certificate
   SHA-256 from Play Console (colons accepted). Verify that the local keystore
   matches. This is not a private key.
7. Keep repository variable `ANDROID_INTERNAL_ENABLED` absent/0 until a local
   signed AAB check and authenticated Google access check pass. Then set it to 1.
   It is a repository variable because the job-level condition is evaluated
   before environment variables are available. Never enable it merely because
   the secrets have names in GitHub.

## Build and retries

The job generates native files with explicit store versionCode, uses the existing
release-signing plugin, verifies the AAB package/version/certificate/fingerprint,
and uploads only after a fresh immutable-tag validation. Bundletool 1.18.3 is
SHA-256 pinned. Signing material is removed even on failure; keys/AAB/raw logs
are not GitHub artifacts. The Google JSON stays in the job environment.

An independent private draft named `Android internal vX.Y.Z` holds source tag,
SHA, app version, versionCode, runtime and AAB SHA-256. Its `android-internal-*`
draft reference is not an additional source release; never publish/delete it.
iOS uses a separate receipt. Reruns reuse the number and compare Google's bundle
SHA-256 before changing internal. An uncertain upload without a visible matching
bundle stops for investigation rather than uploading duplicate bytes. Draft
Google edits used for reads or failed operations are discarded exactly.

## Current verification limit

Unit/policy/workflow checks do not establish live Google access or a valid
upload certificate. Before enabling, use the real credentials to verify both
and build a signed AAB. No SMS/USSD is part of these checks.
