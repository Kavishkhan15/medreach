# Release QA

## Verified locally — 2026-10-03

This pass covers notification removal, bounded submission email concurrency,
stability/polish changes and the subsequent security hardening in the working tree. Nothing was committed, pushed
or deployed.

| Check | Evidence |
| --- | --- |
| Backend database gate | 289 passed; zero failures/skips; every database suite enabled |
| Crawler offline gate | 142 passed; live-network suite explicitly excluded |
| Production builds | Bootstrap, Tailwind and Skeleton passed |
| Chromium journeys | 93 passed; no skipped tests; includes all former 66 journeys |
| Dependencies | `npm audit --audit-level=high`: zero vulnerabilities |
| Patch | `git diff --check` passed |
| Real process shutdown | Local SIGTERM and SIGINT each exited with code 0 |

The browser journeys cover submission, staff review, information exchange,
acceptance/rejection, completion/cancellation/expiry, private detailed tracking,
blood, ambulance, careers, authentication, administration and assistant actions.
Additional checks cover dashboard section failures/targeted retry, reset-email
feedback, responsive navigation, public references, clipboard denial, frontend
security headers and refusal of unsafe legacy resume links.

Skeleton career tracking fits at 320, 375, 768 and 1440px. Bootstrap/Tailwind
tracking cards retain their behavior. Dashboard references copy and open the
public career status lookup in all variants. Legacy references are persisted
before they are exposed in history. Confirmation emails include the persisted
`CAR-...` reference and a tracking URL; MongoDB document IDs are not tracking IDs.

Shutdown tests cover active HTTP/worker draining, repeated signals, cleanup
failures, deadline handling and readiness. Separate real API processes were
started against local test MongoDB and stopped through SIGTERM and SIGINT.

[Submission latency verification](latency-verification.md) records the measured
SMTP batching improvement, benchmark command and regression coverage. The local
measurements use simulated SMTP delays; hosted timings remain unverified.

Browser mutations use disposable fixtures with outbound email disabled. Email
content/delivery/failure/retry tests use mock transports. Google Maps loading is
disabled in the deterministic QA builds; fallback and contact actions are tested,
and application Maps credentials are unchanged. No production fixture providers
or availability are introduced. These are functional checks, not a complete
accessibility or visual-regression certification.

## Repeatable commands

Use Node.js >=22.19.0, workspace dependencies, Chromium and disposable MongoDB on
localhost:27017. When starting mongod, set an adequate open-file limit (for
example `ulimit -n 65536`). Test suites drop their test databases; never point
them at a production server.

```sh
npm ci
npx playwright install --with-deps chromium
npm run backend:test:db
npm run crawler:test:offline
npm audit --audit-level=high
NEXT_PUBLIC_API_URL=http://localhost:4000 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY='' npm run build:variants
MEDREACH_E2E_MONGO_URI=mongodb://127.0.0.1:27017/medreach_e2e MONGODB_URI=mongodb://127.0.0.1:27017/medreach_e2e AI_PROVIDER=rule_based npm run test:e2e
git diff --check
```

`npm run release:check` also requires `MEDREACH_BACKUP_SOURCE_URI` and a separate
`MEDREACH_RESTORE_VERIFY_URI` whose database name contains `restore_verify`.
See [deployment](deployment.md) for the backup/restore drill. This pass did not
rerun that drill; backup/restore code and indexes were unchanged.

## Documentation review — 2026-10-03

The README, current subsystem guides and research/history notes were checked
against source. This documentation pass does not claim a new full test run;
the results above are the completed latency/stability regression pass.

Remaining repository limits identified by source inspection:

- Crawler DNS pinning, streamed byte limits, complete attempt timeouts and
  fail-closed robots handling are now implemented in both copies. Legacy feed
  crawling also enforces robots. See [security verification](security-verification.md).
- Saved primary state is durable, but audit/email intent persistence has no
  transactional outbox guarantee. Email batching is per submission, not global
  SMTP throttling. See [latency](latency-verification.md).
- Stored requests/applications include sensitive patient/contact/resume data.
  Public campaign responses no longer include creator identity; retention and
  production data policy still need review. See [privacy](privacy.md).
- Research scoring still uses illustrative inputs; measurement wrappers can mask
  audit failures. Use the strict release gate, not a research score, to judge
  readiness. See [evaluation](../evaluation/README.md).

The documentation-only review preceded the security code/configuration fixes.
No deployment was performed.
Credentials were redacted from ignored local deployment notes; that does not
rotate the original credentials. Rotation must be handled through the host.

## Requires live verification

- The owner reported successful real Bootstrap SMTP delivery. This pass preserves
  that setup and did not send new live messages. Receive actual confirmation and
  status emails from each hosted variant and check references/tracking links.
- Test a controlled SMTP failure and authorized retry. Mail-server acceptance
  does not prove inbox receipt. Auth-link emails require newly issued links;
  sensitive expired tokens are not replayed from delivery history.
- Run `npm run crawler:test:live` separately against permitted sources. Confirm
  source-specific outcomes and review stale/conflicting data. Safe classification
  of a blocked/failed source does not prove successful ingestion. Do not bypass
  robots, rate limits, allowlists or access restrictions.
- Inspect GitHub Actions for the current main/deployment commit. Remote CI was
  not queried in this pass; local green results do not prove remote CI status.

## Blocked by deployment configuration

The current local environment uses `PUBLIC_APP_URL=http://localhost:3000`, local
CORS origins and the frontend API fallback `http://localhost:4000`. These work
locally and must be replaced in the hosting environment before deployment.

- Supply HTTPS `NEXT_PUBLIC_API_URL` **before building each frontend**.
- Set HTTPS `PUBLIC_APP_URL` for canonical email verification/reset/tracking
  links. The shared backend uses one canonical frontend origin in emails.
- Supply exact HTTPS `CORS_ORIGINS` for every hosted frontend.
- Configure production MongoDB, `JWT_SECRET`, `NODE_ENV=production` and SMTP.
  Cross-site cookies use `COOKIE_SAME_SITE=none`, `Secure` and `HttpOnly`;
  same-site hosting may use `lax`. Verify actual hosted browser cookie behavior.
- Give the host more than the backend's 30-second shutdown deadline.

After hosting, verify public `/health/live`, `/health/ready`, `/track`, a directory,
login/refresh/logout and authorization for another user's/unassigned hospital's
records. Readiness returns 503 during shutdown or MongoDB loss.

## No action needed

Google OAuth and the in-app notification inbox/API are intentionally removed.
Do not restore their callbacks or dashboard cards during deployment verification.
Password sign-in and transactional emails remain supported.
