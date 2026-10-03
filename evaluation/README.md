# Evaluation tooling and research limits

This directory contains runnable bundle measurements, a dependency-audit summary, a React rendering probe and a proposed composite risk instrument. It does not implement the full planned security/privacy/accessibility/user-study pipeline.

Current product regression evidence belongs in [Release QA](../docs/release-qa.md); historical build figures belong in [archived preliminary results](../docs/RESULTS-prelim.md). Passing functional tests is not a research result or security/accessibility certification.

## Implemented commands

Run from the repository root with workspace dependencies installed:

| Command | Actual output and limits |
| --- | --- |
| `npm run bundles` | Prints raw/gzip totals across built `.next/static` CSS and JavaScript files. Build all variants first. These are aggregate artifacts, not per-page downloads or latency. |
| `npm run eval:performance` | Writes `evaluation/results/performance.json` from those build artifacts; missing builds are reported as `built: false`. Does not measure LCP, INP, CLS or network timings. |
| `npm run audit:deps` | Summarizes `npm audit --json`; requires registry access. Inspect raw audit errors because the wrapper can print zero counts when no usable report is available. Use `npm audit --audit-level=high` as the release gate. |
| `npm run score` | Prints grades from **placeholder** inputs; not current scan evidence. |
| `npm run eval:results` | Writes `evaluation/results/summary.json`; security inputs are **placeholders**, and a pre-existing performance file is included if present. Check its age. |
| `npm run probe:react` | Compares React server-rendered text escaping and raw HTML insertion; see [probe scope](../probe-react/README.md). |

`npm run eval:all` is a convenience sequence, not a release gate: its shell expression suppresses failures from the bundle/audit segment and generated risk grades remain demonstrations. Generated scripts also contain historical claims about identical JavaScript, framework attribution and absence of AI; those strings do not establish current implementation facts.

## Submission latency

[Latency verification](../docs/latency-verification.md) records real local API/database measurements with simulated SMTP waits. The shared backend attempts independent submission emails concurrently, capped at three per submission. This is distinct from bundle size, browser rendering speed and hosted latency.

## Proposed research measurements

| Axis | Work still requiring separate evidence |
| --- | --- |
| Security | Authorized ZAP scans, header analysis, manual XSS/CSRF checks, dependency provenance and measured inputs for the risk score |
| Privacy | Per-route third-party requests, cookie behavior and data collection review |
| Accessibility | Automated findings plus keyboard/screen-reader and contrast review |
| Responsiveness | Per-route Core Web Vitals, controlled network profiles and layout measurements |
| Usability | Approved participant protocol, actual recruitment, anonymized observations and analysis |

Shared infrastructure suggests a hypothesis of similar application-security outcomes. Measure and report exceptions rather than predetermine the conclusion. Record exact commits, lockfiles, environments, routes, build configuration, data and intentional variant differences. Bundle ratios alone do not isolate a CSS-framework effect.

The risk formula is a proposed instrument, not a validated certification. Replace all placeholder inputs with traceable measurements and document normalization, missing-data handling, weights and sensitivity before reporting empirical grades. See [research plan](../docs/MedReach_Corrected_Plan.md) and [study protocol](../user-study/README.md).
