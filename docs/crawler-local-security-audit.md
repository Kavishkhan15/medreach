> Historical record: describes the removed acquisition system as it existed
> before 2026-10-06. See [stored data](stored-data.md) for the current architecture.

# MedReach local crawler redirect audit — 2026-09-14

## Security fix update — 2026-10-03

The earlier DNS, full-body timeout/size and unreadable-robots findings below are
superseded by tested fixes in both crawler copies. Actual connections pin public
DNS answers, bodies stream under a byte cap, and the timeout includes DNS and
body reads. Unreadable robots policies deny crawling; only genuine HTTP 404/410
permits a missing policy. Legacy feeds now check robots on initial/redirect URLs.
See [security verification](security-verification.md) and [current crawler](stored-data.md).
The dated audit evidence below is preserved as history.


## Source correction before the security fix — 2026-10-03

The sections below preserve the **2026-09-14 audit**, including its original
counts and unresolved findings at that time. They are historical evidence, not
a statement of current release health. The latest executed local gate is in
[Release QA](release-qa.md); current crawler operation is in [crawler](stored-data.md).
No external website was contacted for this documentation update.

Current code inspection confirms:

- The legacy `BaseAdapter.fetchRaw()` in both crawler copies now supplies
  `validateRedirect`: cross-origin and unapproved same-origin paths are refused
  before fetch. Config-only sources remain restricted to their original path and
  query. `crawler/tests/layers.test.js` contains legacy blocked/allowed redirect
  regressions. The earlier “Open” legacy redirect finding is superseded.
- Robots 401/403 responses and off-origin/unapproved robots redirects now set
  `denied`, and `isAllowedByRobots()` rejects page crawling. The earlier claim
  that a rejected robots redirect becomes a permissive missing file is superseded.
  Other unreadable robots failures still produce `no_robots` and allow pages.
- `server.js` now starts the optional `crawlerScheduler` and drains active
  crawler/expiry work on shutdown before disconnecting MongoDB. The prior claim
  that no automatic scheduler is wired is superseded; it requires
  `CRAWLER_SCHEDULER_ENABLED=true`.
- DNS resolution/pinning is still absent from `httpFetcher.js`/`ssrf.js`.
  `res.text()` still buffers the body before the size check; its timeout is
  cleared after headers. These limitations are **not resolved** by redirect
  boundary validation.
- Backend dry-run still records a CrawlJob while avoiding provider data writes.
  Do not interpret it as zero writes to every collection. The standalone CLI
  defaults to an in-memory repository.

`cmp` confirmed the current BaseAdapter, HTTP fetcher and robots checker match
between `crawler/src` and `backend/src/_crawler` during this docs review. This
review does not establish whole-repository byte parity or a new live-source run.

## Original audit — 2026-09-14

Scope: local repository inspection, injected-fetch mocks, test suites, and frontend builds. No hospital or government website was contacted for exploit testing. This audit does not establish data leakage or a vulnerability in any external website.

## A–E. Findings, severity, reproduction, evidence, and fix status

| Finding | Severity | Local evidence | Status |
| --- | --- | --- | --- |
| Redirect from an approved hospital page to another public host or to an unapproved path | Medium: source-scope bypass and potential data pollution; no private-network access or leakage demonstrated | `crawler/tests/layers.test.js` injects 302 responses and records every mocked fetch. Cross-origin and unapproved-path destinations are absent from the visit lists. The active `guardedFetch` path checks origin, path, and robots for each hop. | Fixed for hospital-site and directory adapters. The three patched files are byte-identical in `crawler/src/` and `backend/src/_crawler/`. |
| Redirect from `/robots.txt` to another host | Medium policy-boundary issue | Injected mock records only the original robots URL. `robotsChecker.loadRobots()` rejects the redirect target. | Off-host request blocked. However, the failure is then treated as missing robots and page fetching may proceed; see remaining weaknesses. |
| Legacy `BaseAdapter.fetchRaw()` redirect to another public host | Medium, local code path; no external impact demonstrated | An injected mock returned 302 from `https://example.org/approved` to `https://example.net/outside`. `fetchRaw()` returned `ok: true`, and both URLs were visited. `BaseAdapter` calls `httpFetch()` without `validateRedirect`. | Open in the legacy `crawlSource()`/generic adapter path in both crawler copies. This path is separate from the current hospital-site/directory orchestrators. |

Local reproduction of the remaining legacy issue: instantiate `BaseAdapter` with an approved public URL and an injected `fetchImpl` that returns a 302 to a different public host followed by a 200. Call `fetchRaw()` and inspect the injected fetch visit list. No network access is needed.

## F. Regression checks

- Mocked cases: cross-host redirect, unapproved same-host path, localhost, loopback IP, link-local metadata IP, off-host robots redirect, redirect chain over limit, and allowed same-host redirect. Blocked destinations were never passed to the injected fetch implementation. The allowed redirect fetched its destination and returned the expected body.
- `npm run crawler:test`: passed, 8/8 test files reported by this Node test runner.
- `npm run backend:test`: passed, 43/43 tests outside the sandbox. Inside the sandbox, Supertest cannot bind `0.0.0.0` (`listen EPERM`); that was an environment failure.
- Frontend production builds: Bootstrap, Tailwind, Skeleton all passed. Tailwind and Skeleton failed with generic webpack errors inside the sandbox but passed outside it.
- No AI assistant code was changed for this audit. The backend test suite includes its existing assistant tests.

## G. Remaining weaknesses and dashboard coverage

- `ssrf.js` checks literal hostnames/IPs but does not resolve and pin DNS addresses before connection. A private DNS answer or rebinding is a potential SSRF gap, not demonstrated here.
- `httpFetch()` checks `maxBytes` after `res.text()` buffers the complete response, so the cap does not constrain download/memory use while reading.
- The robots loader treats an unreadable or redirect-rejected robots file as missing and permits page fetching. This is a policy decision that deserves review.
- The admin dashboard has five tabs: overview, sources, jobs, data quality, verification. It shows source status/health and robots status; job status and basic error messages; aggregate parser-anomaly and stale counts; a verification queue; recent jobs; run/dry-run, retry, source enable/disable/frequency/reset, and pause/resume controls.
- It does **not** provide dedicated job details, live logs, failure or parser-error views, per-hospital stale-data list, data changes, or full history. The API has `GET /jobs/:id` and `GET /results`, but the shared dashboard hook does not use them. `CrawlJob` does not store the `pagesVisited` field that the source-detail API tries to display.
- The scheduler control stores and displays a pause flag; no automatic scheduler loop is wired into `backend/src/server.js`. Dry-run still creates and saves a `CrawlJob`, despite a controller comment saying it writes nothing.
- Dashboard coverage was verified by source inspection and successful builds, not by a live browser click-through or database-backed UI session.

## H. Three-variant equivalence

All variants import the same `useCrawlerAdmin` hook, have the same five tabs and eleven action calls, and build successfully. Bootstrap's vendored core `api.js` and `hooks.js` match `packages/core` byte-for-byte. This supports functional parity for the audited crawler controls. The JSX/HTML structures are not identical (for example, Bootstrap uses a `<ul>` tab list and Tailwind uses a `<div>`), so the strict research claim that *only CSS presentation differs* is not established by this audit and is not literally true for these pages.
