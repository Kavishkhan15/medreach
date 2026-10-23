# Evidence Reuse Inventory & Audit

**Auditor**: Research Coordinator & Fact Auditor  
**Date**: 2026-10-24  
**Scope**: Full repository audit of pre-existing measurements, datasets, scripts, test suites, and documentation.  
**Binding Reference**: `/home/anonymous/medreach-research-staging/briefs2/_common2.md` and `brief-reg.md`.

---

## 1. Executive Summary

This inventory audits every existing empirical measurement, script, raw capture, test suite, and research dossier document in the repository. Its goal is to prevent duplication of labor, enforce strict data integrity, and identify verified empirical evidence that can be directly cited and incorporated into the MedReach research manuscript.

### Status Definitions:
- **VERIFIED**: Methodologically sound, reproducible, validated against real systems or rigorous fixtures, with intact provenance and uncompromised integrity.
- **UNVERIFIED**: Heuristic, uncalibrated, incomplete, or lacking external validation. Must not be cited as empirical fact without explicit disclaimers.
- **SUPERSEDED**: Replaced by newer, higher-fidelity measurements or corrected by downstream empirical audits.

---

## 2. Evaluation Suite & Hosted Performance (`evaluation/`)

### 2.1 Hosted Results Document (`evaluation/HOSTED_RESULTS.md`)
- **Path**: `evaluation/HOSTED_RESULTS.md`
- **What was measured**: 
  1. Repeated navigation performance across 180 public page visits: 10 routes × 3 variants (`bootstrap`, `tailwind`, `skeleton`) × 2 profiles (desktop 1440×900 unthrottled vs mobile 390×844 throttled 4× CPU / 1.6 Mbps / 150 ms) × 3 sample visits. Metrics: LCP, CLS, TTFB, DOM load, window load.
  2. Laboratory homepage audits using Lighthouse across all three variants (mobile & desktop), measuring Performance, Accessibility, Best Practices, SEO, LCP, TBT, CLS.
- **When measured**: 2026-10-23T11:13:07.089Z → 2026-10-23T11:36:33.829Z.
- **Tool & Version**: Google Chrome 155.0.8059.84 (linux/x64), Node.js v24.22.1, Lighthouse 13.5.0, Playwright 1.50.0.
- **Status**: **VERIFIED**
- **Manuscript Reusability**: **HIGH (Core Evidence)**. Directly reusable for Section 5 (Comparative Performance Analysis), Table 1 (Lighthouse Core Web Vitals), and Table 2 (Route-by-route LCP/CLS latency comparisons). Accurately documents test constraints (e.g. timeout notices on mobile audits).

### 2.2 Evaluation Results Data (`evaluation/results/*.json`)

| File Path | What was measured | When | Tool & Version | Status | Manuscript Reusability | Notes / Integrity Check |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `evaluation/results/hosted.json` (328 KB) | 180 individual page navigation runs with raw timing events, network requests, payload sizes, console logs, and performance marks. | 2026-10-23T11:29:48Z | Playwright / Chrome 155.0 | **VERIFIED** | **HIGH** | Raw telemetry backing `HOSTED_RESULTS.md`. Clean JSON array of sample runs. |
| `evaluation/results/lighthouse.json` (36.5 KB) | Structured JSON report of Lighthouse 13.5.0 audits across 6 variant/profile configurations. | 2026-10-23T11:36:33Z | Lighthouse 13.5.0 | **VERIFIED** | **HIGH** | Raw audit scores, audit IDs, category scores, and simulated throttling parameters. |
| `evaluation/results/hosted-security.json` (3.2 KB) | HTTP response headers and security header presence (HSTS, CSP, X-Frame-Options, Permissions-Policy) across the 3 Vercel origins and Railway API. | 2026-10-23T17:00:00Z | Node HTTP / Playwright | **VERIFIED** | **HIGH** | Proves 100% security header consistency across variants. |
| `evaluation/results/network-diagnostics.json` (8.6 KB) | Edge POP network diagnostics, TLS handshake latency, DNS lookup, HTTP/2 multiplexing, and edge cache hit/miss status. | 2026-10-23T17:08:00Z | Node fetch / diagnostic harness | **VERIFIED** | **HIGH** | Confirms edge region (`bom1`, `cle1`) and protocol negotiation. |
| `evaluation/results/summary.json` (451 KB) | Aggregated statistical percentiles (p50, p75, p90), means, medians, standard deviations for all 180 route visits. | 2026-10-23T17:08:00Z | `aggregate.mjs` | **VERIFIED** | **HIGH** | Primary summary file for generating manuscript charts and tables. |
| `evaluation/results/security.json` (465 B) | Static analysis security checklist findings. | 2026-10-23T16:45:00Z | `security/audit.mjs` | **VERIFIED** | **MEDIUM** | Baseline static vulnerability check (0 known high/critical CVEs). |
| `evaluation/results/performance.json` (1.0 KB) | Early local development latency benchmark runs. | 2026-08-30T18:42:00Z | Local dev probe | **SUPERSEDED** | **LOW** | Replaced by 2026-10-23 production hosted evaluation (`hosted.json`). |

