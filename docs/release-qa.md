# Release QA

## Hosted deployment checks — October 7, 2026

- Bootstrap: `https://medreach-three.vercel.app`.
- Express API: `https://medreach-production.up.railway.app`.
- Atlas migration verified 30 collections and 2,711 documents, including BSON
  content and indexes. Local MongoDB and the private archive were preserved.
- Railway readiness returns 200 with MongoDB connected. Public hospital, blood
  bank, diagnostic, ambulance and job APIs return stored data. CORS permits the
  Bootstrap production origin.
- Read-only browser checks verified directory search, category filters, provider
  selection, primary route loading, mobile menu behavior and login visibility
  on scroll. No runtime errors or unexpected failed responses were observed.
- Interactive Maps showed its fallback at the last browser check. Maps setup
  and a subsequent live verification remain pending.
- Production sign-in, request/application submission and email delivery have
  not been verified end to end. Trial-plan SMTP is blocked by Railway; an HTTPS
  email integration remains necessary for that plan.
- All nine Actions checks passed on `901b7e2`. The two vulnerable dependencies
  were patched in `ada1af1`; the security gate reported zero vulnerabilities.
- Only the successful `medreach` service remains in Railway. Earlier failures
  for auto-imported workspaces remain attached to their original commit and do
  not imply current Actions failures. See [cloud deployment](cloud-deployment.md).

The following sections record earlier local verification at their stated dates.

## Vercel + Railway + Atlas preparation — 2026-10-07

The selected architecture uses independent Vercel frontends, the persistent
Express API on Railway, and a verified copy of the existing MongoDB dataset on
Atlas. The unshipped Vercel backend function, external cron, temporary upload
transport and their dedicated tests were removed. The existing server's
request-expiry worker and original application/email flows remain.

| Check | Result |
| --- | --- |
| Backend database gate | 281 passed, 0 failed, 0 skipped; all ten database gates pointed to an isolated MongoDB instance on port 27028 |
| Production builds | Bootstrap, Tailwind and Skeleton passed |
| Browser journeys | 123 passed, 0 failed; 24 pre-existing Bootstrap-only cases skipped in Tailwind/Skeleton |
| Resume payload | Existing 4 MiB PDF upload/submission and stored base64 content passed in all three variants |
| Railway configuration | Validated against Railway's published JSON schema; Railpack, repository-root start command, one replica, sleep disabled, readiness and 35-second drain |
| Dependency installation | Backend-only production workspace install succeeded in a separate temporary directory; repository dependencies were not changed |
| Process smoke | Production startup on supplied PORT, Mongo readiness, retired cron/upload endpoint 404s and clean SIGTERM exit passed |
| Stored-data preservation | All 30 collections and 2,711 documents matched a disposable restored copy in counts, indexes and BSON content; original counts unchanged |
| Patch | `git diff --check` passed; `run.sh` unchanged |

The backend-only dependency audit still reports the pre-existing critical
[`proxy-addr` advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).
Dependency versions were not changed in this hosting switch. Review this before
production launch; this pass does not claim a clean dependency audit.

Atlas provisioning and Railway authentication are still required. No migration
to Atlas or hosted backend deployment occurred. The previous Bootstrap Vercel
project was deleted; create a fresh project and configure its build-time API URL
with the eventual Railway HTTPS origin. Publishing the code is a separate step
from this local verification.
Hosted cookies, SMTP delivery, Maps restrictions and worker operation still need
verification after [cloud setup](cloud-deployment.md). Local browser fixtures do
not certify these integrations or broad accessibility.

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
