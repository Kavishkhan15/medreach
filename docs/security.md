# Security

The Express API applies one shared security implementation for Bootstrap, Tailwind and Skeleton. These controls describe the current code; local tests do not establish production configuration or regulatory compliance. See [release QA](release-qa.md) for evidence and live checks.

## Shared middleware

`backend/src/middleware/security.js` applies Helmet CSP/HSTS, `no-referrer`, cookie parsing, credentialed CORS and an origin guard for cookie-authenticated unsafe requests. All three Next.js variants also send anti-framing CSP/X-Frame-Options, nosniff and no-referrer headers. Frontend CSP restricts framing, objects, base URLs and form targets; it is not a nonce-based script policy. Confirm the hosted platform preserves these headers.

- Exact frontend origins come from `CORS_ORIGINS`. The unsafe-request origin guard rejects a foreign Origin when cookies are present; it permits missing Origin. This is not a general CSRF-token implementation.
- Login: 10 requests/15 minutes; registration: 8/hour; recovery/verification: 6/hour; general auth: 20/15 minutes.
- Tracking: 60/15 minutes; public submissions: 20/15 minutes in normal operation. The isolated browser fixture has an explicit test-only submission allowance.
- Assistant: 20 messages/5 minutes/IP using its own limiter.
- Express JSON body limit is **6 MB**, supporting career resume data URLs. Route/schema validation imposes additional field limits; the parser limit is not a per-field upload guarantee.
- Input validation uses express-validator and Mongoose constraints. Provider existence/type and request-mode checks also run in controllers/services.

Rate limits are process-local. A deployment with multiple API instances needs an appropriate shared limiting strategy and a verified proxy topology; the app currently trusts one proxy hop.

## Authentication and sessions

- Password sign-in only. Google OAuth routes, sign-in UI and state models are intentionally removed.
- Signed issuer/audience-bound access JWTs (default 15 minutes) use httpOnly cookies; API clients may supply Bearer tokens.
- Refresh tokens are opaque, hashed and rotated. Reuse revokes the family. Access validation checks active account, auth version and an active server-side session when MongoDB is connected.
- `requireAuth` and `optionalAuth` share credential validation. Guest routes allow no credential, but reject presented expired/revoked/invalid credentials.
- Logout and session revocation invalidate the relevant family; password reset/change and administrative account/role changes revoke affected access.
- Password hashes use bcrypt cost 12 and the registration/reset password policy is 12–128 characters.
- Reset/verification tokens are cryptographically random, hashed, expiring and single use. Reissue supersedes older links.
- Cookies are secure in production. `COOKIE_SAME_SITE` defaults to `lax` locally and `none` in production; split-site deployments require HTTPS and functioning credentialed CORS.

## Authorization and tracking

Roles are `user`, `hospital_admin`, `system_admin` and legacy `admin`. Route gates and controller assignment checks both matter: hospital staff must be assigned to the hospital they manage. User/account administration, global claim review, audit and email administration require `system_admin`. Global crawler/source operations permit legacy `admin` and `system_admin`.

Emergency bed creation remains login-free; standard bed requests and career applications require a user session. Urgent blood has its own guest-capable endpoint and urgency rules.

Reference-only `/api/tracking/:type/:reference` intentionally returns **only reference, status and updatedAt** for blood, bed, career or ambulance. It validates the format, applies a limiter and sets `Cache-Control: no-store`. It does not grant detail or mutation access. A public reference can disclose status, so it should still be treated as personal information when shared.

Private bed/blood/ambulance details require an owner, a permitted administrator/staff account or a valid private tracking token according to the endpoint. Guest tokens are cryptographically random or deterministically recovered from a private idempotency key using the server secret; only token hashes are stored. Comparison uses timing-safe verification. Keep private tokens out of logs and shared links. Patient cancellation/replies and staff transitions enforce actor permissions and valid state transitions with stale-update checks.

Career references are generated server-side with unique indexes and collision retries. Job/organization namespaces are `CAR-J` and `CAR-O`; submission and applicant-history serializers omit the application document `_id`. Authorized manager review APIs use internal IDs internally.

## Durable requests and emails

Idempotency headers and database uniqueness protect repeated submissions. Replaying a key checks ownership or guest credentials; a mismatched reuse returns 409. Saved request/application state remains durable when a secondary email attempt fails.

