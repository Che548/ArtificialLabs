# Backend E2E

The live E2E suite targets the dedicated self-hosted ArtificialLabs deployment.
It creates only disposable accounts matching
`artificiallabs-e2e+<run-id>@example.test` and removes them with an internal,
admin-authenticated mutation in a `finally` cleanup.

## Coverage

- `npm run e2e:backend` validates real Password Auth, every structured health
  entity, ownership, replay idempotency, `updatedAt` conflicts, tombstones,
  account deletion/restore, and rejection of device-only URIs.
- `npm run e2e:web` checks the deployed admin login gate, protected UI kit,
  and generic invalid-login response. The internal workspace navigation test
  is skipped unless `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are configured.
  It does not exercise the native medical UI or prove absence of browser
  medical storage.
- `npm run e2e:native` runs the same disposable account through iOS and Android
  Maestro flows, including per-device opt-in, cross-device sync, deletion, and
  restore.

## Local commands

Copy `.env.example` to `.env.local` and keep the admin key untracked. Install
Playwright Chromium once with `npx playwright install chromium`. Native runs
also require Maestro, installed development builds, a booted iPhone simulator,
and a booted Android emulator. The runner also requires `openssl`. It forwards
the real Convex deployment through loopback so simulator traffic is independent
of VPN DNS: Android uses `adb reverse`, while iOS uses a one-day localhost TLS
certificate added to the selected Simulator trust store. Its private key is
created in a temporary `chmod 600` directory and removed during cleanup.

The native runner exits with status `75` when the test environment is blocked,
for example when Android System UI is unresponsive or the Maestro Android
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

The native flows wait for the actual authentication field, not the app title
(which can also appear on the splash screen), and allow up to 60 seconds for
authentication to reach onboarding. Initial iOS development-link timeouts use
the same bounded retry helper as simulator restarts.

Run native E2E only on disposable simulators/emulators: the runner clears app
state and resets the selected iOS Simulator keychain. These development-build
flows are not a substitute for final signed release-build testing. A passed
`e2e:coverage` check only confirms that capabilities have mapped test flows;
it does not mean those flows have run successfully. Synthetic scanner fixtures
exercise the pipeline and manual confirmation but do not validate accuracy on
real test-strip photographs.

The GitHub Actions **Live Backend and Web E2E** workflow is manual-only and
uses the protected `CONVEX_SELF_HOSTED_ADMIN_KEY` repository secret. It must
never be added to a `pull_request` trigger.
