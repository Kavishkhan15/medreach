# Limitations and Remaining Work: Output 2 Secondary Manuscript (MS2)

**Document**: `research/paper-output2/manuscript.md` and `research/paper-output2/main.tex`  
**Topic**: Technical Case Study & Multi-Variant Benchmark of Bootstrap, Tailwind CSS, and Skeleton in MedReach  
**Author**: Secondary Manuscript Author & Empirical Research Specialist  
**Date**: 2026-10-24  

---

## 1. Scope, Framing, and Editorial Justification

### 1.1 Desk-Rejection Hazard & Experience Report Scoping
An independent peer review of the preliminary research plan explicitly determined that a traditional research-track paper attempting to claim universal performance or security superiority among CSS frameworks (e.g., asserting "Tailwind is objectively faster than Bootstrap" or "CSS frameworks introduce distinct security vulnerabilities") would be **promptly desk-rejected** by top-tier software engineering venues (such as ICSE, FSE, or IEEE TSE). 

The primary reasons for desk-rejection in this domain are well-established:
1. CSS frameworks do not execute independent network transactions or server-side security controls.
2. In real-world software applications, presentation layer performance is heavily dominated by JavaScript bundle execution, client-side hydration, image assets, network round-trips, and backend database latency, rather than raw stylesheet parsing.
3. A small multi-variant testbed constructed without randomized, counterbalanced developer rotations cannot establish causal attribution.

Consequently, this manuscript is intentionally and strictly framed as a **descriptive engineering case study / technical experience report**. It documents the empirical realities, architectural boundaries, and maintenance trade-offs encountered when implementing three distinct presentation paradigms (component-based, utility-first, and minimalist CSS) over a shared full-stack healthcare platform.

---

## 2. Unidentifiable Confounders & Threats to Causal Attribution

### 2.1 Developer Sequencing Collinearity
The three frontends were developed **sequentially** over the project lifecycle:
1. **Bootstrap 5** was developed first as the initial reference implementation.
2. **Tailwind CSS v3** was developed second, building upon lessons learned during the initial architecture.
3. **Skeleton CSS** was developed third as a minimalist exploration.

Because the development sequence is **perfectly collinear** with framework selection, any observed improvement in code structure, component modularity, or runtime rendering efficiency is completely confounded by developer learning curve, progressive refactoring, and familiarity with domain models. It is methodologically impossible to separate the intrinsic effect of Tailwind or Skeleton from the extrinsic effect of developing an application for the second or third time.

### 2.2 Feature Parity Discrepancies
Although all three variants implement the same core clinical routes and share the `@medreach/core` isomorphic library, complete structural parity was not maintained across all 39 pages:
- **Hospital Directory Filters**: The Bootstrap `/hospitals` route lacks the five interactive facet filters (e.g., ICU, Emergency, Blood Bank, Diagnostics, Ambulances) that were introduced during the Tailwind and Skeleton implementations.
- **Navigation Shell**: The Bootstrap variant incorporates an `AccountChrome` sidebar component not present in the other two frontends.
- **Administrative Workflows**: A manual-credential submission workflow exists exclusively in Bootstrap.
- **Informational Pages**: A `CareerReference` component exists solely in Skeleton.
- **Concurrency Guards**: A `useRef` submission guard preventing double-form submission on `/forgot-password` was implemented in Tailwind and Skeleton, but omitted in Bootstrap.

These differences represent classical architectural drift under clone-and-own evolution (Fischer et al., 2014) and prevent treating the variants as identical black-box clones.

### 2.3 Shared Backend & Network Decoupling
All three frontends connect to the exact same hosted Express API on Railway (`medreach-production.up.railway.app`) backed by a single MongoDB Atlas database cluster. 
- Variations in API response timings (e.g., `/api/jobs` taking 2.26 s vs `/api/ambulances` taking 0.68 s) stem entirely from backend queries and database indexing.
- Passive security headers (HSTS, CSP, X-Frame-Options) and CORS origin validations are identical across variants because they are defined in a shared `next.config.mjs` and enforced by the shared Express server.
- **Crucial Rule**: Backend performance, API response latencies, and server-side authentication behaviors must never be attributed to frontend CSS frameworks.

