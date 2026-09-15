---
title: "Release handoff — 12 September 2026"
document_id: SFERA-C510B58FE3
audience: developer
status: archived
updated: 2026-09-14
baseline_commit: ea85ac93db13b81d674aefc2cbe55f67428471bf
source_scope: working-tree
---

> Архивный материал. Описанные ниже действия и результаты относятся к исходной дате и ревизии; они не являются проверкой текущей рабочей копии. Действующие контракты и команды: [текущая документация](<README.md>).

# Release handoff — 12 September 2026

## Integrated source of truth

`main` at `06f46ca1` includes the merged UI, local document OCR, chat and
connectivity work, Android reflection/update-resource fixes, iOS tab insets,
and the account-deletion state regression fix. iOS TestFlight build 5 was
archived from that revision; Android remains versionCode 6.

The older App Review working copy is based on `f7eae937`. Its owner confirmed
that no new source edits were made after the previous handoff. Do not copy
its entire dirty tree over main: this would restore older onboarding,
authentication, UI, connectivity and release-plugin implementations.
Comfortaa, font-license UI, system-font and backup-exclusion plugins, SMS
gateway changes and the native-tab helper from that copy are already present.
The later onboarding helper/test contract and Android release fixes on main
supersede the older copy's versions.

## App Review correspondence (separate from TestFlight)

The other task confirmed that the six-part response to Guideline 2.1 was sent
on 12 September at 13:35 Moscow, with the physical build-3 demonstration ZIP.
Review Notes and the attachment were verified after reload. This records
communication, not App Store approval or resubmission. App Review build 3 and
manual public release were not changed while preparing TestFlight build 5.

The original correspondence drafts, device recordings, private reviewer
account details and machine-specific paths remain outside committed source.
This sanitized handoff replaces copying the full operational diary into Git.

## Verified build 5 scope

Build 5 was subsequently submitted through the external Sfera Beta group's
Submit for Review flow with Automatically notify testers enabled. App Store
Connect immediately showed Testing for build 5 in that external group. This
is external TestFlight availability, not App Store approval.

- Local `npm test`, `npm run verify` (including admin verification),
  `npm run typecheck` and iOS release configuration tests passed.
- CI and Build and Publish Web Image passed for `06f46ca1`.
- Internal TestFlight build 5 was installed over build 4 on a physical iPhone
  16 Pro Max. Local journal and chat history survived the update.
- Multiline chat input remained visible above the native keyboard; the draft
  survived background/return and closing the expanded conversation.
- A disposable account requested deletion, signed out from the pending screen,
  then a second account signed in without restarting. The second account
  correctly opened onboarding instead of inheriting pending deletion.
- Both disposable accounts were cleaned up by exact guarded cleanup.

## Open limitations

Physical OCR/test-strip completion, physical offline recovery and a physical
iPad were not verified in this pass. Do not substitute simulator checks or
navigation videos for these results. A version-linked clinical validation
report for StripCV remains unavailable; analogous research is not validation
of this binary. Apple accepted the upload with missing React/Hermes dSYM
warnings, so corresponding crash symbolication remains limited.

No OTA, SMS/USSD or App Store production release was triggered.
