# ArtificialLabs

Expo SDK 57 application for pregnancy planning and pregnancy monitoring. The
current milestone implements a secure local-first health diary with
self-hosted Convex synchronization.

## Implemented core

- Email/password accounts through Convex Auth.
- One planning or pregnancy monitoring program per profile.
- Daily symptoms, mood, energy, and nutrition journal.
- Manual laboratory results with optional source image.
- Pregnancy/ovulation test capture or gallery import with manual confirmation.
- In-app reminders and pause/resume program controls.
- Idempotent structured-data synchronization through a local outbox.

Medical records are written to SQLCipher SQLite first. Scan images and lab
source documents remain in app document storage on the device and are never
included in Convex mutations. The web build is a read-only product demo.

OCR/CV, medical interpretation, AI chat, push notifications, and the admin
panel are intentionally deferred. A manually confirmed scan result is never
presented as an automated recognition result.

## Run

Use Node.js 22 or newer and create the public app configuration:

```bash
npm install
cp .env.example .env.local
npm run start
```

`EXPO_PUBLIC_CONVEX_URL` must point at the Convex backend. Because SQLCipher is
enabled through the Expo config plugin, encrypted native storage requires a
development build or release build after changing native configuration; Expo
Go is not the verification target.

## Convex development

Add `CONVEX_SELF_HOSTED_URL` and a freshly generated
`CONVEX_SELF_HOSTED_ADMIN_KEY` to the untracked `.env.local`, then run:

```bash
npm run convex:dev
npm run convex:deploy
npm run convex:codegen
```

`JWT_PRIVATE_KEY` and `JWKS` are deployment secrets for Convex Auth. Set them
with `npx convex env set`; do not place them in Expo environment files or Git.

## Verify

```bash
npm run verify
```

The supplied Figma assets and project fonts live in `assets/figma` and
`assets/fonts`, so builds do not depend on temporary design URLs.