### 2.4 Edge Caching & Host Environment Variance
The public deployments reside on Vercel's global CDN:
- The edge CDN serves prerendered static HTML shells with `x-vercel-cache: HIT` and recorded ages reaching ~24,496 to ~32,596 seconds (6.8 to 9.0 hours).
- Variations in CDN edge node cache warmness, geographic routing (e.g., Mumbai `bom1` vs Cleveland `cle1`), and transient internet transit latency introduce non-framework noise into First Contentful Paint (FCP) and Time to First Byte (TTFB).

---

## 3. Methodological and Measurement Limitations

### 3.1 Bounded Laboratory Profiles vs Field Real-User Monitoring
All navigation metrics were collected in a controlled headless laboratory environment:
- **Tool**: Chrome 155.0.8059.84 driven by Node v24.22.1 on Linux x86_64.
- **Mobile Profile**: Emulated 390×844 viewport with a simulated 4× CPU slowdown, 150 ms round-trip latency, 1.6 Mbps download, and 0.75 Mbps upload.
- While this accurately models degraded mobile devices, it represents synthetic laboratory throttling rather than real-user Core Web Vitals (CWV) collected via the Chrome User Experience Report (CrUX). Interaction to Next Paint (INP) could not be measured because automated visits performed read-only navigations without synthetic user pointer interactions.

### 3.2 Small Repetition Sample ($n=3$ per cell)
The repeated route dataset comprises 180 total observations across 10 routes $\times$ 3 variants $\times$ 2 profiles $\times$ 3 samples:
- With $n=3$ samples per cell, the reported 75th percentile ($p75$) is mathematically the maximum observed value rather than a robust population percentile.
- To prevent statistical over-claiming, all findings in this report strictly present **medians alongside full dispersion ranges (minimum and maximum)**.

### 3.3 Lighthouse Timeout Warning Analysis
In all six Lighthouse 13.5.0 audits (mobile and desktop across all three variants), an identical warning was recorded:
> *"The page loaded too slowly to finish within the time limit. Results may be incomplete."*

Investigation of the network traces revealed that the client-side authentication check `GET https://medreach-production.up.railway.app/api/auth/refresh` (HTTP 401) remained pending at the audit capture threshold. This shared unauthenticated refresh request artificially depressed Lighthouse Performance scores. Consequently, Lighthouse scores must be interpreted as diagnostic point-in-time indicators rather than definitive performance certifications.

---

## 4. Key Scientific Invalidation: The "Stale Availability" Hazard

Prior speculative analysis in the project research dossier hypothesized that caching HTML pages at Vercel's edge for up to 9 hours posed a critical patient safety hazard by presenting stale ICU bed and blood availability numbers.

An exhaustive empirical and architectural audit (`research/results/datapath/datapath-staleness-audit.md`) proved that this claim is **NOT SUPPORTED**:
1. Statically prerendered HTML shells contain **only static UI chrome, navigation bars, and search forms**. Zero provider availability records or inventory numbers exist in the static HTML.
2. All 15 health resource routes across all three variants utilize React `"use client";` directives. Volatile availability data is fetched strictly at runtime via client-side `useEffect` hooks querying the Express API.
3. The Express API strictly emits `Cache-Control: no-store` on all transactional and dynamic endpoints.
4. The client API library explicitly enforces that no completed response is cached in browser memory.

This negative finding is reported prominently in the manuscript as a necessary correction to earlier research assumptions.

---

## 5. Remaining Work & Future Research Agenda

1. **Randomized Counterbalanced Developer Trials**: Future academic studies investigating framework maintenance overhead should employ randomized, counterbalanced developer rotations across identical specifications to eliminate developer sequencing bias.
2. **Real-User Field Monitoring (RUM)**: Deploying real-user telemetry to capture field Core Web Vitals (including INP and Cumulative Layout Shift during active emergency triage search) across low-cost mobile handsets on commercial 4G/5G networks in Mumbai.
3. **Strict Nonce-Based Content Security Policy**: Upgrading the shared `next.config.mjs` to inject cryptographically random per-request nonces for script execution, addressing the diagnostic finding that current headers lack a strict `script-src` nonce policy.