### 2.3 Evaluation Tooling & Scripts (`evaluation/`)

| Script Path | Purpose / Functionality | Tool / Dep | Status | Reusability |
| :--- | :--- | :--- | :---: | :---: |
| `evaluation/performance/hosted.mjs` | Executes 180 automated page visits against Vercel deployments with Chromium throttling. | Playwright, Chromium 155 | **VERIFIED** | Reusable for reproduction |
| `evaluation/performance/lighthouse.mjs` | Headless Lighthouse audit runner for mobile and desktop profiles. | Lighthouse 13.5.0 | **VERIFIED** | Reusable for reproduction |
| `evaluation/performance/network-check.mjs` | Queries Vercel edge endpoints for cache status, headers, and protocol parameters. | Node native fetch | **VERIFIED** | Reusable |
| `evaluation/performance/measure.mjs` | Local bundle and execution profiler. | Node.js | **VERIFIED** | Reusable |
| `evaluation/security/hosted.mjs` | Automated probe verifying production HTTP security headers and CORS isolation. | Node fetch | **VERIFIED** | Reusable |
| `evaluation/security/audit.mjs` | Parses and validates `npm audit` reports without suppressing findings. | Node.js | **VERIFIED** | Reusable |
| `evaluation/measure/bundles.mjs` | Computes gzip and uncompressed JavaScript/CSS bundle sizes for all 3 variants. | Node.js / fs | **VERIFIED** | Reusable for Table 3 |
| `evaluation/aggregate.mjs` | Computes robust statistical aggregations across raw hosted sample runs. | Node.js | **VERIFIED** | Reusable |
| `evaluation/render-report.mjs` | Generates formatted markdown tables from JSON evaluation outputs. | Node.js | **VERIFIED** | Reusable |
| `evaluation/scoring/risk-score.js` | Heuristic composite security risk score calculation. | Node.js | **UNVERIFIED** | **Heuristic Only**. Must NOT be presented as a calibrated probability. |

---

## 3. Empirical Research Measurements (`research-measurements/`, 149 files)

### 3.1 Systematic Literature Review Corpus (`research-measurements/literature/`, 20 files)
- **What was measured**: Systematic query, extraction, filtering, deduplication, and verification of scientific literature on emergency medical access, Age of Information (AoI), hospital bed management systems, and public healthcare directories.
- **When created**: 2026-10-23.
- **Tools**: Python 3.11, PubMed E-utilities, OpenAlex API, CrossRef REST API, DOAJ API.
- **Key Artifacts**:
  - `verified_corpus.json`: 25 systematically curated, DOI-verified foundational and targeted papers.
  - `curated_dossier.json`: Annotated abstracts, methodology tags, and empirical findings.
  - `build_evidence_matrix.py`: Script compiling multi-dimensional evidence matrices.
  - `generate_bib.py`: Automated BibTeX citation builder.
- **Status**: **VERIFIED**
- **Manuscript Reusability**: **HIGH (Foundational Literature)**. Directly used in Section 2 (Related Work) and Section 3 (Theoretical Framework).

### 3.2 Raw Literature Query Dumps (`research-measurements/literature/raw/`, 106 files)
- **What was captured**: Raw JSON response payloads from official bibliographic APIs:
  - 32 CrossRef query responses across bed management, directory accuracy, AoI freshness, Mumbai healthcare, and interoperability.
  - 34 OpenAlex query responses on urban access, blood logistics, and data provenance.
  - 35 PubMed search results across clinical emergency triage and digital health systems.
  - 5 DOAJ open-access search dumps.
