# Controlled demo administrator

A customer demo account is a normal password account with explicitly granted
administrator privileges. Never use a store-review account for this purpose.
Never hardcode its email or password in the client, or commit its credentials.

The internal `adminDemoAccess:configure` mutation requires an authenticated
active administrator and an exact existing target user ID and email. It can
enable or disable a login-only email challenge exception for an already active
admin membership. The exception is audited, does not mark the mailbox verified,
does not change password checks, recovery, or contact confirmation, and is not
accessible as a public client mutation. Use only after explicit operator approval.

Revoking admin access clears the exception. Regranting admin access does not
restore it. Confirmed email changes clear it and record an audit event. The
exception is rejected for mismatched emails or accounts pending deletion.

This grants full administrative powers, including catalog changes and admin
management; it is not a read-only sandbox. Use synthetic data in the demo account
and distribute credentials privately. A QR code must contain only the public
admin URL, never credentials.
