# Authentication and input protection

Updated 29 October 2026. This release hardens the shared API without changing the frontend or resetting existing passwords.

## Throttling

| Protection | Budget | Identity |
| --- | --- | --- |
| Login | 10 attempts per 15 minutes | Transport IP and normalized login email, separately |
| Password recovery | 6 per hour by IP; 3 per hour by email | Independent of the login budget |
| Password change, MFA enrollment/confirmation, recovery-code rotation and reauthentication | 10 attempts per 15 minutes combined | Authenticated user ID, in addition to endpoint IP budgets |
| Registration | 8 per hour | Transport IP |

These are attempt budgets: successful submissions also count. Fixed windows can permit a burst across a window boundary. Exhausting one identity does not disable the account or prevent independent recovery. Existing IP limits for MFA and recovery still apply.

Development and production use MongoDB atomic counters shared by every API replica. Counter IDs contain keyed HMAC digests, not raw IPs or email addresses. Expiry is part of the counter identity; correctness does not depend on timely TTL cleanup. A database/counter failure returns 503 before checking credentials; exhausting the budget returns 429 with `Retry-After`. Test-only in-memory defaults are not used in production.

Login email validation runs before the account limiter; equivalent uppercase/lowercase addresses share a bucket. Nonexistent addresses receive the same budget and invalid-credential response. The authenticated credential budget is shared across password and MFA routes, so changing endpoint or IP cannot reset it.

`TRUST_PROXY` defaults to false. Do not set unrestricted trust or accept a client-selected header as an IP. Verify the actual ingress boundary before changing proxy settings. On a hosted reverse proxy, the conservative default can group several clients under a gateway IP. Account limits remain independent of this limitation. See [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/) and [Railway networking specifications](https://docs.railway.com/networking/public-networking/specs-and-limits).

## Input and password handling

- All parsed JSON routes reject nested `$` operators, dotted/bracketed keys and `__proto__`, `prototype` or `constructor` keys. Ordinary string values containing those words remain valid. Traversal is capped at depth 24 and 20,000 entries.
- Query filters reject repeated/compound values and unsafe field names. Route-specific validation, explicit queries, field allowlists and organization authorization remain required; a key guard is not a replacement for permissions.
- Credential JSON bodies are limited to 16 KiB; other existing JSON/upload boundaries remain unchanged. The signed Resend webhook still receives original raw bytes before general JSON parsing.
- Registration/profile text fields must actually be strings before trimming. Array/object credentials cannot be coerced into scalars.
- Registration, password reset, provider activation and password changes share a new-password validator. The existing minimum is 12 characters with upper/lowercase and a number. A small local denylist rejects common and published demo choices. This is not an exhaustive breached-password service.
- New secrets exceeding bcrypt's 72-byte UTF-8 boundary are rejected rather than silently truncated. Existing password hashes and legacy sign-in compatibility are preserved.
- Accounts explicitly classified `demo_default` are denied outside isolated demo environments even if their separate `demoAccount` flag is missing. This applies to login, session access and refresh.

## Existing password and MFA boundary

Existing passwords are preserved at the owner's request. No password reset, account disablement, role change, forced enrollment or forced session revocation is part of this release. Rate limits cannot protect a known password from a correct first attempt. Published demo passwords must not be relied on to secure a live account; replace them or enroll MFA. Account-specific audit findings remain private.

An independently generated MFA encryption key is provisioned in the API's production secret configuration. Enforcement remains off to preserve current access. An eligible administrator can enroll the existing authenticator feature through Profile & security, confirm a code and save the single-use recovery codes. Completed enrollment requires MFA on subsequent sign-ins even with global enforcement off, and revokes old sessions. Do not enable mandatory enforcement before enrollment and recovery have been verified. See [MFA rollout](../docs/backend/privileged-mfa-rollout.md).

No passwords, hashes, MFA keys or recovery codes are logged or committed. Protect the MFA encryption key outside the database; changing it without re-encryption breaks existing enrollments.

## Verification

Run `npm run backend:test:db` to include every isolated database suite, with zero skips. Focused cases in `test/sharedRateLimit.mongo.test.js`, `test/inputShape.test.js` and `test/passwordPolicy.test.js` cover concurrent replicas, IP rotation, normalized identities, process recreation, cooldown, independent recovery, cross-endpoint credential throttling, database interruption, operator/prototype payloads, payload limits, scalar coercion and bcrypt byte limits. Existing tests cover authorization, session replay, MFA atomic code consumption and organization isolation.

Release verification: 637 backend checks passed, zero failed/skipped; seven Bootstrap browser login/role journeys passed; the Bootstrap production build passed. Backend lint reports zero errors and seven existing warnings. An additional focused throttle run verifies that existing legacy credentials still authenticate unless explicitly classified as demo credentials. Isolated database fixtures and simulated proxy boundaries were used; no live accounts were subjected to a brute-force test.

The `qs` lockfile dependency is updated from 6.16.0 to 6.16.2, addressing [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw). Re-run the dependency audit as advisories change.

The approach follows [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) and [NoSQL security guidance](https://cheatsheetseries.owasp.org/cheatsheets/NoSQL_Security_Cheat_Sheet.html). Passing automated tests does not establish immunity to attacks or replace a penetration test.
