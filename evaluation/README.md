# MedReach evaluation

[Project overview](../README.md) · [Release verification](../docs/release-qa.md)

Three independent Next.js frontends use one shared Express API and the owner's
MongoDB Atlas dataset. Evaluate each deployed frontend separately; shared
infrastructure does not prove identical performance or security.

## Hosted evaluation

The hosted tools target:

| Variant | Public deployment |
| --- | --- |
| Bootstrap | https://medreachmumbai.vercel.app |
| Tailwind | https://medreach-tailwind.vercel.app |
| Skeleton | https://medreach-skeleton.vercel.app |
| Shared API | https://medreach-production.up.railway.app |

These tools do not connect to MongoDB, seed accounts, start local application
servers, log in, submit healthcare requests or change deployment settings.
Do not run the two browser measurement commands concurrently: CPU/network
contention would undermine the comparison.

```sh
npm run eval:hosted
npm run eval:hosted:security
npm run audit:deps
npm run eval:lighthouse
npm run eval:network
npm run eval:results
npm run eval:report
```

### What each command measures

| Command | Evidence and limits |
| --- | --- |
| `eval:hosted` | Three fresh-context navigations per route, variant and viewport: 180 page visits over ten public routes. Records TTFB, FCP, observed LCP/CLS, long tasks, reported resource transfers, overflow, status codes, API origins and runtime-error counts. Also samples six shared API endpoints three times. Browser writes are blocked. |
| `eval:hosted:security` | Passive GET checks for six security headers, CORS for the three frontend origins, and signed-out denial on three admin endpoints. No exploit attempts or authenticated authorization tests. |
| `audit:deps` | Current npm registry audit of the repository lockfile across all workspaces. Missing/malformed/error reports fail as unavailable, never zero vulnerabilities. This does not independently identify deployed package versions. |
| `eval:lighthouse` | Official Lighthouse 13.5.0, one homepage audit per variant and mobile/desktop preset. Saves JSON, HTML, category scores and failed audits. Uses a temporary `npm exec` package, not an application runtime dependency. Requires registry access and Chrome. |
| `eval:network` | Longer public Hospitals/Emergency rechecks that retain browser failure reasons and distinguish observation events from test cleanup. No performance scores. |
| `eval:results` | Aggregates dated evidence without replacing missing results with fabricated scores. |
| `eval:report` | Renders the curated Markdown report only after all 180 observations and six Lighthouse audits have completed. |
| `score` | Without a measured input file, reports `not-measured` and a null composite score. An explicit `--input=/path/to/evidence.json` requires complete metrics for all eight dimensions and all three variants. Valid syntax is not independent validation of input provenance. |

Run `node evaluation/scoring/risk-score.js --input=/path/to/evidence.json`
only after separately collecting and reviewing the required evidence. The
proposed risk formula is a research instrument, not a security certification.
No hardcoded example rankings are used in normal evaluation output.

### Conditions and interpretation

- Chrome is selected with `MEDREACH_PLAYWRIGHT_CHANNEL` (default `chrome`);
  Lighthouse uses `CHROME_PATH` (default `/opt/google/chrome/chrome`).
- Repeated navigation measurements use a 1440×900 desktop viewport and a
  390×844 mobile viewport with 4× CPU slowdown, 150 ms added network latency,
  1.6 Mbps download and 0.75 Mbps upload. This is emulation on the measurement
  computer, not a physical phone or a globally representative sample.
- The initial viewport is observed for 2.5 seconds **after load**. Observed
  LCP/CLS and long tasks cover this bounded visit, not a whole user session.
  INP remains null because no user interactions are performed.
- Three samples support a descriptive median. A p75 from three values is the
  largest observation; it is not a reliable population percentile. Do not infer
  significant framework rankings from small score differences.
- Each browser context starts fresh, but CDN, DNS, OS, server and Atlas caches,
  deployment regions and external conditions are not reset. Variants are
  interleaved in fixed Bootstrap/Tailwind/Skeleton order within each repetition;
  order effects remain possible. Runs are sequential, not a load test.
- Resource Timing can report zero transfer bytes for cache hits or cross-origin
  resources without Timing-Allow-Origin. Totals are **reported bytes**, not a
  complete bandwidth accounting.
- Signed-out `/api/auth/me` 401s are expected. Distinguish them from public API
  errors, failed assets and JavaScript exceptions.
- Each report retains timestamps/settings. Repository revisions identify the
  tooling baseline; a deployed revision must be independently established.
  Neither hosting topology nor Atlas document counts are inferred from a page.
- Lighthouse accessibility and best-practices grades do not certify complete
  accessibility, application security or protection of healthcare information.

## Outputs

Generated raw evidence stays in ignored `evaluation/results/`, never in the
canonical MongoDB directory `/home/anonymous/medreach/data`:

- `hosted.json`: individual visits, route/profile summaries and public API timings.
- `hosted-security.json`: passive response headers, CORS and access checks.
- `security.json`: validated dependency audit, timestamp and lockfile hash.
- `lighthouse.json`: category scores, diagnostic metrics and failed audits.
- `lighthouse-<timestamp>/`: original Lighthouse HTML and JSON reports.
- `network-diagnostics.json`: request failure reasons during longer follow-up visits.
- `summary.json`: combined evidence, explicit missing axes and source timestamps.

A curated [hosted results report](HOSTED_RESULTS.md) records the completed run.
Raw reports are reproducible evidence, not automatically published artifacts.

## Build artifacts and isolated probes

`npm run bundles` prints aggregate raw/gzip CSS and JS from existing builds.
`npm run eval:performance` saves the same artifact totals. Missing builds are
reported explicitly. Neither command measures runtime latency, per-route
payloads or a causal CSS-framework effect; JavaScript can differ by variant.
`eval:all` combines those artifact commands with the dependency gate and
aggregation, stopping on command failures. It does not run hosted audits.

`npm run probe:react` demonstrates React server-rendered escaping versus an
explicit raw-HTML sink. It is not an application penetration test.
See [probe scope](../probe-react/README.md).

## Evidence still needed for a complete research study

Authenticated cross-organisation permission tests belong in isolated fixtures,
not destructive experiments against Atlas. Active vulnerability scans require
an agreed scope and safeguards. Production configuration review, field INP,
real-user Core Web Vitals, keyboard/screen-reader review and participant-based
usability research remain distinct work. Do not replace these with invented
zeros, claims of strict nonce CSP, external Observatory grades or framework EOL
assumptions.

Method references: [Lighthouse CLI](https://github.com/GoogleChrome/lighthouse),
[CLS session windows](https://web.dev/articles/cls),
[INP and real interactions](https://web.dev/articles/inp).
