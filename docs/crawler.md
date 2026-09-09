# MedReach Crawler (`@medreach/crawler`)

Modular, SSRF-safe, **deterministic** ingestion of publicly available Mumbai hospital
information. Feeds the same shared backend/database used by all three frontend
variants. **No AI/ML/LLM/embeddings anywhere** — every transformation is rule-based
and explainable.

> **Experiment rule:** the crawler is NOT part of the CSS-framework comparison.
> No crawler logic lives inside `variants/*`; behavior and collected data are
> identical regardless of which frontend is used.

## Pipeline

```
Scheduler → Runner/Orchestrator → Source Registry → Source Adapter
   → guardedFetch (registry allow-list + robots.txt + SSRF + limits)
   → Parsers (JSON-LD → semantic HTML → selectors → fallback)
   → Normalizer → Validator → Freshness → Confidence
   → PersistenceService → MongoDB
```

## Approved sources (`src/registry/sources.js`)

Only these four hospitals, and only their listed `allowedPaths`, may be fetched.
Arbitrary/user-supplied URLs are never crawled.

| sourceId | Hospital | Base URL | Notes from real robots.txt |
|---|---|---|---|
| `lilavati` | Lilavati Hospital & Research Centre | `www.lilavatihospital.com` | CodeIgniter; `/admin/ /system/ /search` disallowed |
| `kokilaben` | Kokilaben Dhirubhai Ambani Hospital | `www.kokilabenhospital.com` | staging/admin + `*.pdf` disallowed; sitemap published |
| `fortis` | Fortis Hospital Mumbai | `www.fortishealthcare.com` | Drupal; `/core/ /profiles/ /admin/ /search/ /user/*` disallowed |
| `jaslok` | Jaslok Hospital & Research Centre | `www.jaslokhospital.net` | specialties under `/speciality/*` |

Each entry carries `sourceType`, `adapter`, `enabled`, `sourceState`,
`crawlFrequencyMs` (6h), `timeoutMs`, `rateLimit {minIntervalMs, concurrency:1}`,
`maxPages`, `maxDepth`, `priority`, `reliability`, `lastCrawledAt`.

Source states: `enabled · disabled · robots_disallowed · blocked · rate_limited ·
temporarily_unavailable · parsing_error`.

## Safety

- **robots.txt** (`src/robots/robotsChecker.js`) — dependency-free parser honoring the
  `*` group with the standard **longest-match** rule (Allow wins ties), `*` wildcards
  and `$` anchors; per-host cache (1h). Missing robots ⇒ allowed (convention).
- **`guardedFetch`** is the only fetch path adapters use. Order: same-host →
  registry `allowedPaths` → robots → SSRF/limits.
- **SSRF** (`src/ssrf.js`) — rejects non-`http(s)`, credentials-in-URL, `localhost`,
  `127/10/192.168/172.16-31`, `169.254` (cloud metadata), CGNAT, multicast, IPv6
  loopback/ULA/link-local. Redirects are re-checked per hop.
- **Limits** — 2 MB response cap, content-type allow-list (text/JSON/XML only, so
  binaries/PDFs are refused), per-source timeout, bounded pages/depth.
- **Retries** — only `429` and `5xx` (+ network timeouts), exponential backoff **with
  jitter**. `401/403/404` and robots-disallowed are never retried.
- **Politeness** — per-host minimum interval and concurrency 1 per domain.
- Crawled content is treated as untrusted: text is extracted, never executed.
- No authentication, no CAPTCHA evasion, no stealth UA. UA identifies the bot.

## Capability vs availability (critical)

Static hospital pages establish **capability**, never live availability:

```
"24-hour ICU care"  ⇒  ICU capability = yes
                       ICU availability = unknown   ← always
```

`availability` is hard-coded to `unknown` in the normalizer, and the validator
**rejects** any record claiming otherwise (`availability_must_be_unknown`) or
carrying a quantity (`unexpected_quantity`). Bed counts are never fabricated.

## Extraction priority

`JSON-LD` (`schema.org/Hospital`) → semantic HTML/meta/OG → known selectors →
fallback text. Ambiguity yields `UNKNOWN` rather than a guess.

## Data contract

