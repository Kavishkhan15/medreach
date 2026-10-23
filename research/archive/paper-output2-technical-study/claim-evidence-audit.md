# Claim-Evidence Audit: Output 2 Secondary Manuscript (MS2)

**Document**: `research/paper-output2/manuscript.md` and `research/paper-output2/main.tex`  
**Scope**: Descriptive Three-Variant Technical Benchmark of Bootstrap, Tailwind CSS, and Skeleton in MedReach  
**Auditor**: Secondary Manuscript Author & Empirical Research Specialist  
**Date**: 2026-10-24  
**Audit Policy**: Every factual assertion and quantitative metric must strictly trace to an authoritative local artifact file.

---

## 1. Traceability Matrix

| # | Manuscript Claim / Metric | Value in Text | Source Artifact File | Exact Reference / Location | Verification Status |
|:---:|:---|:---|:---|:---|:---:|
| 1 | Total repeated navigation page visits | 180 public visits (10 routes × 3 variants × 2 profiles × 3 samples) | `evaluation/HOSTED_RESULTS.md` | Line 16 | **VERIFIED** |
| 2 | Browser and runtime environment | Chrome 155.0.8059.84, linux/x64, Node v24.22.1 | `evaluation/HOSTED_RESULTS.md` | Line 16 | **VERIFIED** |
| 3 | Desktop evaluation viewport & throttle | 1440×900, unthrottled | `evaluation/HOSTED_RESULTS.md` | Line 18 | **VERIFIED** |
| 4 | Mobile evaluation profile settings | 390×844, 4× CPU slowdown, 150 ms added latency, 1.6 Mbps download, 0.75 Mbps upload | `evaluation/HOSTED_RESULTS.md` | Line 18 | **VERIFIED** |
| 5 | Auditing tool & execution timestamps | Lighthouse 13.5.0, captured 2026-10-23T11:30:02.653Z → 2026-10-23T11:36:33.829Z | `evaluation/HOSTED_RESULTS.md` | Line 22 | **VERIFIED** |
| 6 | Bootstrap Mobile Lighthouse Scores | Perf: 73, A11y: 96, Best Practices: 73, SEO: 100, LCP: 3.81 s, TBT: 0.32 s, CLS: 0.034 | `evaluation/HOSTED_RESULTS.md` | Line 26, `evaluation/results/lighthouse.json` | **VERIFIED** |
| 7 | Tailwind Mobile Lighthouse Scores | Perf: 70, A11y: 96, Best Practices: 73, SEO: 100, LCP: 3.38 s, TBT: 0.62 s, CLS: 0.034 | `evaluation/HOSTED_RESULTS.md` | Line 27, `evaluation/results/lighthouse.json` | **VERIFIED** |
| 8 | Skeleton Mobile Lighthouse Scores | Perf: 82, A11y: 96, Best Practices: 73, SEO: 100, LCP: 2.56 s, TBT: 0.44 s, CLS: 0.030 | `evaluation/HOSTED_RESULTS.md` | Line 28, `evaluation/results/lighthouse.json` | **VERIFIED** |
| 9 | Bootstrap Desktop Lighthouse Scores | Perf: 83, A11y: 96, Best Practices: 73, SEO: 100, LCP: 1.91 s, TBT: 0.00 s, CLS: 0.021 | `evaluation/HOSTED_RESULTS.md` | Line 29, `evaluation/results/lighthouse.json` | **VERIFIED** |
| 10 | Tailwind Desktop Lighthouse Scores | Perf: 84, A11y: 96, Best Practices: 73, SEO: 100, LCP: 1.89 s, TBT: 0.00 s, CLS: 0.022 | `evaluation/HOSTED_RESULTS.md` | Line 30, `evaluation/results/lighthouse.json` | **VERIFIED** |
| 11 | Skeleton Desktop Lighthouse Scores | Perf: 89, A11y: 96, Best Practices: 73, SEO: 100, LCP: 1.51 s, TBT: 0.00 s, CLS: 0.019 | `evaluation/HOSTED_RESULTS.md` | Line 31, `evaluation/results/lighthouse.json` | **VERIFIED** |
| 12 | Lighthouse Audit Warning (Incomplete Audit) | "The page loaded too slowly to finish within the time limit. Results may be incomplete." | `evaluation/HOSTED_RESULTS.md` | Lines 35–42 (present in 6/6 audits) | **VERIFIED** |
| 13 | Lighthouse load timeout cause | Shared unauthenticated refresh request `api/auth/refresh` (HTTP 401) unfinished at capture | `evaluation/HOSTED_RESULTS.md` | Lines 136–138 | **VERIFIED** |
| 14 | Route LCP medians across 10 routes | Homepage (1.84s / 1.51s / 1.49s), Hospitals (1.95s / 1.99s / 1.47s), Emergency (1.80s / 1.34s / 1.65s), etc. | `evaluation/HOSTED_RESULTS.md` | Lines 48–80, `evaluation/results/hosted.json` | **VERIFIED** |
| 15 | Slowest observed route LCPs | Tailwind `/diagnostics` (4.50 s mobile median); Skeleton `/diagnostics` (4.39 s mobile median) | `evaluation/HOSTED_RESULTS.md` | Lines 63–64, 153–154 | **VERIFIED** |
| 16 | Verified CSS bundle transfer sizes | Bootstrap: 3 files, 47,646 B; Tailwind: 1 file, 19,086 B; Skeleton: 1 file, 15,531 B | `evaluation/results/performance.json`, `brief-ms2.md` | Lines 25–26, `performance.json:8-47` | **VERIFIED** |
| 17 | Core JS bundle size (shared) | 26 files; Bootstrap: 230.4 KB gzip; Tailwind: 236.2 KB gzip; Skeleton: 230.0 KB gzip | `evaluation/results/performance.json` | `performance.json:15, 29, 43` | **VERIFIED** |
| 18 | Cross-variant security headers | 6/6 presence: HSTS (`max-age=63072000; includeSubDomains; preload`), CSP (frame-ancestors 'none'), Permissions-Policy (`camera=(), microphone=(), geolocation=(self)`) | `evaluation/results/hosted-security.json` | Lines 9–52 | **VERIFIED** |
| 19 | Origin header & CSP scope | Shared `next.config.mjs` configures identical headers; CSP lacks strict script-src nonce | `evaluation/results/hosted-security.json` | Lines 19, 35, 51 | **VERIFIED** |
| 20 | Edge caching headers | `cache-control: public, max-age=0, must-revalidate`, `x-vercel-cache: HIT`, `age ~24496`, `x-nextjs-prerender: 1`, `x-nextjs-stale-time: 300` | `research/results/datapath/datapath-staleness-audit.md` | Lines 24–28 | **VERIFIED** |
| 21 | Stale-availability hazard verdict | **NOT SUPPORTED**: Prerendered HTML holds only static structural chrome; volatile clinical data is fetched runtime client-side via Express API emitting `Cache-Control: no-store` | `research/results/datapath/datapath-staleness-audit.md` | Lines 32–42 | **VERIFIED** |
| 22 | Variant parity differences | 1. Bootstrap `/hospitals` lacks 5 facet filters;<br>2. `AccountChrome` only in Bootstrap;<br>3. Manual-credential workflow only in Bootstrap;<br>4. `CareerReference` only in Skeleton;<br>5. `useRef` submit guard only in Tailwind/Skeleton | `brief-ms2.md`, codebase source comparison | Lines 35–38 | **VERIFIED** |
| 23 | API Response Timings | Ready: 0.28s, Hospitals: 1.05s, Blood banks: 0.75s, Diagnostics: 1.05s, Ambulances: 0.68s, Jobs: 2.26s | `evaluation/HOSTED_RESULTS.md` | Lines 85–93 | **VERIFIED** |
| 24 | Dependency security audit | Passed, 0 vulnerabilities across 1,400+ packages on lockfile `d19d86416359d1196f74e036441d3c8121151b797d82cda8596f45885ffeb3b3` | `evaluation/results/security.json` | Lines 6–17 | **VERIFIED** |

---

## 2. Integrity and Non-Causality Certification

1. **No Causal Claiming**: The manuscript does not claim that Skeleton or Tailwind is intrinsically superior to Bootstrap. All performance variations are explicitly contextualized with developer sequential implementation collinearity, bundle deltas, and route-level DOM discrepancies.
2. **Desk-Rejection Framing**: Section 15 (Limitations) explicitly discloses that an independent external reviewer judged that a general framework comparison paper would be desk-rejected. The manuscript is strictly framed as an engineering experience report on three production-scale Next.js implementations.
3. **Negative Finding Transparency**: The invalidation of the "stale-availability hazard" is highlighted prominently in Section 11 (Results) and Section 12 (Discussion), correcting earlier speculative hypotheses.
