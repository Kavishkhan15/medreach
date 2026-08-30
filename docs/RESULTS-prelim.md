# Preliminary Results (captured during scaffolding)

These are **real measurements** produced by the repo's own tooling on the initial build — not placeholders. They seed §4 of the paper and demonstrate the pipeline works. Full runs (ZAP, axe, Lighthouse, user study) remain to be executed per the plan.

## Backend (the experimental constant) — verified
- `npm --workspace @medreach/backend test` → **7/7 pass** (health, 404, helmet CSP header present, register validation 400, unauthenticated 401, RBAC 403, JWT roundtrip).
- Live end-to-end against local MongoDB: list (6 hospitals), full-text search (`q=trauma`), geo "nearest" (`$near`), admin JWT login, **RBAC blocks non-admin bed update (403)**, admin bed update persists, public alerts. All behaved correctly.

## Responsiveness — CSS/JS bundle size (`node evaluation/measure/bundles.mjs`)

| Variant | CSS raw | CSS gzip | JS raw | JS gzip |
|---|---|---|---|---|
| Bootstrap 5 | 223.0 kB | 30.0 kB | 693.4 kB | 214.9 kB |
| Tailwind CSS 4 | 13.9 kB | 3.8 kB | 694.2 kB | 215.4 kB |
| Skeleton | 8.7 kB | 2.5 kB | 692.0 kB | 214.6 kB |

**Finding:** CSS (the framework-attributable delta) spans **~25×** (Bootstrap 30 kB gz vs Skeleton 2.5 kB gz), while JS is effectively constant (~215 kB gz) because logic is shared via `@medreach/core`. This validates that the design isolates the CSS framework as the variable.

## Security — dependency CVEs (`node evaluation/security/audit.mjs`)
- **1 critical + 1 high** across the shared toolchain: `next@14.2.5` (critical: *Authorization Bypass in Next.js Middleware*; multiple DoS/SSRF/cache-poisoning advisories) and `postcss` (high: path traversal / XSS via `sourceMappingURL`).
- **Two paper-relevant observations:**
  1. `postcss` is **Tailwind v4's build dependency** → concrete evidence for the paper's claim that *utility-first frameworks shift security to the build pipeline/toolchain* ("P" rating).
  2. The `next` advisories hit **all three variants equally** (shared stack) → supports the source paper's "governance/shared-stack dominates framework choice" thesis.
- **Gap finding:** source-level framework bugs (e.g. CVE-2019-8331, Bootstrap tooltip XSS on <4.3.1) do **not** appear in `npm audit` — it only sees the dependency graph. This is itself a Security-axis result (plan §4): dependency scanners alone under-report RWD-framework risk.

## Limitation-2 probe — reactive framework XSS surface (`node probe-react/probe.mjs`)
Same payload `<img src=x onerror=…>` rendered two ways via React SSR:
- JSX interpolation → `&lt;img src=x onerror=…&gt;` (escaped, inert). **PASS.**
- `dangerouslySetInnerHTML` → raw `<img …>` injected (only when the dev opts out of escaping).

**Finding:** reactive frameworks make XSS **opt-in to danger**, whereas classic RWD-framework tooltip/template sinks were **opt-out of safety**. The security model differs by *default posture*, not by CSS — the Limitation-2 contribution the paper explicitly requested.

## Still to run
OWASP ZAP active scan · Mozilla Observatory header grades · axe-core/WAVE/Lighthouse (a11y + Core Web Vitals) · privacy request/cookie capture · manual CSS-exfil + supply-chain PoCs · the N≥30 user study (IRB first).
