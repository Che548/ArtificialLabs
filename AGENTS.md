# Expo SDK 57

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

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

Push notifications are intentionally out of scope for the initial integration.
Do not install or configure `@convex-dev/expo-push-notifications` until a
separate feature explicitly requires it.

## Health data architecture

- Native iOS and Android are local-first. Write records to SQLCipher SQLite and
  its idempotent outbox before syncing structured values to Convex.
- The database key belongs in Expo SecureStore with
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; never hard-code or sync it.
- Scan photos and source lab documents remain in app document storage on the
  device. Never add their URI or bytes to a Convex mutation or file storage.
- All personal queries and mutations require Convex Auth and enforce ownership
  server-side. Public catalog data must not expose personal or medical data.
- Expo web is a read-only demonstration. Do not enable account, camera, journal,
  lab, scan, or other medical-data writes on web without a separate review.
- Current scan results are manually confirmed (`manual-v1`). Do not describe
  them as OCR, CV, or diagnostic output.
- Email verification, password reset, OCR/CV, AI chat, push notifications, and
  the admin panel are deferred milestones. Do not imply they are operational.

SQLCipher and camera changes require a native development/release build; Expo
Go is not sufficient for verification after native plugin changes.

# Web deployment

GitHub Actions builds the Expo web export into
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

The runtime image contains only the generated `dist` directory and nginx
configuration. Never copy `.env` files, Git metadata, source files, or Convex
admin credentials into the runtime image. The `artificiallabs_web` container on
`junk` is updated by its dedicated label-enabled Watchtower service. The image
is publicly pullable, so this deployment must not store a GHCR token or replace
the global Docker credential used by `ph_web`.
