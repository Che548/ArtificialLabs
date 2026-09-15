# iOS public beta from a release tag

Only a push of a new stable `vMAJOR.MINOR.PATCH` tag starts **iOS Public Beta**.
The tag must resolve to main history and be greater than `v1.0.0` and all other
stable release tags. Validation runs again immediately before upload. Main
still deploys web/Convex independently. An optional, separately protected Android
job publishes only to [Google Play internal testing](google-play-internal-ci.md).
OTA and App Store production submission are not performed by this workflow.

Public beta now stays on the **1.0.0 marketing version** (owner-approved
2026-09-15). A new source tag such as `v1.0.2` creates `1.0.0 (10)` or the next
free higher Apple build number, not an app marketed as 1.0.2. Tags remain
immutable source identifiers. No bulk release of 100 builds is performed.
Apple may still require beta review for any build; keeping the marketing
version unchanged is not a review bypass. Already-uploaded 1.0.1 (8) is untouched.

## One-time setup (before creating a release tag)

An administrator must protect `v*` against updates/deletions with a repository
ruleset, limit creation to release maintainers, and create the GitHub
environment `ios-public-beta`, restricted to release tags. No bypass for an
untrusted branch or pull request is permitted. The local hook is not a security
boundary. A release must contain the reviewed workflow on main.

Configure the following **environment secrets**, never repository files:

- `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`: App Store Connect API key
  with access to the existing Sfera app and external TestFlight distribution.
- `IOS_DISTRIBUTION_P12_BASE64`, `IOS_DISTRIBUTION_P12_PASSWORD`: exported Apple
  Distribution certificate **with its private key**, protected by a password.
- `IOS_PROFILE_BASE64`: unexpired App Store provisioning profile for
  `engineering.brainwaves.sfera`, team `6HZGXYF43L`, matching that certificate.

Environment variable `TESTFLIGHT_PUBLIC_GROUP_ID` must be the ID of the
**existing** external group with an enabled public link. The workflow refuses
internal groups, creates no group, changes no public link, and does not modify
App Store review metadata. Once rules, secrets and a no-upload signed archive
check are complete, set environment variable `IOS_BETA_ENABLED=1`.

The workflow cannot operate merely with a browser login. Missing configuration
fails closed after verification, before signing or uploading. API secrets have
not been provisioned by adding these files.

## Build identity and reruns

### Encryption questionnaire

The owner approved these answers on 2026-09-15: standard third-party
cryptography (including SQLCipher), no proprietary algorithms, no distribution
in France. Apple's declaration API rejects document-declaration creation for
this combination; the corresponding build answer is
`usesNonExemptEncryption=false`, not a claim that the app uses no encryption.
`app.config.ts` embeds `ITSAppUsesNonExemptEncryption=false` for future IPAs.
The delivery lane fills only an unanswered (`null`) answer on an already
uploaded build in `MISSING_EXPORT_COMPLIANCE`, then waits at most one minute.
Existing `true` answers, rejected declarations and export review are never
overwritten. Reconsider both settings before changing cryptography or enabling
France. This does not change storefront availability or replace any separate
export-reporting obligations.

### Version identity

The workflow pins the marketing version to `1.0.0`, separately from the
source tag's SemVer. `app.config.ts` accepts
`SFERA_RELEASE_VERSION` and `SFERA_IOS_BUILD_NUMBER` only for the explicit
`SFERA_IOS_APP_STORE=1` identity; local development keeps its original identity.
Store builds without both values fail rather than silently reusing build 7.
Dependency versions do not follow the release tag; runtime stays fingerprint-based.
StripCV's own algorithm version is incremented when its measured-pixel processing
changes, independently of the application version.

A private **draft GitHub release** reserves a JSON receipt with source tag, SHA,
app version, monotonic integer build number and delivery state. Old receipts
without app version retain their original tag-derived version; changing it on
rerun is rejected, not treated as permission for another upload. Do not edit, publish or
delete this draft: it is the retry ledger, not a downloadable GitHub release.
The build number exceeds existing integer iOS TestFlight build numbers, 7 and
the workflow run number. Store uploads outside this serialized workflow must
be coordinated; a conflicting number is an error, not permission to overwrite.

Rerun the same Actions run after a recoverable error. The ledger reuses the
reserved build number and checks SHA. Once an upload attempt was recorded,
the workflow will not upload again if Apple has not exposed that build yet:
wait and rerun. If Apple conclusively never received it, release a new higher
tag after investigation, rather than erasing the ledger. A newer tag blocks
an older run from uploading.

Fastlane reserves identity, builds/validates the IPA, and delivers in separate
lanes. Signing runs in a temporary keychain and removes its exact imported
profile in `ensure`. Raw build logs, keys, IPA and provisioning files are never
uploaded as public Actions artifacts. Hosted runners must remain ephemeral.
An identical pre-existing local provisioning profile may be reused, but is never
removed by cleanup. A differing profile at the same UUID is rejected untouched.

Clean runners must run `prepare-document-ocr.mjs` (lock-file SHA-256 checks)
and `package-document-ocr-ios.mjs` before Expo prebuild/pod install. The existing
OCR XCFramework, headers and language resources are generated/ignored files,
not repository contents. A local machine's prebuilt OCR cache is not a CI
dependency. Both device and simulator slices are built by the existing script.

GitHub hides `bypass_actors` from callers without write access to the ruleset.
An absent property from a collaborator's API response is not evidence of an
empty bypass list; verify that list with the owner's account.

## Cross-platform native gate

StripCV 0.4.2 uses an explicit bilinear sampler for membrane rectification.
OpenCV 4's table-rounded perspective interpolation and OpenCV 5's revised
interpolation otherwise produce different faint-line row evidence. Synthetic
capture generation uses the same sampling precision; recognition thresholds,
paired partial-line safety cases and coverage requirements remain unchanged.
`stripcv_precise_warp` checks fractional coordinates below the old 1/32-pixel
grid, borders, non-contiguous input, aliasing and singular matrices against
known numeric answers. This is numerical regression evidence, not clinical
validation or a claim of diagnostic accuracy.

## Gates and outcome

Before signing: SemVer tests, `npm test`, all native StripCV tests,
`npm run verify` (includes admin verification), synthetic admin/contact/document/
chat browser suites and the CV demo Docker tests. These tests do not contact
the SMS gateway or issue USSD. Existing native failures remain blocking; no
thresholds are relaxed. Live account/physical-device checks are not silently
represented by browser tests.

Before upload: refresh the tag, verify IPA version/bundle/team/signature and
embedded fingerprint. Apple processing waits at most 30 minutes. On timeout,
the receipt persists and the run explicitly fails as pending, not as published.
After processing, request external beta distribution and automatic tester
notification. Review is Apple's decision. The summary reports Apple's exact
state and actual membership in the configured group; only `IN_BETA_TESTING`
with group membership means the build is available publicly.

First release: complete the prerequisites and tests, select a reviewed main
commit, create an annotated `v1.0.1` (or a higher intended SemVer), and push that
exact tag. Do not use `git push --tags`, move an old tag or trigger a production
OTA workflow as part of this procedure.
# Incremental branch CI

Ordinary branch pushes and pull requests always run unit tests and `verify`.
The expensive native StripCV and Docker CV-demo suites run only when their
inputs change (including models, dependencies, scripts and CI configuration).
Push comparisons cover the entire before/after range; PR comparisons use the
merge base. Missing history runs both suites. A skipped suite is reported as
not affected, not as a newly passed test. Release tags run all checks regardless
of changed paths; the ordinary CI does not duplicate tag runs.