```js
{ hospital, facilities[{facility, capability, availability}], specialties,
  emergency{hasEmergencyDept, emergencyPhone, trauma, ambulance},
  contacts{phones, emails}, source, provenance, retrievedAt }
```

**Provenance** (mandatory): `sourceId`, `sourceUrl`, `sourcePageUrl`,
`collectionMethod: "crawler"`, `parserVersion` (e.g. `lilavati-v1`), plus
`confidence` + `verificationStatus` on stored observations.

## Freshness & confidence (deterministic)

| Age | Label |
|---|---|
| < 10 min | `RECENT` |
| 10–60 min | `UPDATED_RECENTLY` |
| 1–6 h | `STALE` |
| > 6 h | `OUTDATED` |
| no observation | `UNKNOWN` |

Confidence = weighted composite of source reliability, recency, verification and
parse quality → `HIGH · MEDIUM · LOW · UNKNOWN`. **Honesty cap:** anything
`OUTDATED` is capped at `LOW`, however reliable the source; missing timestamp is
`UNKNOWN`. Data is never labelled "LIVE" merely because a crawl ran.

## Change detection & anomaly protection

`src/changeDetection/compare.js` classifies `NEW · NO_CHANGE · UPDATED · INVALID`
and computes a **parser anomaly**: if a previously rich record (≥5 fields) suddenly
loses >60 % of its fields, the run is marked `PARSING_ANOMALY`, previous trusted
data is **kept**, and the source is flagged for manual admin review — protecting the
database from website redesigns breaking parsers.

## Persistence

`PersistenceService` is the only place results become writes, and receives an
injected `repo`, so unit tests run with `createMemoryRepo()` and **no database**.
It writes facility **capability** plus an **append-only `AvailabilityObservation`**
(`status:"unknown"`, `quantity:null`) with full provenance, and skips writes when
nothing changed.

## CLI

```bash
npm run crawl -- --list                  # approved sources
npm run crawl -- --source lilavati       # one source
npm run crawl -- --all                   # all enabled sources
npm run crawl -- --all --dry-run         # show changes, write nothing
npm run crawl -- --source jaslok -v      # per-page structured logs
```

Dry-run fetches/parses/normalizes/validates and prints what *would* change, then
`No database changes made.` One failing source yields overall **PARTIAL**, not total
failure. Exit codes: `0` ok/partial, `1` failed/usage, `2` unknown source.

Logging (`src/logger.js`) is structured with stages `CRAWL/FETCH/PARSE/NORMALIZE/
VALIDATE/PERSIST`, redacts `authorization/cookie/token/password/secret/api_key`, and
emits JSON lines when `MEDREACH_LOG_JSON=1`.

## Crawl jobs

Every run returns a CrawlJob: `sourceId, startedAt, completedAt, status, sourceState,
pagesVisited, recordsFound, recordsCreated/Updated/Skipped/Rejected, changedFields,
errorMessages, durationMs, retryCount, confidence, classification, anomaly`.
Statuses: `queued · running · success · partial · failed · blocked · rate_limited ·
parsing_error`.

## Admin API (RBAC-protected)

`GET /api/crawler/jobs`, `GET /api/crawler/results`, `POST /api/crawler/run?sourceId=`
plus `GET/POST/PATCH /api/sources` — all require an administrator role; source URLs
are SSRF-validated on registration. See `docs/api.md`.

## Tests

```bash
npm run crawler:test        # offline only — fixtures + mock fetch, no network
npm run crawler:test:live   # OPTIONAL: hits the real sites (dry-run, no writes)
```

Offline suite covers ssrf, fetcher (404 no-retry / 5xx retry / 429 / timeout /
content-type / oversize / invalid URL), guardedFetch layering, robots longest-match,
JSON-LD + facility/specialty/emergency/contact parsers, normalization + phone/alias
handling, record validation, freshness, confidence, change detection, parser
anomaly, persistence (new/unchanged/anomaly/dry-run/invalid), all four adapters, the
orchestrator/CrawlJob, and the CLI. Live tests are **skipped unless
`MEDREACH_LIVE=1`**, so CI never depends on external hospital websites.

## Privacy

Only public, operational hospital information is collected — no patient data, no
personal contact details unrelated to hospital operations, no credentials.
