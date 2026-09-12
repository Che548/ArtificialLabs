# Multi-device sync hardening (release candidate)

This change is not deployed until coordinated native verification completes.
Never test it by clearing a real device database or retiring its pending outbox.

## Consent

`cloudSyncSessions` binds a receipt/revocation watermark to the authenticated
user and session, never to a client-supplied user or session identifier. A
device opting out does not revoke another device's consent. Replaying that
session's old receipt cannot restore access. Health writes require the current
session receipt; snapshots return no medical rows without it. History pages
reject missing consent. Account deletion removes the session records.

The old profile receipt remains compatibility metadata, not authorization for
the health synchronization endpoints. Existing opted-in clients register their
session receipt on their next normal profile save; no blanket grant migration
is performed. A new login does not itself grant consent.

## Profiles

New clients retain `profileSyncBase.v1` in SQLCipher settings. They send only
portable profile fields as their merge base. The server merges independent
field changes, rejects conflicting edits to the same field, and advances its
timestamp on accepted changes. Legacy divergent writes without a base fail
closed rather than claiming success and losing an edit. Equal timestamps no
longer prevent a new client from accepting a clean remote profile.

Remote profile replacement and base storage run atomically with an owner check.
Local unsynced changes are not replaced by a subscription refresh. The base is
removed on local data clearing and account-owner change; it is never an admin
field or analytics payload.

## Ordinary records and acknowledgements

`syncRevision` is optional for migration (missing means revision zero). After
the first accepted write, a changed record must carry the current revision.
A later device timestamp alone cannot overwrite a changed server record.
Idempotent retries return the existing revision. A newer edit of a tombstoned
record produces an explicit conflict. Derived `agent-prep_` reminders retain
their previously tested re-enable lifecycle; agent rule merging remains
governed by its separate immutable-policy contract.

The response contains revision receipts, not extra medical data. Native ACKs
delete only the exact sent payload and propagate its acknowledged revision to
an edit queued during flight, atomically. Incoming ordinary records do not
overwrite pending local outbox records. Files remain local. Future timestamps
over the five-minute clock tolerance are rejected without deleting the outbox.

Conflicts are non-retryable and displayed inline. Native profile settings offer
an explicit version comparison and a separate confirmation. Before applying a
choice the client rechecks the server version; SQLCipher checks the owner and
reviewed local version inside the transaction. The original local version is
kept encrypted under `syncConflictBackup.v1:*`, outside outbox and FTS, and is
removed with local account data. Matching local chat attachments keep their
local file handles even when the cloud version is chosen; the existing upload
sanitizer still strips those handles. Choosing local rebases the revision and queues
the edit; choosing remote replaces only the reviewed record. Source files stay
local. Remote tombstones cannot be resurrected through the chooser. Existing
care-plan and trigger immutability rules remain enforced. This change does not
choose a winner or repair historical future-dated records automatically.

Scheduled agent work now requires at least one unrevoked device receipt rather
than the legacy profile timestamp. Revoking one device does not stop another;
revoking every device stops eligibility for scheduled work. Separate chat and
agent provider consents remain separate and are not automatically granted.

## History

The live snapshot retains its existing limits. `health.historyPage` uses owned
indexes and cursor pagination capped at 100 rows. The native store backfills
journal, lab, scan, reminder, chat-message and recommendation-event history,
with cancellation when the subscription changes. Web remains read-only; the
admin has no access to these personal endpoints.

## Verification and rollout

`convex/multiDeviceAudit.test.ts` covers two auth sessions, receipt replay,
revocation isolation, profile three-way merge, equal timestamps, bad clocks,
stale record revisions, tombstones, history beyond 200 rows and ownership.
It uses only convex-test memory databases. Unit queue tests use an isolated
SQLite mock. The manual `scripts/multi-device-native-qa.mjs` additionally checks
real SQLCipher in a dedicated empty native simulator; it refuses non-QA device
names, requires an empty database and cleans only its synthetic fixture.
Android API 36 and iOS 26.5 passed all sixteen native checks each, including ACK revision propagation
to an in-flight edit and preservation of pending records on remote merge.
This is simulator coverage, not a physical-device or live-backend claim.
The iOS run completed after the Mac was unlocked and Metro was opened in the
dedicated simulator. A task-scoped `caffeinate` assertion prevented idle sleep.
Both runs confirmed exact synthetic fixture cleanup. Aggregate results are in
ignored `output/e2e/multi-device/{android,ios}-native.json`. The latest
`npm run verify` and the repeated full `npm test` completed successfully.

`npm run test:multi-device` additionally covers the real client coordinator
against convex-test server functions: rejected batches stay pending, explicit
rebasing succeeds, and another concurrent write conflicts again. Guest/foreign
ownership and the 30-record review query bound are tested. Native SQLCipher
checks cover both choices, stale previews, owner rejection and backup cleanup.

The comparison presentation also passed a Maestro scenario on Android API 36
and iOS 26.5: both versions are visible, selecting a version alone does not
confirm it, explicit confirmation fires once, and the deleted-record view has
no restore-local button. This uses a standalone synthetic UI harness, not a
live account. Screenshots and scenario artifacts remain under ignored
`output/e2e/multi-device/{android,ios}-ui-pass/`. The first Android attempts hit
system/dev-launcher ANRs and manifest timeouts; the successful rerun used a
warmed, cached local manifest with offline Metro. Do not call those failed
attempts passes or infer store-build performance from this harness.

Required before rollout: a coordinated client/backend release. These simulator
checks use a disabled loopback backend, not a live candidate deployment.
Mixed-version tests confirm
that unchanged legacy saves remain safe but divergent writes without a merge
base are rejected; updating only the backend would block edits on old clients.
Older installed clients lack the profile base/atomic revision ACK. Do not push
to main (which deploys Convex) or promote OTA just because unit tests pass.
Production OTA and store release remain outside this task's current release
authorization.
