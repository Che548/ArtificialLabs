# Backend E2E

The live E2E suite targets the dedicated self-hosted ArtificialLabs deployment.
It creates only disposable accounts matching
`artificiallabs-e2e+<run-id>@example.test` and removes them with an internal,
admin-authenticated mutation in a `finally` cleanup.

## Coverage

- `npm run e2e:backend` validates real Password Auth, every structured health
  entity, ownership, replay idempotency, `updatedAt` conflicts, tombstones,
  account deletion/restore, and rejection of device-only URIs.
- `npm run e2e:web` validates the deployed read-only demo with Playwright and
  fails if it observes a Convex mutation/action or medical browser storage.
- `npm run e2e:native` runs the same disposable account through iOS and Android
  Maestro flows, including per-device opt-in, cross-device sync, deletion, and
  restore.

## Local commands

Copy `.env.example` to `.env.local` and keep the admin key untracked. Install
Playwright Chromium once with `npx playwright install chromium`. Native runs
also require Maestro, installed development builds, a booted iPhone simulator,
and a booted Android emulator.

The native runner exits with status `75` when the test environment is blocked,
for example when the iOS Simulator cannot resolve the Convex endpoint through
the active VPN, Android System UI is unresponsive, or the Maestro Android
driver dies. These are reported separately from application failures. Android
field input is sent through `adb` because Maestro's API 36 `inputText` driver
can time out; Maestro still owns all element selection, taps, and assertions.

```sh
npm run e2e:backend
npm run e2e:web
E2E_IOS_DEVICE=<simulator-udid> E2E_ANDROID_DEVICE=<adb-serial> npm run e2e:native
```

Artifacts are written to ignored `output/e2e/`. Never upload `.env.local`,
Maestro runtime variables, access tokens, passwords, or the Convex admin key.

The GitHub Actions **Live Backend and Web E2E** workflow is manual-only and
uses the protected `CONVEX_SELF_HOSTED_ADMIN_KEY` repository secret. It must
never be added to a `pull_request` trigger.
