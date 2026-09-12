# iOS App Store release

App Store Connect app: `6810893199` (сфера.).
Organization: `BREINVEIVS INZHINIRING, OOO`.

App Store provisioning profile created September 11, 2026:
`Sfera App Store 2026`, UUID `b790554e-d18e-4895-8a3b-87e0486ba5bf`,
portal ID `S22CW6Q342`, expires September 10, 2027. It authorizes the
organization bundle, production push, Associated Domains and disables
`get-task-allow`. Installed in Xcode's user provisioning-profile directory.
The certificate/private key stays in Keychain, outside Git.

Manual archive signing uses `CODE_SIGN_STYLE=Manual`,
`DEVELOPMENT_TEAM=6HZGXYF43L`, `CODE_SIGN_IDENTITY='Apple Distribution'` and
`PROVISIONING_PROFILE_SPECIFIER='Sfera App Store 2026'`. Upload authentication
is separate from the browser session and local signing: Xcode must be signed
into the organization Apple Account.

Set `SFERA_IOS_APP_STORE=1` for **every** production iOS configuration,
prebuild, archive, export and runtime-fingerprint calculation. This selects
`6HZGXYF43L.engineering.brainwaves.sfera`. Without this flag, the existing
development bundle `com.anonymous.privateexpo` is preserved. E2E mode is
explicitly rejected in App Store configuration.

```sh
SFERA_IOS_APP_STORE=1 npx expo prebuild --platform ios --no-install
cd ios
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
```

The native health-storage plugin excludes Documents (SQLCipher including WAL,
scan images/history, lab documents and chat attachments) from iOS backup before
React starts. It verifies the resource flag and does not start health writes
if protection fails. Verify the actual resource flag in the final native build;
source/config tests alone do not prove device behavior.

The AASA source authorizes both legacy and organization identities. It still
needs deployment and public verification before release; changing this file
does not deploy it. No automatic production OTA should be triggered as part of
the store release. An iOS OTA export must resolve the same App Store identity
and fingerprint as the installed release.

Remaining submission gates are tracked in `app-store-preflight-2026-09-10.md`.
Never substitute development E2E results for release verification or clinical
validation. Review credentials must be private, non-admin and tested in the
actual release. Do not attach raw E2E logs/screenshots containing credentials.
# System fonts on iOS (build 2)

iOS uses `System` with explicit 400/500/600/700 weights through `lib/font-style.ts`
and the NativeWind `font-sf*` utilities. `lib/bundled-fonts.ios.ts` includes only
Yaro. Other platforms retain their existing SF font asset map for this scoped
change; their separate distribution/licensing review remains outstanding.

The `with-ios-system-fonts` config plugin removes legacy SF Pro resource entries
from existing generated Xcode projects and UIAppFonts without deleting source
assets. Always verify the final exported app for stale font resources; successful
prebuild alone does not prove a previously built app bundle is clean.

September 11 verification: `npm run verify` and `npm run test:ios-config` passed.
The iOS Metro export under `output/builds/ios-system-font-export` lists only Yaro
as a font; a SHA-256 comparison against all four SF Pro source files found zero
matches in exported assets. Visual layout verification and final archive audit
are separate remaining checks. No OTA was published by this change.
