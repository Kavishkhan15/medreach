# Release QA

## Local crawler-removal verification — 2026-10-06

The application now reads the existing dataset from MongoDB through the shared
Express API. No crawler runtime, scheduler, source-management route, crawl
control or crawler page is part of this build. No commit, push or deployment was
performed in this pass. Unused `CrawlJob` and `CrawlResult` Mongoose models were
also removed; their MongoDB collections remain untouched.

| Check | Result |
| --- | --- |
| Backend database gate | 281 passed, 0 failed, 0 skipped on a fresh disposable MongoDB instance after the final code cleanup |
| Production builds | Bootstrap, Tailwind and Skeleton passed |
| Browser journeys | 123 passed, 0 failed, 24 pre-existing Bootstrap-navbar-only cases skipped across the other variants |
| Removed routes | `/api/crawler/*`, `/api/sources`, `/admin/crawler` and `/admin/sources` returned 404 |
| Stored-data API | A copy of the existing local dataset returned 30 hospitals, 4 blood banks, 17 diagnostics providers, 1 ambulance provider and 33 jobs |
| Search | Hospital search on the copied dataset returned a matching stored provider |
| Data counts | All 25 pre-existing collections in the copied dataset kept identical counts (107 documents total) across API checks |
| Patch | `git diff --check` passed |
| Dependency audit | `npm audit --audit-level=high` found 2 pre-existing advisories: critical `proxy-addr` and high `source-map-js`; dependency versions were unchanged by crawler removal |

The browser suite covers hospital/resource discovery, homepage directory search
and filters, map entry and provider actions, careers search/applications, bed and
blood requests, ambulance booking, tracking, login and staff/admin flows. The
24 skipped cases are navbar-design tests scoped to Bootstrap; shared navigation
and route behavior is covered by other cross-variant journeys. Google Maps tiles
require a browser key and remain outside deterministic fixture checks.

The original local MongoDB files at `/home/anonymous/data/db` were copied for
read-only inspection. API checks used that copy on a separate port; automated
tests used a different, freshly created MongoDB directory. The original files
were not opened by the application or test suites. The copied API process added
two empty Mongoose collections, but no pre-existing collection lost documents.
These local checks do not establish hosted database counts or deployment status.
The dependency advisories require a separate dependency update and regression
check before a release gate can pass.

## Repeatable verification

Use Node.js 22.19.0 or newer and a **disposable MongoDB instance**. Database
integration and Playwright fixture scripts drop their named test databases. Do
not point them at the existing product dataset.

```sh
npm ci
npm run backend:test:db
NEXT_PUBLIC_API_URL=http://localhost:4000 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY='' npm run build:variants
MEDREACH_E2E_MONGO_URI=mongodb://127.0.0.1:27017/medreach_e2e MONGODB_URI=mongodb://127.0.0.1:27017/medreach_e2e AI_PROVIDER=rule_based npm run test:e2e
npm audit --audit-level=high
git diff --check
```

`npm run release:check` also requires isolated backup-source and restore-target
URIs; see [deployment](deployment.md). Hosted `/health/ready`, maps, cookies,
SMTP inbox receipt and provider participation require separate live checks.

Older crawler-era verification is preserved as dated history in
[security verification](security-verification.md),
[fusion verification](Hospital_Data_Fusion_Verification_Report.md) and
[frontend parity](PARITY_VERIFICATION.md). Those reports do not describe the
current acquisition architecture.
