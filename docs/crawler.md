# Crawler Subsystem (`@medreach/crawler`)

Deterministic, rule-based data-acquisition subsystem at `crawler/`. It collects
hospital availability data **only** from approved, registered sources. There is
**no AI/ML/LLM** anywhere in the pipeline — every transformation is explicit and
inspectable.

## Pipeline

```
Scheduler -> Source Registry -> Fetcher -> Adapter -> Parser
          -> Normalizer -> Validator -> Confidence -> Freshness -> DB
```

Each stage has a fixed contract, so a crawl outcome can always be traced back to
the source and the rules applied.

## Modules

### SSRF guard — `src/ssrf.js`
`assertSafeUrl` / `isSafeUrl` reject unsafe targets before any network call:

- Non-`http(s)` schemes
- Credentials embedded in the URL (`user:pass@host`)
- `localhost`, `127.0.0.0/8`
- Private ranges `10/8`, `192.168/16`, `172.16–31/12`
- `169.254/16` (cloud metadata / link-local), CGNAT, multicast
- IPv6 loopback, ULA, and link-local addresses

### Fetchers
- **`fetchers/httpFetcher.js`** — SSRF-checked HTTP fetch with an
  `AbortController` timeout, retries using exponential backoff, `429`/`503`
  handling, manual redirect following (each hop re-checked for SSRF), a 2 MB
  response cap, and an injectable `fetchImpl` for tests.
- **`fetchers/browserFetcher.js`** — stub for JS-rendered sources (no live
  browser dependency wired in).

### Adapters
- **`adapters/baseAdapter.js`** — fixed
  `fetch() -> parse() -> normalize() -> validate()` contract; **never throws**
  (failures are returned as structured results).
- **`adapters/genericHospitalAdapter.js`** — config-driven, with **no hardcoded
  selectors**.
- **`adapters/source-specific/`** — per-source adapters where needed.

### Parsers — `parsers/index.js`
JSON-path extraction plus minimal `data-field` HTML extraction.

### Normalization — `normalization/index.js`
Status vocabulary mapping, facility aliasing to a canonical enum, and dedup.

### Validation — `validation/validateResult.js`
Empty-result and structure-change detection, plus a `parseQuality` signal.

### Freshness & Confidence
`freshness/` and `confidence/` — deterministic scoring (see `data-model.md` for
thresholds and levels).

## Orchestration
- **`registry.js`** — approved `ADAPTERS` and an `isCrawlable` SSRF gate.
- **`runner.js`** — `crawlSource` returns a `CrawlJob` shape with per-facility
  confidence.
- **`scheduler.js`** — bounded concurrency, per-host minimum interval, and a
  `maxJobs` cap.

## Safety model
- Crawls **only** approved `DataSource` registry entries — **never** a
  user-supplied URL.
- Prefers official APIs and authorized feeds over scraping.
- Every outbound request passes the SSRF guard.

## Tests
`crawler` — 12/12 passing via `node --test`, using fixtures with **no live
network access**.

```bash
npm run crawler:test
```