Independent bed/blood/career submission emails run concurrently with a cap of three per submission and are awaited before returning. This is not a global SMTP throttle. `EmailDelivery` event keys deduplicate sends; atomic leases prevent concurrent replay. Retryable message envelopes are AES-256-GCM encrypted using a key derived from `JWT_SECRET`. Verification/password-reset templates do not retain replayable token-bearing content and must be reissued. Changing the secret affects sessions, recoverable guest tokens and decryption of existing email envelopes; plan secret changes deliberately.

Only system administrators can inspect sanitized delivery metadata or trigger eligible retries. Sent means SMTP accepted the message; inbox delivery, provider receipt and patient care require separate evidence. In-app notification routes/models are removed; all email functions remain.

## Crawler and optional AI

- Approved source registry, public DNS and literal IP SSRF checks, redirect checks,
  robots enforcement and rate limits govern crawler fetches. DNS resolution and
  connection pinning, streaming byte caps and full-attempt timeouts are enforced.
  Unreadable robots policies fail closed; only genuine 404/410 permits missing
  robots. Legacy feeds enforce robots too. See [crawler](crawler.md).
  Blocked sources must remain blocked; external failures do not produce fabricated
  fallback providers or availability.
- Source registration is restricted to global administrators and validates URLs against the SSRF guard.
- Assistant inputs are trimmed, sanitized and capped at 500 characters. Provider credentials remain server-side. Provider failures use rule-based phrasing over the same stored data; broader failures return safe generic guidance.
- If an external AI provider is enabled, the message and directory context are transmitted to it. This is a data-processing decision, not simply a UI setting; see [privacy](privacy.md).
- Optional refinement suggestions require review and do not directly rewrite canonical availability.

## Errors, audit and secrets

The error handler normalizes common database/JWT/validation failures. Request logs record timestamp, request ID, method, matched route pattern, status and duration. Unmatched routes are logged as `<unmatched>` and 404 responses omit the submitted URL. Infrastructure/provider logs need their own review.

`AuditLog` records authentication, administration, verification and request lifecycle events with entity IDs and selected before/after fields. Authentication audits hash IPs with a secret-derived salt rather than storing the raw address; not every event includes an IP hash. Audit fields are not restricted to verification status. Detailed patient messages are held in request timelines, not public audit views.

Configure secrets through deployment environment variables: `JWT_SECRET`, MongoDB URI, SMTP credentials and optional AI/routing/refinement keys. Never place secrets in `NEXT_PUBLIC_*`, checked-in environment files, screenshots or logs. `.env.example` supplies configuration names, not deployment credentials. Production rejects weak/example JWT secrets and requires a unique random value of at least 32 characters.

## Verification limits

Automated coverage includes headers, input validation, RBAC, unassigned-hospital/other-user denial, guest tokens, reference-summary minimization, session replay/revocation, duplicate submissions, durable email failure/retry and bounded email concurrency. Database tests use isolated MongoDB and mock SMTP; browser suites cover all three variants. Current results and tests are listed in [release QA](release-qa.md).

Hosted TLS/CORS/cookies/proxy behavior, actual mailbox delivery, live source restrictions and deployment monitoring remain separate checks in [deployment](deployment.md). These documents make no HIPAA or other compliance certification claim.

## Security hardening — 2026-10-03

- Both protected and optional-auth routes require an active database-backed session.
  Sessionless access tokens fail with 401; an unavailable database fails closed
  with 503. Account status, auth version, session expiry/revocation and current
  role are read from MongoDB. JWT verification permits HS256 only.
- Nested/repeated/operator query parameters are rejected before database queries.
  Public campaign APIs hide pending/rejected/cancelled proposals from unrelated
  callers and omit creator account identities. Account email is never implicitly
  published as campaign contact email. Creator edits need fresh moderation.
- Career APIs validate every accepted resume URL alias. HTTP(S) links and base64
  PDF/Word uploads remain supported; executable/HTML/SVG/local URLs are rejected.
  Staff pages also refuse unsafe legacy resume links in all three variants.
- Authentication, detailed request and tracking responses use `Cache-Control: no-store`.
  Public hospital/career directory responses omit staff assignment IDs.
- `TRUST_PROXY=false` is the direct-connection default. Hosted deployments must
  specify trusted proxy IP/CIDR addresses, or a verified fixed hop count. Never
  use unrestricted trust. The E2E harness explicitly trusts loopback to simulate
  its separate browser clients; production settings do not inherit that seam.

See [security verification](security-verification.md) for executed checks and
remaining external configuration work. These controls cannot prove that an
application has no undiscovered vulnerabilities.