- **Status**: **VERIFIED (Primary Raw Evidence)**
- **Manuscript Reusability**: **HIGH (Methodological Audit Trail)**. Confirms no hallucinated or fabricated citations.

### 3.3 Interim Working Notes (`research-measurements/status/`, 6 files)
- **Files**: `worker-78.md`, `worker-code-audit.md`, `healthcare-access.md`, `02-existing-platforms-comparison.md`, `worker-platforms-comparison.md`, `technical-methodology.md`.
- **Status**: **SUPERSEDED** (Consolidated and refined into the 24-file research dossier in `docs/research/medreach-healthcare-access/`).

### 3.4 Existing Government & Public Healthcare Platforms (`research-measurements/existing-platforms/`, 17 files)
- **What was captured**: Direct, real-world network and payload captures from current Indian and Mumbai healthcare systems:
  1. **BMC Health (Municipal Corporation of Greater Mumbai - MCGM)**:
     - `bmchealth_home.html`, `bmchealth_headers.txt`, `bmchealth_main.js`, `bmchealth_major_hospitals.json`, `bmchealth_peripheral.json`.
     - Demonstrates lack of public APIs, reliance on unstructured tabular PDF/HTML dumps, and absence of real-time machine-readable availability.
  2. **e-RaktKosh (Central Government Blood Portal)**:
     - `eraktkosh_home.html`, `eraktkosh_headers.txt`, `eraktkosh_main.js`, `eraktkosh_master.json`, `eraktkosh_mh_bloodbanks.json`, `eraktkosh_cooper_availability.json`, `eraktkosh_jj_availability.json`.
     - Captures real Maharashtra blood bank listings, multi-hour update delays, and manual batch update patterns.
  3. **MahaSBTC (Maharashtra State Blood Transfusion Council)**:
     - `mahasbtc_home.html`, `mahasbtc_headers.txt`, `mahasbtc_stock.html`, `mahasbtc_blood_on_call.html`.
     - Captures state-level blood emergency protocols and directory structures.
  4. **HMIS MCGM**:
     - `hmis_mcgm_home.html`: Hospital Management Information System landing.
- **When captured**: October 2026.
- **Status**: **VERIFIED**
- **Manuscript Reusability**: **HIGH (Baseline Comparative Evidence)**. Crucial for Section 1 (Introduction) and Section 4 (State of the Art vs MedReach Gap Analysis).

---

## 4. Test Suites (`tests/` & `backend/test`)

### 4.1 Unit Test Suite (`tests/unit/`, 5 files)
- **Files**: `admin-mutation-response.test.mjs`, `admin-state.test.mjs`, `emergency-admin.test.mjs`, `evaluation-evidence.test.mjs`, `scroll-animation.test.mjs`.
- **What is verified**: State machine invariants, admin mutation status code guarantees, evaluation evidence parsers, UI animation boundary values.
- **Tool**: Node.js built-in test runner (`node:test`, `node:assert/strict`).
- **Status**: **VERIFIED**. High reusability as proof of test coverage and code quality.

### 4.2 End-to-End Test Suite (`tests/e2e/`, 20 spec files)
- **Key Files**: `critical-journeys.spec.js`, `bed-request-lifecycle.spec.js`, `admin-reliability.spec.js`, `home-parity.spec.js`, `assistant-ui.spec.js`, `notification-feedback.spec.js`, `roles.spec.js`, `security-hardening.spec.js`.
- **What is verified**: Multi-variant functional parity, unauthenticated emergency access, bed request lifecycle transitions, provider onboarding, idempotency token transmission, accessibility landmarks.
- **Tool**: Playwright 1.50.0.
- **Status**: **VERIFIED**. High reusability as evidence of architectural parity and interface reliability.

### 4.3 Backend Test Suite (`backend/test/`, 50 test files)
- **Key Areas**:
  - `ambulanceBooking.test.js`, `bedRequestLifecycle.mongo.test.js`, `urgentBloodFlow.test.js`: State machine correctness and role guards.
  - `facilityClaimFusion.test.js`, `hospitalFieldFusion.test.js`: Deterministic source reliability weighting and multi-source conflict detection.
  - `authConcurrency.test.js`, `performance.mongo.test.js`: Concurrency handling and query execution plans.
  - `securityConfiguration.test.js`, `authSecurity.mongo.test.js`, `localSecurity.mongo.test.js`: Injection prevention, CORS enforcement, rate limiters.
