# MedReach crawler (`@medreach/crawler`)

Current implementation reference, reviewed 2026-10-03. For the latest local
verification and remaining live checks, see [Release QA](release-qa.md).

The crawler collects public provider information from an approved registry.
Extraction, normalization, validation, confidence and persistence are
**deterministic and rule based**. A separate optional Gemini refinement pass can
produce review candidates after a successful backend crawl; it does not replace
this pipeline or automatically change canonical provider data.

All three frontends use the same backend and database. Crawler logic lives in
`crawler/src/` and its backend runtime copy, `backend/src/_crawler/`.

## Pipeline

```text
Backend scheduler/admin run → Approved registry → Source adapter
  → guardedFetch (origin + allowed paths + robots + URL safety)
  → JSON-LD / semantic HTML / selectors / text parsers
  → Normalize → Validate → Freshness/confidence → Change detection
  → MongoDB repository → Claims, observations and reviewable provenance
```

Hospital-site sources produce a provider record. Government-directory sources
use a separate many-listing pipeline. A directory listing can create an
unverified minimal hospital identity; it cannot establish facilities or live
availability. Diagnostics adapters also extract location listings from approved
source pages.

## Approved registry

The registry currently contains **17 entries**, rather than the original four.
The authoritative URLs, `allowedPaths`, adapters, limits and source states are in
`crawler/src/registry/sources.js` and the matching backend runtime file.

| Source ID | Registered host | Role |
| --- | --- | --- |
| `lilavati` | `www.lilavatihospital.com` | Hospital |
| `kokilaben` | `www.kokilabenhospital.com` | Hospital |
| `fortis` | `www.fortishealthcare.com` | Hospital; registered as blocked |
| `jaslok` | `www.jaslokhospital.net` | Hospital |
| `cooper` | `hbtmc.edu.in` | Hospital |
| `mumbai_suburban_directory` | `mumbaisuburban.gov.in` | Government directory |
| `bombay` | `www.bombayhospital.com` | Hospital |
| `mumbai_city_directory` | `mumbaicity.gov.in` | Government directory |
| `kem_mumbai` | `kem.edu` | Hospital |
| `sion_hospital` | `ltmmc.edu.in` | Hospital |
| `tata_memorial` | `tmc.gov.in` | Hospital |
| `nanavati_max` | `www.nanavatimaxhospital.org` | Hospital |
| `suburban_diagnostics` | `www.suburbandiagnostics.com` | Diagnostics locations |
| `metropolis_labs` | `www.metropolisindia.com` | Diagnostics locations |
| `nm_medical` | `www.nmmedical.com` | Diagnostics locations |
| `nmmc_hospital` | `www.nmmc.gov.in` | Government directory; generic adapter registration |
| `apollo_mumbai` | `www.apollohospitals.com` | Hospital; disabled and blocked |

Registration and a default `healthy` label do not establish live reachability,
successful extraction or verification. NMMC's generic adapter registration is
not evidence of a working dedicated directory adapter. No live source checks
were performed for this documentation update.

`fortis` retains `enabled: true` in its entry but `status: blocked`; the crawlability
gate refuses it. Apollo is disabled with `sourceState: blocked`. Backend controls
cannot override a registry block or change the approved origin/paths. A source
that refuses access must remain blocked; do not rotate IPs, disguise the bot,
bypass CAPTCHA or shorten intervals to evade restrictions.

Source lifecycle states are `enabled`, `disabled`, `robots_disallowed`, `blocked`,
`rate_limited`, `temporarily_unavailable` and `parsing_error`. These describe a
source's standing, separately from one job's outcome. Site entries generally use
six-hour intervals, directories 24 hours, per-host concurrency one and a minimum
request interval of three or four seconds. Operational overrides remain subject
to the registry and fetch guards.

## Fetch safety and limitations

- Hospital and directory page fetches check the approved **origin**, allowed path
  and robots policy before the first request and each redirect hop. `/` permits
  only the root, not every path. Redirect chains are bounded to five hops.
- Legacy `BaseAdapter.fetchRaw()` checks robots for the initial feed and every
  approved redirect. A config-driven feed without path rules may redirect only
  to its original path and query.
- URL safety rejects credentials, unsupported protocols and private/local or
  reserved addresses, including IPv4-mapped IPv6 and cloud metadata addresses.
  Each network request resolves all DNS answers, rejects any non-public answer
  and pins its connection lookup to the validated result. Redirects repeat this
  check; there is no second unchecked DNS lookup.
