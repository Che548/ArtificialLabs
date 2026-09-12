# Feature compatibility and update-required errors

`shared/client-compatibility.ts` defines independent feature protocols. They are
not app/build versions, Git commits or OTA fingerprints, and never authorize a
request. `requireClientProtocol()` runs after authentication and ownership checks
and throws a bounded Convex error containing only `code: CLIENT_UPDATE_REQUIRED`,
`feature` and `requiredProtocol`. New features extend the shared registry.

Profile saves and health batches accept optional `protocolVersion`; current
clients declare version 1. The server enforces these if either server-only
`SYNC_PROTOCOL_REQUIRED=1` is set or `SYNC_LEGACY_COMPAT_ENABLED=0`.
The temporary compatibility flag defaults on when absent (explicit `1` is also
on). Keep compatibility on and enforcement off while Apple review build 3 is
supported, and for every other supported pre-protocol client regardless of build
number or platform. `TODO(remove-legacy-sync-compat)` markers identify the flag and branches
for removal after verified client updates. Deployment alone does not change
these environment values. While compatibility is allowed, requests without a protocol use
the deployed legacy timestamp policy for profile and record writes. Protocol 1
uses strict revision conflicts; a supplied profile merge base also opts that
profile request into three-way merge. Every accepted legacy record edit advances
the server revision so a newer client can detect an intervening legacy write.
The flag is not a rollback of strict handling for capable clients.

Legacy compatibility does not provide lossless concurrent editing: delayed legacy
writes can still be ignored, and newer full legacy profiles can overwrite fields
edited elsewhere, as before. Do not advertise multi-device conflict protection
for protocol 0. Auth, ownership, immutable plan rules, validation and explicit
per-session cloud consent remain enforced for both protocols. Legacy clients
establish a session receipt through their existing profile-save-before-batch
flow; until that succeeds snapshots contain no medical payload. Never infer
session permission from another device's account-wide timestamp.

With enforcement enabled, missing/old protocols return update-required before
writes. Supported clients still receive ordinary profile/record conflict errors
when their data conflicts. Auth's existing `CONTACT_CLIENT_UPDATE_REQUIRED` code
is recognized without changing the email-verification policy or exemptions.

The shared classifier gives explicit update-required errors priority over an
offline hint and never retries them automatically. Only the affected operation
is unavailable; local writes, outbox, and other features remain intact. Metadata
and raw error text are not rendered. The notice claims local preservation only
when its caller knows the write completed (the synchronization view).

`UpdateRequiredNotice` uses the current channel and the existing update manager.
It never switches channels, publishes an update, or automatically restarts.
No available OTA is not evidence that the feature is compatible: tell the user
that a compatible update is not available in this channel and to check the store.

All update-manager restarts run registered preparation callbacks, single-flight.
Chat preserves its text and conversation ID in owner-checked SQLCipher settings,
outside snapshots/outbox/search; the saved draft is restored on return to chat.
Account replacement and local-data clearing remove the draft. Document review
saves its existing encrypted extraction draft; active operations or failed saves
prevent reload. Passwords and verification codes are never persisted for restart.
New editors must register `useBeforeUpdateRestart` to preserve their drafts or
throw while an operation cannot safely be interrupted.

Run `npm run test:client-update`, `npm run test:multi-device`, and `npm run verify`
(includes admin verify). Use only synthetic native UI fixtures, one emulator at
a time under bounded caffeinate. Native development UI tests do not prove OTA
delivery; exercise actual fetching and restarting again in signed Preview builds.

Release order: compatible backend accepting the optional argument; compatible
client Preview; signed iOS/Android verification and available user update; only
then separately enable protocol enforcement. Never describe the new UI as already
present in older binaries. No production OTA or store publication is implied.

## Legacy rollout checks

Integration check on 2026-09-13: based on main `1dfc7b09`, preserving its OCR,
chat-back handling and beta-page updates. `npm test`, `npm run verify` (including
admin verify), and the 40-test multi-device suite passed. OCR now checks the
calling session before reserving and after inference; regression tests cover a
second device without consent and revocation while a result is pending.
No live deployment, flags, Apple submission or OTA were changed. The inspected
local `Sfera-AppStore.xcarchive` reported build 1, not the review build 3; it was
not used as evidence of signed review-build compatibility.

`convex/clientCompatibility.test.ts` exercises absent-protocol profile edits,
repeated record writes without revision acknowledgement, deletions and stale
replays, mixed protocol conflicts, queue acknowledgement, auth and revocation.
These are synthetic server-contract tests, not proof that the exact Apple build 3
has been installed and tested. Before deployment keep `SYNC_PROTOCOL_REQUIRED`
absent/off, verify the signed review build's request contract and test that build
against an isolated compatible backend. Do not enable enforcement while build 3
must remain supported. No deployment or App Store change is part of these tests.

## Follow-up legacy inspection — 2026-09-13

- Located a local exported IPA whose embedded configuration and Info.plist report
  version 1.0.0, build 3. This alone does not establish that it is the exact binary
  currently in Apple review. It is a device build, not a simulator package.
- The available older simulator package reports build 2 and its embedded bundle
  contains the live Convex endpoint. It was not launched against the live backend.
  No isolated Convex container or isolated routing for the unchanged old binary
  was available; installed-binary compatibility remains unverified.
- The coordinator fixture in `tests/fixtures/legacy-cloud-sync.ts` is frozen from
  commit `9b00049204b662bfc1e561ef3f17350ad3b172a9` (only its type import path changed).
  It now exercises the candidate functions in a private `convex-test` database,
  rather than calling the current coordinator while labeling it legacy.
  Covered repeated edits, no revision acknowledgement, a rejected batch retaining
  its queue, and receipt establishment with an empty outbox after server upgrade.
  This is source-level integration coverage, not native or HTTP/transport E2E.
- No real database, simulator, device installation, deployment, environment flag,
  main push, OTA or Apple submission was changed during this inspection.

## Local verification — 2026-09-12

- `npm test`, main `verify` (including admin `verify`), focused compatibility,
  cloud queue, restart preparation and multi-device tests passed. Final changed
  client code also passed TypeScript checking.
- Dedicated Android API 36 emulator and iOS 26.5 simulator: 21 real SQLCipher checks passed on each, including
  owner isolation, no draft in snapshot/outbox and exact synthetic cleanup.
- Android and iOS native presentation flows passed for unavailable updates, server error,
  downloading, disabled OTA, blocked restart and single confirmation. It uses
  controlled update-manager states, not a signed OTA download or real reload.
  Screenshots and synthetic harness remain ignored under
  `output/e2e/multi-device/update-android-clean/` and `update-ios-final/`.
  Initial runs were blocked by cold-boot/system dialogs; the final clean flows
  completed. No physical devices were used.
- Resolved runtimes: Android `5ad9e3266002c2ee2d032bc70ef7d324ed926339`
  matches the tested native binary. iOS resolves to
  `c46c57a981c60995729b8758217db4186c9fa031`, while the simulator binary embeds
  `296a1fb455530417dbc3da770f7a6ed4e8b654d0`. Dev-client UI testing does not enforce
  OTA runtime matching; verify the intended signed release artifact separately.
- No backend rollout, protocol-enforcement flag, main push, Preview publication
  or production/store release was performed. Signed Preview delivery verification
  remain release gates.
