# Release verification

[Documentation](README.md) · [Project overview](../README.md)

This guide owns dated test results and safe reproduction commands.
Documentation capture on 22 October 2026 does not imply the full product suite
was rerun that day. The completed code verification below belongs to baseline
[`1f870b4`](https://github.com/kasim672/medreach/commit/1f870b401f63ac5612217a1626259acfd278b913),
verified on **21 October 2026**.

## Local CI repair — 23 October 2026

The pushed documentation commit `3523449` had two failing causes: the backend
account-control test received a transient 409, and the evaluation dependency
gate rejected newly reported Next.js/Nodemailer advisories. Two sibling
evaluation jobs were cancelled; frontend builds, browser journeys and Vercel
checks succeeded. The separate SEO implementation was still uncommitted.

Local fixes wait for mutation-lease cleanup before sending guarded HTTP
responses, retain the same permission checks/status bodies, and update Next.js
to 15.5.28 and Nodemailer to 10.0.10. The new regression reproduced headers
being sent before cleanup, then passed after the fix. The helper's focused
line/branch/function coverage is 100%; that is not whole-application coverage.

The local SEO work also changed the footer logo's accessible name and the
custom 404 heading. Browser selectors now support these names while requiring
the original wordmark source, visibility and an actual HTTP 404 for the retired
route. No assertion was skipped or weakened to hide a functioning route.

| Local check | Result |
| --- | --- |
| Strict backend suite, all 14 database gates | 359 passed, 0 failed, 0 skipped |
| Focused unit suite | 17 passed |
| Builds with existing local SEO work | Bootstrap, Tailwind and Skeleton passed; 41 generated pages each |
| Dependency gate | `npm audit --audit-level=high`: 0 known vulnerabilities |
| Lint | 0 errors, 12 existing hook dependency warnings |
| Targeted logo/404 browser journeys | 15 passed across all variants |
| Full browser matrix | 269 passed, 0 failed, 40 existing scope skips; 309 project cases |
| Generated SEO endpoints | Robots, 12-URL sitemap, hospital metadata/canonical and custom 404 passed across all variants |
| Lockfile | `npm ci --dry-run --ignore-scripts` passed |
| Documentation references | 346 local targets resolve |

Database-changing checks used a disposable MongoDB under `/tmp` on port 27139,
with email disabled/mocked. The canonical recovered database was not accessed.
These are local verification results collected before publication. The fixes
and SEO work are being published in focused commits; remote CI results must
be checked on the latest commit separately. Rerunning the original commit alone
does not include the patches.

## Completed release checks

| Check | Result |
| --- | --- |
| Strict backend database gate | **352 passed**, 0 failed, 0 skipped; all 14 database gates enabled |
| Focused unit tests | **15 passed**, 0 failed |
| ESLint | **0 errors**, 12 existing hook dependency warnings |
| Production builds | Bootstrap, Tailwind and Skeleton passed |
| Complete browser matrix | **269 passed**, 0 failed, 40 explicit scope skips; 309 project cases |
| Dependency gate | `npm audit --audit-level=high`: **0 vulnerabilities** at collection time |
| Disposable backup/restore | **16 collections, 539 test documents** restored; no restore failures |
| Patch whitespace | `git diff --check` passed |
| GitHub Actions | All 10 Action jobs successful across CI and evaluate workflows |
| Vercel checks | All 3 deployment status checks successful |

[Successful CI run](https://github.com/kasim672/medreach/actions/runs/39489882190)
· [Evaluation run](https://github.com/kasim672/medreach/actions/runs/39489882189)

The 40 scope skips are Bootstrap-only UI: 12 manual-credential cases and 28
navbar/footer/homepage/demo-media cases on Tailwind/Skeleton. Shared workflows
still execute across all three variants. See [parity scope](PARITY_VERIFICATION.md).

The earlier `929a101` CI failure included a pending-SMTP fixture relying on
developer environment settings. That failure reproduced with SMTP configuration
absent. The fixture now supplies isolated mock settings; the focused regression
passed **18 tests** under the same condition. Browser fixtures/selectors and
independent request-history states were also corrected. Historical commit
badges retain their historical results; they do not describe later commits.

## Reproduce safely

Use Node.js ≥22.19.0, installed workspace dependencies and a **disposable local
MongoDB instance**. CI uses Node.js 24. These suites recreate fixture databases.
Never point them at the recovered `medreach` database or any remote dataset.

The strict runner lists 14 URI variables and exact database names in
`scripts/verify-backend-tests.mjs`. A port override changes their default
loopback addresses while preserving the guarded database names:

```sh
npm run lint
node --test tests/unit/*.test.mjs
MEDREACH_TEST_MONGO_PORT=27129 npm run backend:test:db
npm audit --audit-level=high
git diff --check
```

The runner forces rule-based AI and disables real email. Email tests explicitly
enable mock transports. Plain `npm test` permits database suites to skip and is
not the strict verification gate.

### Production builds and browser journeys

Install Playwright Chromium with `npx playwright install chromium`.
An installed Chrome can alternatively be selected with
`MEDREACH_PLAYWRIGHT_CHANNEL=chrome`; install Playwright FFmpeg for configured
video artifacts using `npx playwright install ffmpeg`.

With a disposable MongoDB already listening on `27129`:

```sh
export MEDREACH_E2E_MONGO_URI=mongodb://127.0.0.1:27129/medreach_e2e_verification
export MEDREACH_E2E_API_PORT=4400
export MEDREACH_HOME_TEST_API_URL=http://localhost:4400
export MEDREACH_BOOTSTRAP_E2E_PORT=3400
export MEDREACH_TAILWIND_E2E_PORT=3401
export MEDREACH_SKELETON_E2E_PORT=3402
export MEDREACH_E2E_DIST_DIR=.next-verification
export NEXT_PUBLIC_API_URL=http://localhost:4400
export NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=''
npm run build:variants
npm run test:e2e
```

Build-time API URLs and browser server URLs must match. The harness manages its
own servers; do not reuse a normal backend connected to real data. The empty
Maps key applies only to this test build, verifying the honest map fallback
without external quota. A configured live map needs a separate check.

### Complete release gate

After setting the browser variables above, also provide disposable backup and
restore targets and the backend test port:

```sh
export MEDREACH_TEST_MONGO_PORT=27129
export MEDREACH_BACKUP_SOURCE_URI="$MEDREACH_E2E_MONGO_URI"
export MEDREACH_RESTORE_VERIFY_URI=mongodb://127.0.0.1:27129/medreach_restore_verify_verification
npm run release:check
```

The restore target must be an explicitly disposable `restore_verify` database.
Read `scripts/verify-mongo-backup.mjs` before running: it **drops the target
database** after validating its name. A `restore_verify` marker does not prove
that the existing records are disposable; confirm the exact target yourself.
The combined command runs backend,
audit, three builds, browser journeys, backup/restore verification and whitespace
checks. Lint and focused unit tests are separate commands, also run by CI.

## Coverage

### Documentation refresh — 22 October 2026

- 33 Markdown guides checked; 263 local link/anchor/image targets resolve.
- GitHub's GFM renderer accepted the README, including its tables, image alt
  text and collapsible setup section.
- 14 actual public-page JPEG captures across all variants; about 1.6 MB total,
  no horizontal overflow in the captured desktop/mobile states.
- Capture-script syntax and four URL safety guards passed; remote origins,
  credential-bearing URLs, paths and query strings were refused.
- Lint rerun: 0 errors, the same 12 warnings. Focused unit rerun: 15 passed.
- All 34 canonical collection document hashes/counts matched before/after capture.

Backend suites, full browser regression tests and production builds were not
rerun for this documentation-only refresh. The screenshots used the existing
production builds from the recorded code baseline above.

### Product regression coverage

- Roles, direct API denial, organisation isolation, provisioning, activation,
  recovery, session revocation and last-System-Admin protection.
- Provider application persistence, approval/rejection, duplicate prevention and
  confirmed mutation feedback when a later refresh fails.
- Standard/emergency beds, normal/urgent blood, donation, ambulance, Careers,
  user request history and private/public tracking boundaries.
- Loading, genuine empty, failed/malformed reads and targeted Retry.
- Independent homepage loading, deferred jobs/campaigns and resource-specific retries.
- Account query batching, compact jobs, public compression/ETags and private no-store.
- Durable notification persistence, recovery, encryption, recipient eligibility,
  deduplication, bounded retries and uncertain transport outcomes.
- Responsive navigation, assistant, demo media and account workflows.

## Data preservation

Recorded canonical inventory: **60 users, 30 hospitals, 28 resource providers,
256 jobs and 56 memberships**. The 3-user count in the local recovery report is
a historical snapshot before later approved provisioning, not a target to reset to.

Release tests and the restore drill used a separate MongoDB process under `/tmp`
on port `27129`. That process was stopped afterward. No recovered accounts,
password hashes, healthcare records, assignments or backups were migrated/reset.

The documentation refresh uses public, read-only previews. Its capture method,
manifest and data-integrity comparison are documented in the
[screenshot gallery](screenshots/README.md).

## Limits

Local tests and green deployment checks do not establish real inbox receipt,
hosted cookies/CORS/proxy correctness, production p95 latency, load capacity,
external AI quality, live Maps credentials, complete assistive-technology
coverage or a production restore. Evaluation risk inputs remain placeholders.
See [deployment checks](deployment.md), [performance evidence](latency-verification.md)
and [research limits](../evaluation/README.md).
