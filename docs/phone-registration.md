# Phone registration

Native signup supports either the existing email/password flow or a Russian
mobile phone (`+7 9…`) without an email. There is no signup feature flag.
`SMS_AUTH_ENABLED` remains the existing delivery kill switch; `SMS_LOGIN_ENABLED`
is unrelated and must not be enabled for this feature.

Phone signup uses a five-minute SMS challenge bound to a random 256-bit client
token. Only HMACs of the token and code are stored. The SMS gateway's number/IP
limits still apply; challenge requests additionally have bounded number/IP
quotas and code verification locks after five failures. Delivery errors are
inline, and no request content is logged. Challenges are purged after one day.

After verification, the device has ten minutes to choose a password. Convex Auth
creates the password account and the confirmed phone-only user in one transaction,
using its configured password hasher. The opaque password account ID is not an
invented email and stays independent of later phone changes. Existing contacts
are never automatically linked or merged. A same-token, same-password retry can
recover a lost response without creating another account.

Phone-only users may log in with phone/password, recover through SMS, or add email
through the existing password-and-email-code form. Accounts with email retain
the existing email verification rules. Registration consent receipts identify
exactly one verified signup contact, are owner-bound, and never grant document
interpretation or reverse revoked consent. Older email receipts remain supported.

Validation: `npm run test:contacts`, `npm test`, `npm run verify` (includes admin).
The isolated contact UI at `?signup=1` replaces all delivery/auth calls; it must
not be deployed. Real modem delivery remains manual-only. Native keyboard and
SMS autofill checks must be reported separately from browser fixture checks.
