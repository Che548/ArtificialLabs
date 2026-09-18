# Temporary Android APK distribution

`admin/components/beta-android.tsx` selects APK or Google Play mode. Set `apk`
to null to show the disabled preparation state. Restore `google-play` after
the store track is available. iOS and the page QR are independent.

While APK mode is active, the official Google Play internal-test link is shown
first and the versioned APK remains the fallback below it. Keep both URLs
independent so the APK can be removed after the store track becomes available.

The deployment's `downloads/` directory is a read-only bind mount at
`/usr/share/nginx/html/beta-assets/downloads`. APKs are not Git content or image
layers. Upload with an `.uploading` suffix, verify SHA-256, then rename before
releasing the page. Preserve old versioned files while links remain in use.

Current artifact: `sfera-1.0.0-10.apk`, version 1.0.0 (10), package
`engineering.brainwaves.sfera`, 642850233 bytes.
SHA-256: `ee7bf612e8fcb4765072432806cb59e85e49cb4178ea7bb8cb7b001ce6403bff`.
The versioned artifact is stored outside the image and must not be rebuilt or
re-signed by the web deployment.
