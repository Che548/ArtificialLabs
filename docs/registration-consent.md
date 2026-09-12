# Registration activation

The approved demo UX reuses the existing unchecked registration consent, with
visible disclosure of Yandex AI Studio, cloud sync, health-context categories,
chat responses and automatic recommendations. It does not infer consent from
merely signing in. This implementation is not App Store/privacy approval and
does not edit the Apple submission or the public legal website.

- Native signup stores a versioned, device-only SecureStore receipt before
  requesting account creation. A pending email challenge preserves it; an
  ordinary signup failure removes it. Recovery/signIn do not create receipts.
- Onboarding submits the receipt after authentication. The server binds it to
  the authenticated account's email and creation time, accepts only the current
  policy versions, and expires it after 24 hours. It also requires the stored
  email verification timestamp, even if legacy compatibility allowed a session
  without verification. A rejection retains the pending device receipt and
  does not enable local services. It returns no medical data.
- Chat and assistant consent are written atomically. Repeated application does
  not duplicate rows or reverse revocation/disabled preferences. Provider calls
  are not performed by this mutation; existing service flags still apply.
- Successful application enables cloud sync and recommendations on that device.
  Analytics stays off. Document interpretation retains its separate consent,
  preview and disabled-until-verified flag. Source files and OCR drafts stay local.
- Existing users and accounts without a matching receipt retain their current
  explicit-consent/settings flow. Receipt deletion follows completed onboarding.

Tests: `convex/registrationConsent.test.ts`, `lib/onboarding-layout.test.ts`,
`lib/registration-consent.test.ts` and `lib/registration-onboarding.test.ts`.
The latter executes the real onboarding callback and real Convex mutation in
an isolated test backend, with mocked device storage/local health writes. It
checks unauthenticated rejection with receipt retention, authenticated
activation/consumption, no-receipt login/recovery, and local-failure retry
without duplicate grants. It does not send email or emulate a native keyboard.
Native end-to-end signup/email-code/activation verification remains required;
the prior native login fixtures intentionally do not manufacture this receipt.
