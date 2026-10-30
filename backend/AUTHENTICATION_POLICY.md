# Current authentication policy

Bootstrap uses email and password to sign in. The login page has one registration
link, “Need an account? Register here”, which opens `/register` and preserves the
original destination. Authenticator and recovery-code controls are not shown on
login or profile pages.

Two-factor authentication is disabled by default: unset `MFA_ENABLED` and
`MFA_ENABLED=false` both disable it. Existing enrollment records are preserved,
but do not require a second factor for login, refresh or protected operations in
this mode. MFA enrollment, confirmation, recovery rotation and reauthentication
endpoints return HTTP 410. Passwords, account roles and existing sessions are not
rewritten by this change.

Password validation, shared login throttling, active-account checks, organisation
permissions, signed access tokens, secure cookies and refresh-token replay
protection continue to operate.

The previous MFA implementation remains behind explicit `MFA_ENABLED=true` for
compatibility and isolated regression tests. Older `MFA_ENFORCE_*` flags alone do
not enable it. Do not enable compatibility mode without a client that supports
the required authenticator flow. Retained cryptographic keys are not deleted.
