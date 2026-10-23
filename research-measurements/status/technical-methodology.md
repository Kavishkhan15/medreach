# Status note: Technical methodology, caching inventory, and statistical protocol

**Worker**: Technical Methodology Specialist  
**Date**: 2026-10-23  
**Status**: Phase A Discovery Completed  

### Produced deliverables
1. `09-performance-load-and-stress-testing-methodology.md`: Formulated the six-phase testing ladder (baseline, load, stress, spike, soak, recovery) derived from first principles; detailed open arrival-rate modeling and coordinated omission mitigations; established cold/warm cache protocols, local resource budgeting within the 3.4 GB available RAM envelope, and public-site read-only observation with explicit abort rules.
2. `10-caching-and-data-freshness-analysis.md`: Completed a static code-level inventory across Next.js headers (`_next/static`, `fonts`), Express backend middleware (`security.js`, `publicCompression.js`, `tracking.js`), client-side in-flight deduplication (`packages/core/src/api.js`), and the deterministic freshness engine (`freshness.js`). Categorized volatile healthcare resource safety under RFC 9110, RFC 9111, and RFC 5861, identifying omitted cache headers on unauthenticated facility detail routes.
3. `13-statistical-analysis-and-reproducibility.md`: Established the nonparametric inferential framework (Wilcoxon tests, Hodges–Lehmann estimator, Vargha–Delaney $A_{12}$, Cliff's $d$, BCa bootstrap); bounded claims from three non-randomly authored variants ($N=3$); specified block-randomized order scheduling, supply-chain risk metrics, and the `/research-measurements/` reproducibility package layout.
4. `references-technical.bib`: Compiled 29 verified bibliographic records with DOIs, official repository URLs, and ISO access dates.

### Unverified items
- Proprietary Vercel CDN revalidation behavior on dynamic routes (requires Phase B passive header inspection).
- Playwright Chromium memory overhead under the host's 3.4 GB available memory ceiling without swap.

### Orchestrator decisions required
1. Select between the native Node.js user-space harness (Approach A, ~220 MB RAM) and containerized k6 (Approach B, 512 MB capped) for Phase B local load testing.
2. Decide whether to remediate missing cache headers on unauthenticated hospital detail endpoints prior to Phase B benchmarking.
