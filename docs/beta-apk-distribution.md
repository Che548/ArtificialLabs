# Temporary Android APK distribution

`admin/components/beta-android.tsx` selects APK or Google Play mode. Set `apk`
to null to show the disabled preparation state. Restore `google-play` after
the store track is available. iOS and the page QR are independent.

The deployment's `downloads/` directory is a read-only bind mount at
`/usr/share/nginx/html/beta-assets/downloads`. APKs are not Git content or image
layers. Upload with an `.uploading` suffix, verify SHA-256, then rename before
releasing the page. Preserve old versioned files while links remain in use.

Current artifact: `sfera-1.0.0-9-google-play-signed.apk`, version 1.0.0 (9),
package `engineering.brainwaves.sfera`, 642866617 bytes, source e50a04f4.
SHA-256: `998d116fd57290f7deb489a5feceea8286fd72d12f0c27e85b2502453dd81a6b`.
Runtime: `d5dd9e9c8cc470b0a382d8a884d627e1b45656ca`.
Artifact supplied and signature checked by the Android release task: downloaded
from Google Play, signed with the Play app signing key, not the upload key.
Never rebuild/re-sign it for this page. This alone does not prove installation
over every existing build; do not recommend uninstalling to resolve conflicts.
