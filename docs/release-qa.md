# Local verification

Evidence date: 21 October 2026. Dataset-changing checks use isolated local fixtures.
A successful build is not evidence of hosted readiness or real email receipt.

## Latest checks

| Check | Result |
| --- | --- |
| Backend strict database gate | 352 passed, 0 failed, 0 skipped; all 14 database gates enabled |
| Focused unit tests | 15 passed, 0 failed |
| ESLint | 0 errors; 12 existing hook dependency warnings |
| Bootstrap production build | Passed |
| Tailwind production build | Passed |
| Skeleton production build | Passed |
| Browser matrix, offline Maps build | 266 passed, 0 failed, 40 explicit scope skips across 306 project cases |
| Final booking feedback regression | 12 passed across all three variants after the final message changes; includes 3 new project cases |
| Dependency audit | `npm audit --audit-level=high`: 0 vulnerabilities; compression 1.8.2 installed |
| CI email fixture regression | 18 tests passed with SMTP settings explicitly absent before fixture setup |
| Database inventory | 60 users, 30 hospitals, 28 resource providers, 256 jobs, 56 memberships |
| Documentation links / whitespace | 126 local link targets resolve across 31 tracked Markdown files; `git diff --check` passes |

## Reproduce safely

Requires Node.js >=22.19.0, installed workspace dependencies and a disposable
local MongoDB service. Tests drop their own databases. Never use the recovered
`medreach` database, a remote database or an existing provider dataset.

The strict backend runner lists each URI variable and exact database name in
`scripts/verify-backend-tests.mjs`. There are 14 gates. Individual URI overrides
must retain the expected names. A port override changes default loopback URIs:

```sh
MEDREACH_TEST_MONGO_PORT=27129 npm run backend:test:db
npm run lint
node --test tests/unit/*.test.mjs
git diff --check
```

The runner forces rule-based AI and disables real email. Tests explicitly
enable mock transports where needed; no SMTP credentials are displayed or
changed.

### Browser setup

Install Playwright's Chromium using `npx playwright install chromium`, or install
`npx playwright install ffmpeg` and use an already installed Chrome with
`MEDREACH_PLAYWRIGHT_CHANNEL=chrome`.
The latter was used for these local checks.

An example isolated configuration, from the repository root:

```sh
export MEDREACH_E2E_MONGO_URI=mongodb://127.0.0.1:27129/medreach_e2e_performance
export MEDREACH_E2E_API_PORT=4400
export MEDREACH_HOME_TEST_API_URL=http://localhost:4400
export MEDREACH_BOOTSTRAP_E2E_PORT=3400
export MEDREACH_TAILWIND_E2E_PORT=3401
export MEDREACH_SKELETON_E2E_PORT=3402
export MEDREACH_E2E_DIST_DIR=.next-performance-offline
export NEXT_PUBLIC_API_URL=http://localhost:4400
export NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=''
export MEDREACH_PLAYWRIGHT_CHANNEL=chrome
npm run build:variants
npm run test:e2e
```

Build and browser API URLs must match. Global setup recreates only the
explicitly named E2E fixture database. The harness starts and stops its own
servers; do not reuse a normal application server connected to real data.
The empty Maps key applies only to the test build, verifies the unavailable-map
fallback and prevents external quota usage. It does not change normal env files.

## Coverage and evidence

- Role checks, direct API denial, provider isolation, provisioning, account
  activation/recovery, session revocation and last-System-Admin protection.
- Provider application persistence, approval/rejection, duplicate prevention
  and confirmed mutation feedback despite refresh failure.
- Standard/emergency bed, normal/urgent blood, donation, ambulance, Careers,
  user request histories and private/public tracking boundaries.
- Loading, true empty, failed/malformed responses and targeted Retry.
- Independent homepage resources, delayed below-fold loading and targeted retry.
- Provider Account query batching, compact job contracts, public compression,
  ETag revalidation and unchanged private no-store policy.
- Queued notification persistence, restart, backoff, encryption, recipient
  revocation, duplicate control and ambiguous transport outcomes.
- Responsive navigation, homepage/demo media, assistant and account workflows.

### Test-first evidence and test maintenance

Before production edits, existing dashboard tests reproduced missing
resource-specific states. New tests also failed on unbatched account reads,
full job previews, missing compression and the absent durable outbox.
The corresponding focused regression tests passed after implementation.

Old browser failures also included undefined job fixtures, outdated accessible
button names/account labels, Maps scripts intercepted as API JSON, and
Bootstrap-only credential tests scheduled against other variants. These were
corrected without weakening product authorization or hiding real errors.

The first updated browser matrix completed with 261 passes, 5 failures and 40
explicit scope skips. Those five failures were test expectations: the old
single loading-status selector and job assertions before scrolling to the
new deferred section.

A subsequent configured-Maps run had 263 passes, 3 failures and 40 scope skips:
one asynchronous test-counter assertion was corrected and passed a targeted
three-variant rerun; two Skeleton cases reported Google's Maps demo quota error.
The final matrix uses an isolated offline-Maps build to test deterministic
fallbacks. Live map rendering remains a separate environment check.

The completed offline matrix passed 102 Bootstrap, 82 Tailwind and 82 Skeleton
journeys. Each of Tailwind and Skeleton has 20 explicit Bootstrap-only scope
skips. No unscoped test failures remain in that matrix.

A subsequent notification-feedback review corrected ambulance confirmation copy
to distinguish queued, accepted and uncertain delivery. All three frontends
were rebuilt. The new three-variant regression and nine affected booking
journeys passed: 12 checks, no failures/skips. Combined with the full matrix,
269 distinct applicable project cases have been verified. The complete
current discovery contains 309 cases including the 40 intentional scope skips.

Manual credential UI tests are explicitly Bootstrap-only (12 project cases
skipped). Existing Bootstrap-only navbar/footer/video cases account for the
other 28 scope skips. Shared responsive, navigation and workflow tests still
run in all three variants. See [parity scope](PARITY_VERIFICATION.md).

## CI regression review

The previous `929a101` GitHub run passed all three builds but failed backend
and browser jobs. Backend logs showed the pending-SMTP test timing out because
its mock relied on developer environment settings. With SMTP configuration
explicitly cleared, the problem reproduced locally; the suite now supplies
isolated mock settings and all 18 checks pass under that same condition.

Browser failures included missing job fixtures, obsolete selectors, collapsed
dashboard history states and Bootstrap-only credential expectations scheduled
against the other variants. Their fixes are covered by the results above.
CI now also runs lint and focused unit tests. Its browser build uses an empty
Maps key to test the fallback without consuming external quotas.

The GitHub status of a historical commit remains historical. New commit checks
must be inspected separately; local passes alone do not establish remote CI success.

## Data preservation and limits

Only the confirmed local canonical database was read for before/after counts
and query/payload measurements. Database-changing tests used a separate MongoDB
process and directory under `/tmp`, on port 27129. No recovered accounts,
password hashes, assignments, healthcare records or backups were migrated/reset.

Ignored personal/local documentation notes were preserved. Superseded tracked
implementation reports, duplicate deployment guides and retired crawler
instructions were consolidated into the current architecture, security,
deployment and data guides. Historical fusion evidence and research protocols
remain explicitly historical/proposed.

Not verified here: hosted browser cookies/CORS/proxies, real Resend/SMTP receipt,
production load capacity, external AI quality, live Maps credentials, full
assistive-technology coverage or a production migration/restore. The combined
`release:check` command additionally requires explicit backup/restore targets;
that destructive-to-fixtures restore drill was not run against recovered data.
