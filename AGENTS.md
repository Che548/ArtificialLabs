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
- Email verification, password reset and OCR remain deferred milestones. The
  admin console manages only catalogs, lots, calibrations, published content,
  privacy-safe aggregates, monitoring and admin access.

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
