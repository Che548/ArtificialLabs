# Agent trigger replica reconciliation

Local edits still use `isAllowedAgentTriggerMutation`. Cloud replica merges use
`mergeAgentTriggerReplicas`; this is not permission to edit a rule or reactivate
a stopped trigger. Policy fields, targets, evidence, expiry and run limits must
match. Unresolvable policy/run-metadata conflicts remain explicit errors.

Compatible lifecycle states converge monotonically:
`active < suspended < expired < completed`. This orders service scheduling
states, not medical results. A higher existing run counter and its legal run
metadata are preserved; timestamps cannot roll them back. Equal counters must
have identical schedule/cooldown metadata. For a recorded run, two valid
`lastRunAt` timestamps converge to the later one without increasing the counter.
Missing or future timestamps remain errors. Reconciliation never creates a new run.

The server and SQLCipher merge use the same resolver, including delayed cloud
snapshots. Local writes retain the original transition guard. Snapshot merge
failures are displayed as sync errors instead of unhandled promise rejections.

The client sends ordinary records before the separate agent batch (plan items,
triggers and recommendation events). A rejected agent batch leaves its outbox
rows pending without rolling back acknowledged ordinary records. Native ACKs
match the exact sent payload and timestamp as well as ID, preserving edits
made while a request was in flight. Nothing clears the queue wholesale.

Regression coverage: `convex/health.test.ts`,
`lib/local-database-merge.test.ts`, and `lib/cloud-sync.test.ts` cover terminal
state combinations, replay, reverse delivery order, run preservation, policy
rejection, ownership, partial progress and guarded acknowledgement.

Server changes alone cannot repair an old client's local merge implementation.
The client reconciliation and split-batch behavior require a compatible app
update. Never clear user data or reinstall to work around the conflict.

Android OTA preparation reproduces the manifest transformation performed by
masked-view 0.3.2's upstream Gradle script on AGP >= 7. This runs before the
normal fingerprint resolver, with pinned input/output checksums; no runtime
override is used. The regression test is part of the OTA workflow.
