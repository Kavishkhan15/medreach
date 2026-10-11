> Historical record: describes the removed acquisition system as it existed
> before 2026-10-06. See [stored data](stored-data.md) for the current architecture.

# Security verification — 2026-10-03

## Result

**PASS locally for the checks below.** No known npm advisories remain in the
workspace dependency audit. Confirmed code findings were fixed and regression
tested. This is not a claim that every possible vulnerability has been eliminated.
No commit, push, deployment, live SMTP message or external crawler scan was performed.

## Confirmed fixes

| Area | Previous failure | Current behavior and regression evidence |
| --- | --- | --- |
| Authentication | Disconnected MongoDB skipped account/session checks; sessionless JWTs were accepted | Both middleware paths require persisted active refresh sessions. Offline MongoDB yields 503; missing/revoked/expired sessions yield 401. Roles come from the current account. `securityHardening.test.js`, `securityRecords.mongo.test.js` |
| JWT/configuration | Verification allowed other HMAC algorithms; production accepted weak/example secrets | HS256 only, issuer/audience preserved, production requires a unique random secret of at least 32 characters. `securityConfiguration.test.js` |
| Query inputs | Parsed objects could enter Mongo filters; negative hospital limits could evade the cap | Nested/repeated/operator query values are rejected. Hospital pagination and coordinates are validated; results remain capped at 50. `securityHardening.test.js` |
| Campaign privacy/moderation | Public detail/status queries exposed unpublished proposals and creator account email; approved edits retained approval | Unpublished records require creator/admin access, public responses omit creator identity, and account email is never implicitly published. Creator edits return to pending review. Proposals have validation and rate limits. `securityRecords.mongo.test.js` |
| Resume URLs | Career APIs accepted executable/HTML/local URLs, while staff views accepted all data URLs | Every accepted alias is validated; HTTP(S) and PDF/Word uploads remain supported. Staff views refuse unsafe legacy links in every variant. Backend security suites and browser `security-hardening.spec.js` |
| Cache/log exposure | Private API responses could be cached; unmatched URLs were reflected/logged | Sensitive routes and authenticated/private-token responses use no-store. Logs use an unmatched sentinel; 404 responses omit URLs/query tokens. `securityHardening.test.js` |
| Proxy/rate limits | Every connection could supply a trusted forwarded IP | Direct connections default to no proxy trust. Explicit trusted IP/CIDR or fixed-hop configuration is supported. Login spoofing regression confirms headers cannot evade direct-connection limits. `securityConfiguration.test.js`, `securityHardening.test.js` |
| Frontend framing | API headers did not protect separately served frontend pages | All variants send anti-framing CSP/X-Frame-Options, nosniff and no-referrer headers. Browser tests verify homepage/login/tracking headers and content. CSP does not enforce script nonces. |
| Public directory | Staff assignment IDs appeared in public hospital/career directory responses | These responses omit the assignment field; server authorization continues using stored assignments. Existing directory/staff/application journeys pass. |
| Crawler SSRF | Hostname checks did not validate actual DNS answers, including IPv6 bypasses | All DNS answers must be public; socket lookups use the validated result. Each redirect is checked again. IPv4-mapped/private/reserved IPv6 and IPv4 ranges are blocked. `crawler/tests/networkSecurity.test.js` |
| Crawler resource limits | Bodies buffered before a character-count check; header arrival ended the timeout | Network bodies stream under a byte cap; declared oversize is refused before reading. DNS/header/body reads share the attempt timeout. Hostile robots wildcard patterns use iterative matching rather than regex backtracking. `networkSecurity.test.js` |
| Crawler policy | Unreadable robots failures allowed crawling; legacy feeds skipped robots checks | Genuine 404/410 permits a missing policy; unreadable/denied policies block pages. Named/general restrictions and separate origin caches are enforced. Legacy feeds obey initial/redirect policies and report blocked. Standalone/backend security files are checked for parity. `networkSecurity.test.js`, `layers.test.js` |

Guest emergency access remains login-free. Public reference-only tracking still
returns only reference/status/update time; detailed access and cancellation retain
owner/staff/admin/private-token authorization. Blood, ambulance and career flows,
all existing emails, and the removal of Google OAuth/in-app notifications remain intact.

Integration fixtures now create real persisted sessions instead of relying on
sessionless test tokens. Unit route tests use explicit account/session query mocks;
there is no authentication bypass enabled by NODE_ENV=test.

## Executed release checks

| Check | Result |
| --- | --- |
| `AI_PROVIDER=rule_based npm run backend:test:db` | 289 passed, 0 failed, 0 skipped; all database suites enabled |
| `npm run crawler:test:offline` | 142 passed, 0 failed, 0 skipped; live-network suite explicitly excluded |
| All three production builds | Passed on Node 24.21.0; React 18.3.1 retained |
| `npm run test:e2e` with disposable MongoDB | 93 passed across Bootstrap/Tailwind/Skeleton; includes all previous 87 journeys and 6 new security journeys |
| `npm audit --json` | 0 info/low/moderate/high/critical advisories; workspace lockfile audited |
| `git diff --check` | Passed |

The new browser header check initially used an ambiguous main-element selector;
correcting it to the existing #main container resolved the test failure. The final
complete browser run passed. Maps network loading and outbound SMTP are disabled
in the deterministic browser fixtures; mock SMTP tests cover email delivery/failure/retry.
The rate-limit spoofing test deliberately sends forwarded headers to a direct
connection, which can emit express-rate-limit's configuration warning while the
asserted requests are correctly limited.

Commands and test evidence use disposable local databases. The backend gate drops
its isolated databases; never run it against production. Build configuration uses
http://localhost:4000 and an empty Maps key only for deterministic verification.
Installed workspace dependencies, application Maps credentials and real SMTP
credentials were not broadly upgraded or overwritten.

## Requires live verification

- Verify hosted TLS, preserved frontend/API headers, exact CORS origins, secure
  cookies, correct public API URLs and the actual TRUST_PROXY/network boundary.
- Confirm deployment secrets are unique/strong and rotate any formerly exposed
  credentials through the host. Redaction of ignored local notes does not prove
  rotation. JWT rotation also affects sessions, recoverable guest tokens and
  encrypted retry envelopes, so coordinate it with existing stored data.
- Confirm actual mailbox receipt and authorized retry using the existing SMTP
  setup. The owner previously confirmed Bootstrap delivery; this pass sends no
  new live emails.
- Run permitted live crawler sources separately. DNS availability, source
  restrictions and live outcomes are external evidence; never bypass robots or
  rate limits.
- Validate hosting/database access controls, backups, retention and monitoring.
  This pass did not repeat the prior backup/restore drill or access hosted services.

No action is needed on retired Google OAuth or in-app notifications. Dependencies
have no reported advisory requiring an upgrade in this audit. See [deployment](deployment.md),
[security](security.md), [crawler](stored-data.md) and [release QA](release-qa.md).

## Role restructuring (local implementation, rollout pending)

The current code implements `system_admin`, `provider_admin` and `user`. Global legacy `admin` permissions are retired. Old hospital assignments remain scoped compatibility until separately reviewed migration. Provider membership checks are enforced by the API, and account/assignment changes invalidate sessions. Provider invitations and notification contacts use hashed single-use tokens; demo defaults are restricted to isolated local demo databases with outbound email disabled.

No production migration or deployment was performed. The confirmed local development database has been inventoried; only the owner-approved local administrator conversion was applied. Actual remote inventory remains pending, and deployment requires a separately reviewed System Admin access path to prevent lockout. See [implementation and verification report](../ROLE_RESTRUCTURING.md).