- **Status**: **VERIFIED**. High reusability as evidence for Section 6 (System Reliability & Transactional Semantics).

---

## 5. The 24-File Research Dossier (`docs/research/medreach-healthcare-access/`)

| File / Component | Subject Matter | Status | Manuscript Reusability / Actions |
| :--- | :--- | :---: | :--- |
| `00-research-objectives-and-scope.md` | Research scope, Mumbai urban context, problem statement. | **VERIFIED** | Directly adaptable into Section 1 (Introduction). |
| `01-medreach-code-and-feature-audit.md` | Comprehensive architectural and feature inventory across 3 variants. | **VERIFIED** | Adaptable for Section 3 (System Architecture). |
| `02-existing-platforms-comparison.md` | Empirical comparison of MedReach vs BMC, e-RaktKosh, MahaSBTC. | **VERIFIED** | Key comparative tables for Section 4 (State of Art). |
| `03-literature-search-method.md` | PRISMA-compliant search methodology and database querying strategy. | **VERIFIED** | Core methodology for Section 2 (Literature Review). |
| `04-literature-review.md` | Synthesized literature review covering AoI, triage, and health informatics. | **VERIFIED** | Directly usable for Section 2. |
| `05-literature-evidence-matrix.md` | Tabular evidence matrix linking empirical findings to literature. | **VERIFIED** | Reusable as manuscript Table / Appendix. |
| `06-research-gap-and-novelty-assessment.md` | Formal statement of gaps in existing emergency health platforms. | **VERIFIED** | Reusable for Section 1 and Section 7 (Discussion). |
| `07-research-questions-and-hypotheses.md` | Formulation of core hypotheses (H1: Parity, H2: Freshness, H3: Concurrency). | **VERIFIED** | Core framing for Section 3. |
| `08-system-architecture-and-proposed-design.md` | Decoupled architecture, headless core, multi-source claim fusion. | **VERIFIED** | Reusable for Section 3 & System Figures. |
| `09-performance-load-and-stress-testing-methodology.md` | Rigorous load testing protocol and stop conditions. | **VERIFIED** | Methodological blueprint for EXP-LOAD. |
| `10-caching-and-data-freshness-analysis.md` | Analysis of edge caching, HTTP headers, and data staleness. | **PARTIALLY SUPERSEDED** | **CORRECTION REQUIRED**: Section 3.1.4 stale-availability inference superseded by EXP-REG Task 3 audit (`datapath-staleness-audit.md`). |
| `11-backend-reliability-and-security-evidence.md` | Backend test evidence, security headers, role access control. | **VERIFIED** | Reusable for Section 6. |
| `12-healthcare-access-evaluation-methodology.md` | Evaluation framework for urban healthcare discovery latency. | **VERIFIED** | Reusable for Section 5. |
| `13-statistical-analysis-and-reproducibility.md` | Statistical rigor, replication rules, percentile bounds. | **VERIFIED** | Methodological integrity standard. |
| `14-data-governance-and-ethics.md` | Privacy rules, DISHA/HIPAA compliance, no real PHI. | **VERIFIED** | Crucial for Ethics & Data Governance section. |
| `15-open-source-tools-and-licensing.md` | Licensing audit of third-party libraries (MIT, Apache-2.0). | **VERIFIED** | Reusable for Appendix / Artifacts. |
| `16-experimental-results.md` | Working summary of experimental outcomes. | **RUNNING** | To be updated with final results from EXP-AOI, EXP-PROV, EXP-TX, EXP-LOAD. |
| `17-threats-to-validity-and-limitations.md` | Internal, external, construct, and conclusion validity threats. | **VERIFIED** | Crucial for Section 7 (Limitations). |
| `18-proposed-paper-outline.md` | 8-section target manuscript structure. | **VERIFIED** | Structural template for the final publication paper. |
| `evidence-register.md` | Traceability matrix linking dossier claims to empirical artifacts. | **VERIFIED** | Cross-verification index. |
| `references.bib`, `references-health.bib`, `references-technical.bib` | Clean BibTeX bibliographies. | **VERIFIED** | Ready for LaTeX manuscript compilation. |
| `research-proposal.md` | Comprehensive research project proposal. | **VERIFIED** | Background context. |
| `merged-research-dossier.html` | Compiled monolithic HTML dossier. | **PARTIALLY SUPERSEDED** | Reflects earlier caching claim; superseded in that section. |
