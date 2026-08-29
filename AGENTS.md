# Expo SDK 54

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# NativeWind

Before installing, configuring, or changing NativeWind code, read https://www.nativewind.dev/llms.txt.

# Convex

Read these guides before changing the Convex integration:

- https://docs.expo.dev/guides/using-convex/
- https://docs.convex.dev/quickstart/react-native
- https://www.convex.dev/components/push-notifications

This project uses a dedicated self-hosted Convex deployment on `junk`:

- Client/backend: `https://artificiallabs-convex.bebra42.ru`
- HTTP actions/site proxy: `https://artificiallabs-convex-site.bebra42.ru`
- Dashboard: `https://artificiallabs-convex-dashboard.bebra42.ru`

Copy `.env.example` to `.env.local`. The Expo client requires
`EXPO_PUBLIC_CONVEX_URL`. The Convex CLI requires `CONVEX_SELF_HOSTED_URL` and
`CONVEX_SELF_HOSTED_ADMIN_KEY`.

Never commit `.env.local`, `infra/convex/.env`, an instance secret, an admin
key, or production data. Run `npx convex dev --once --env-file .env.local` to
push functions and regenerate `convex/_generated`, or `npx convex codegen` when
only local bindings need regeneration. Finish changes with `npm run verify`.

Notifications use `expo-notifications` for on-device scheduling and
`@convex-dev/expo-push-notifications` for remote delivery. The 40 approved
events and their formal/cute copy live in `shared/notification-copy.ts`.
Local notifications work in native development builds. Remote push requires an
EAS `projectId` plus valid APNs/FCM credentials; when they are absent the app
must remain local-only and explain that state instead of failing. Never commit
push tokens or provider credentials. Web does not request notification access.

Phone authentication uses the standard Convex Auth `phone` provider and the
private `sms-gateway` service in the Convex Docker network on `junk`. The
gateway has no host port or FRP endpoint. `SMS_GATEWAY_SHARED_SECRET` and
`SMS_RATE_LIMIT_HASH_SECRET` exist only in the Convex/junk environment; never
log or commit them. `SMS_AUTH_ENABLED=1` enables SMS delivery for profile phone
verification and password recovery. OTP-only login remains disabled unless the
temporary migration flag `SMS_LOGIN_ENABLED=1` is explicitly set; normal login
uses a confirmed phone plus password. The public-client IP probe must confirm
that separate connections do not collapse to one proxy IP. Never log phone
numbers, OTP values, request bodies, or raw IP addresses.

SMS recovery allows at most three delivery attempts, while email recovery
allows at most five, per identifier and client IP in separate rolling 24-hour
windows. Both channels use a six-digit code. Do not expose remaining-attempt
counters in APIs or UI. A recovery request for an unknown phone must return
`RECOVERY_PHONE_ACCOUNT_NOT_FOUND` before contacting the private gateway;
rate-limit failures must never send a message.

OTP messages use an ASCII-only, platform-specific format so each request stays
within one SMS. Before the standard Convex Phone provider sends a code, native
clients store a short-lived HMAC-only platform hint: iOS receives a final
`@artificiallabs.bebra42.ru #code` line and Android receives the SMS Retriever
hash as its final line. The app starts the permissionless Android retriever
before requesting the SMS. Whenever the
Android package name or production signing certificate changes, recompute
`SMS_ANDROID_APP_HASH`; never reuse a hash from a different signature. The iOS
Associated Domains entitlement and the public AASA file must remain aligned
with Team ID `2675845GP5` and bundle ID `com.anonymous.privateexpo`.

The gateway archives every incoming modem SMS once in the private persistent
`/data/incoming-sms-archive.ndjson` file (`0600`) using an HMAC fingerprint for
deduplication. Before OTP or tariff operations it keeps only the newest 16 of
the modem's 20 incoming-message slots, deleting older messages only after the
archive write succeeds. Raw archive content must never be copied to Convex,
Git, logs, CI artifacts, or the admin UI.

The Admin Monitoring page may request the T2 tariff SMS remainder through the
private gateway with `*255*0#`. This is a global manual-only operation with a
rolling 24-hour cooldown enforced by both Convex and the gateway. Routine
health checks and E2E must never trigger USSD. Store only the parsed remaining
SMS count and safe status metadata; never persist or log the raw USSD reply.

## E2E testing

- `npm run e2e:backend` exercises the live self-hosted Auth and Convex contract
  with guarded disposable accounts and always performs exact admin cleanup.
- `npm run e2e:web` checks the deployed read-only demo with Playwright.
- `npm run e2e:native` runs the iOS/Android Maestro cross-device flow.
- Set `E2E_SCAN_FIXTURE_SOURCE` to a local image path to exercise the same
  native StripCV pipeline on both simulators. The runner copies the fixture
  into each app sandbox with restrictive permissions and removes the temporary
  copies during cleanup. Never commit medical fixtures or publish them as CI
  artifacts.
- Live E2E credentials and artifacts belong only in ignored `output/e2e/` and
  `.maestro/runtime/`; never commit tokens, generated passwords, or admin keys.
- `.github/workflows/e2e-live.yml` must remain `workflow_dispatch`-only. Never
  expose `CONVEX_SELF_HOSTED_ADMIN_KEY` to pull requests or untrusted code.

## Health data architecture

- Native iOS and Android are local-first. Write records to SQLCipher SQLite and
  its idempotent outbox before syncing structured values to Convex.
