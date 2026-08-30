# Evaluation

Runs identically against each deployed variant. Outputs structured JSON/CSV into `data/raw/`, which the scoring instrument and analysis notebooks consume.

| Axis | Tools | Feeds |
|------|-------|-------|
| `security/` | OWASP ZAP, Snyk / `npm audit`, Mozilla Observatory, manual XSS/CSRF | Risk Score dims 1–6 |
| `privacy/` | headless request capture, cookie audit, CDN-leakage check | privacy report |
| `accessibility/` | axe-core, WAVE, Lighthouse a11y, keyboard + screen-reader | a11y report |
| `responsiveness/` | Lighthouse (Core Web Vitals), bundle size, WebPageTest | perf report |
| `scoring/` | **RWD Security Risk Score** (`risk-score.js`) | headline result |

## Expect a null result on app-level security

The backend + CSP + sanitization are shared, so ZAP/header scores should be **nearly identical** across variants. That is the predicted outcome and it *confirms the paper's thesis* — the framework signal lives in **dependencies, supply-chain, maintenance, and CSS-attack-surface**, not app XSS. Design the write-up around this (plan §4). Do not chase per-framework XSS deltas that vanish on patched versions.

## Try the instrument now

```bash
node scoring/risk-score.js   # runs on placeholder inputs; replace with real scan data
```
