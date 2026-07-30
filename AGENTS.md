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

# Web deployment

The intended registry target is the private image
`ghcr.io/che548/artificiallabs`. Automatic push triggers must remain disabled
until the package owner has explicitly set GHCR visibility to private. A manual
run publishes branch, commit, and `latest` tags for deployment verification.

The runtime image contains only the generated `dist` directory and nginx
configuration. Never copy `.env` files, Git metadata, source files, or Convex
admin credentials into the runtime image. The `artificiallabs_web` container on
`junk` is updated by its dedicated label-enabled Watchtower service. Its private
GHCR credential is isolated in
`~/deployments/artificiallabs-web/docker-config/config.json`; do not replace
the global Docker credential used by `ph_web`.