- The database key belongs in Expo SecureStore with
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; never hard-code or sync it.
- Scan photos and source lab documents remain in app document storage on the
  device. Never add their URI or bytes to a Convex mutation or file storage.
- All personal queries and mutations require Convex Auth and enforce ownership
  server-side. Public catalog data must not expose personal or medical data.
- Expo web remains a read-only development demonstration. The deployed web
  image is the separate login-protected `admin/` package; it must never expose
  account, camera, journal, lab, scan, chat, or other personal medical data.
- StripCV performs on-device computer-vision analysis. Persist its source,
  algorithm version, quality flags, signal ratio, and numeric confidence, while
  keeping the final value explicitly user-confirmed. Never describe it as a
  diagnostic result.
- Cloud synchronization is an explicit per-device opt-in. Authentication alone
  must not start medical snapshot reads or outbox writes.
- Offline and temporary server failures must never reject a completed local
  write. Keep the SQLCipher outbox pending, show a non-blocking connection
  status, retry transient transport failures with bounded backoff, and trigger
  an immediate single-flight sync when connectivity returns. Do not retry Auth
  or validation errors as transport failures.
- Password recovery is available in the native app through SMS or Resend email.
  Registration remains email-only, while confirmed phones can be used with the
  same password for login. `RESEND_API_KEY`, `RESEND_FROM` and
  `PASSWORD_RECOVERY_HASH_SECRET` are Convex-only secrets and must never be
  exposed to clients, Git or build artifacts. Email verification and OCR remain
  deferred milestones. The admin console manages only catalogs, lots,
  calibrations, published content, privacy-safe aggregates, monitoring and
  admin access.

## Admin console

- `admin/` is a statically exported Next.js application. Every page, including
  `/kit`, is protected by Convex Auth and every server operation calls
  `requireAdmin()`; client checks are presentation only.
- Bootstrap the first administrator only with
  `npx convex run admin:bootstrapByEmail '{"email":"..."}' --env-file .env.local`.
  Later grants and revocations are audited in the console. Never allow admin
  self-registration or revocation of the last active administrator.
- `CALIBRATION_SIGNING_PRIVATE_KEY` and `ANALYTICS_HASH_SECRET` are Convex
  environment secrets. They must never be exposed as `NEXT_PUBLIC_*`, Docker
  build arguments, logs or Git content.
- Admin queries are cursor-paginated and bounded. Analytics pages read only
  materialized daily buckets; do not scan personal tables or raw telemetry.
- Run `npm --prefix admin ci`, then `npm --prefix admin run verify` before
  publishing the admin image.

SQLCipher and camera changes require a native development/release build; Expo
Go is not sufficient for verification after native plugin changes.

## Expo OTA updates

The app uses a self-hosted Expo Updates Protocol v1 service on `junk`:

- Manifest and health: `https://artificiallabs-updates.bebra42.ru/api/manifest`
  and `/health`.
- The container listens only on `127.0.0.1:8094`; FRP tunnel
  `artificiallabs_updates` is the only public ingress.
- Releases are isolated by exact platform, fingerprint runtime version and
  `preview`/`production` channel. The default client channel is `production`.

`.github/workflows/ota.yml` is manual-only and must be selected on `main`.
`publish-preview` always exports the current `main`; never publish new bundle
bytes directly to production. Promote the verified iOS and Android update IDs
to production without rebuilding. Rollback only changes the channel pointer.

The committed certificate in `certs/ota-certificate.pem` is public. The matching
RSA private key and `OTA_PUBLISH_SECRET` exist only in the `0600` deployment
configuration on `junk` and in protected GitHub Actions secrets. Never copy
them into the app, Git, logs, Docker build arguments or artifacts. Keep
anti-bricking enabled.

The profile footer always shows app/build, commit and update identifiers. Three
taps within two seconds open diagnostics in every native build, including
production, and the Production/Preview selector remains available there.
Diagnostics must remain aggregate-only and local: server CPU/RAM, databases,
logs, shell access and admin operations are out of scope; never show or transmit
medical values, payloads, paths, identity, keys, tokens or raw errors. Only
coarse public `/version` and `/health` probes are allowed. `PRAGMA quick_check`
is manual-only; do not automatically run repair, `VACUUM`, checkpoint or
deletion.

Adding `expo-updates` or changing the diagnostics native module requires a new
native store/internal build. OTA cannot add or change native code for an
already-installed runtime.

# Web deployment

GitHub Actions builds the static `admin/out` export into
`ghcr.io/che548/artificiallabs`. A push to `main` automatically publishes the
commit and `latest` tags. Other branches deploy only through the manual
**Build and Publish Web Image** workflow; choose the branch in the GitHub
Actions branch selector and run it. A manual run also updates `latest`, so the
label-enabled Watchtower on `junk` deploys that selected revision.

The same protected workflow deploys Convex functions before building the web
image. `CONVEX_SELF_HOSTED_ADMIN_KEY` is a GitHub Actions repository secret;
never echo it, expose it to a `pull_request` job, or pass it to untrusted code.
The deployment workflow has no `pull_request` trigger. Public PRs run only
`.github/workflows/ci.yml`, which receives no Convex admin credentials.

The runtime image contains only the generated `admin/out` directory and nginx
configuration. Never copy `.env` files, Git metadata, source files, or Convex
admin credentials into the runtime image. The `artificiallabs_web` container on
`junk` is updated by its dedicated label-enabled Watchtower service. The image
is publicly pullable, so this deployment must not store a GHCR token or replace
the global Docker credential used by `ph_web`.