- Robots policies use a one-hour **origin** cache. Matching MedReachBot and general
  groups retain their restrictions; each group applies longest-match/Allow-on-tie
  evaluation. Genuine HTTP 404/410 permits crawling. Access refusals, network
  errors, server/rate-limit errors and rejected redirects block page fetching.
- Actual network bodies stream under a configured 2 MB byte limit. Declared
  oversize responses are rejected before reading; streamed/decompressed bytes
  are checked as received. DNS, headers and body reads share an attempt timeout.
  Offline injected fixture transports may use their existing `text()` helper.
- Retries apply to 429, 5xx and network failures, using bounded attempts/backoff;
  ordinary 401/403/404 and robots denials are not retried.
- Public page text is untrusted input. It is extracted rather than executed.
  No private accounts, patient data or unrelated personal contacts are collected.

See the [historical redirect audit](crawler-local-security-audit.md) for the
original evidence and its dated current-source correction.

## Capability, availability and provenance

A static statement such as “24-hour ICU care” establishes capability only.
Crawler availability stays `unknown`, quantity `null`, and verification
`unverified`. A source seed or successful crawl cannot automatically verify it.
The validator rejects unsupported availability or quantities.

Normalized records contain hospital identity, facilities, specialties,
emergency capability/contact information, source, provenance and retrieval time.
Claims retain source references, source-page URLs, evidence kind/text, parser
version, timestamps, confidence and review state. Missing evidence stays missing;
normalized text is not represented as a quoted source excerpt.

Freshness labels are `RECENT` (<10 minutes), `UPDATED_RECENTLY` (<1 hour), `STALE`
(<6 hours), `OUTDATED` (older), or `UNKNOWN` (missing/invalid timestamp). Confidence
combines source reliability, recency, verification and parse quality. Outdated
records are capped at `LOW`; a crawl alone never means “LIVE”. Public current
availability has additional verified-observation/freshness safeguards described
in the [data-fusion evidence report](Hospital_Data_Fusion_Verification_Report.md).

Change detection classifies `NEW`, `NO_CHANGE`, `UPDATED` or `INVALID`. A record
with at least five previous fields losing more than 60% triggers a parsing
anomaly: previous data is retained and review is required.

## Persistence, scheduler and controls

The backend admin controller injects `createMongoRepo()` for durable writes.
`CRAWLER_SCHEDULER_ENABLED=true` enables the backend scheduler; it respects source
intervals, pause controls and a database lease. Shutdown prevents new source work
and waits for an active tick before MongoDB disconnects.

The standalone CLI defaults to an **in-memory repository**, even without
`--dry-run`; it is not a command to populate the deployed MongoDB database.
Tests inject the same memory repository. Backend admin runs write MongoDB.
Backend dry-run avoids provider/claim/observation writes but still records a
CrawlJob for operational history.

```sh
npm run crawl:list
npm run crawl -- --source lilavati --dry-run
npm run crawl -- --all --dry-run
```

CLI crawling, including dry-run, contacts external sites. The backend crawler and
source APIs require admin/system-admin authorization. See [API reference](api.md)
and [deployment](deployment.md) for routes and operational configuration.

Job outcomes include `success`, `partial`, `failed`, `blocked`, `rate_limited` and
`parsing_error` (plus queued/running operational states). Partial means usable
records were recovered with page failures or an anomaly; it does not imply every
page succeeded. Blocked sources produce a blocked outcome without fallback
provider data. A failed source does not prevent other sources from being tried.

## Optional refinement

`GEMINI_ENABLED=true`, `GEMINI_API_KEY` and `GEMINI_MODEL` configure a separate
backend suggestion service, independent of assistant `AI_*` settings. It requires
an existing HTTPS source-page excerpt and accepts only supported facility types,
`yes`/`no` capability and exact evidence substrings. Suggestions are stored as
low-confidence pending `RefinementCandidate` records. Human approval records a
review decision; a separate source-claim review is required to change canonical
data. Provider failure leaves deterministic crawler persistence unchanged.

## Verification

```sh
npm run crawler:test:offline   # deterministic fixtures/mocks; no live.test.js
npm run crawler:test:live      # separate opt-in external-source dry-run checks
```

The offline gate forces `MEDREACH_LIVE=0` and explicitly reports the live suite's
exclusion. The ordinary `crawler:test` command also discovers live tests, which
are skipped unless opted in. Fixtures test parsing, validation, provenance,
persistence, blocked sources, robots/redirect rules, job classification and
legacy adapter boundaries. Text-selector fallback parses the actual fetched
page; it does not generate replacement providers when a fetch fails.

Latest executed counts and evidence belong in [Release QA](release-qa.md).
Permitted live-source extraction, current robots responses and production
freshness/conflict review remain separate live verification tasks.
