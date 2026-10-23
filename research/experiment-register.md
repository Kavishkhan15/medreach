# MedReach Master Experiment Register

**Document Identifier**: `research/experiment-register.md`  
**Research Coordinator & Fact Auditor**: MedReach Research Coordinator  
**Date**: 2026-10-24  
**Governing Protocol**: `briefs2/_common2.md` and `briefs2/brief-reg.md`  
**Repository Working Copy**: `/home/anonymous/medreach`

---

## 1. Master Experiment Tracking Matrix

| Experiment ID | Research Domain / RQ | Epistemological Category | Status | Owner | Result / Artifact Path | Blocker or Operational Reason |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| **EXP-REG** | Evidence Audit & Edge Caching Data Path (RQ1/RQ2) | Empirical Audit & Fact Verification | **EXECUTED** | Research Coordinator | `/home/anonymous/medreach/research/results/datapath/` | None. Completed with definitive empirical verdict (`datapath-staleness-audit.md`). |
| **EXP-AOI** | Age of Information & Freshness Decay (RQ1) | Algorithmic Simulation (Seeded) | **EXECUTED** | AOI Specialist | `/home/anonymous/medreach/research/results/aoi/` | Completed. Synthetic decay simulation across 5 operational scenarios. |
| **EXP-PROV** | Multi-Source Provenance & Conflict Fusion (RQ3) | Grounded Empirical Simulation | **EXECUTED** | Provenance Specialist | `/home/anonymous/medreach/research/results/provenance/` | Completed. Synthetic claim fusion across varying source reliability and disagreement. |
| **EXP-TX** | Transactional Concurrency & Idempotency (RQ2) | Synthetic Stress Benchmark | **RUNNING** | Transactional Specialist | `/home/anonymous/medreach/research/results/transactional/` | Running. Executing against isolated port 27018 disposable MongoDB. |
| **EXP-LOAD** | Local Load, Stress, Soak & Recovery | Synthetic Workload Benchmark | **RUNNING** | Load Specialist | `/home/anonymous/medreach/research/results/load/` | Running. Executing against isolated port 27018 backend via autocannon. |
| **EXP-SE** | Presentation Boundary Drift & Small-$N$ Parity (RQ5) | Descriptive Multi-Case Study ($N=3$) | **EXECUTED** | Evaluation Team | `evaluation/HOSTED_RESULTS.md`, `evaluation/results/` | Completed. 180 hosted navigation visits, bundle sizes, Lighthouse 13.5.0 audits. |
| **EXP-SPA** | Spatial Accessibility & Co-Dependent Care (RQ4) | Exploratory Spatial Catchment Analysis | **NOT ATTEMPTED** | GIS / Health Systems Team | Dossier Sections 08, 12, 16 (`docs/research/...`) | Geodesic distance modeled analytically. Dynamic routing simulation requiring external Maps API blocked by Rule 16 (`_common2.md`). |
| **EXP-CLINICAL** | Live Clinical Outcomes & Triage Diversion | Clinical Human Trial | **BLOCKED** | N/A | None | **Strict Research Ethics Blocker**: No IRB approval; prohibited by Rule 31-32 (`_common2.md`). No fabrication of patient outcomes permitted. |
| **EXP-MAPS-LIVE** | Live Metropolitan Traffic Routing Latency | External API Ingestion | **BLOCKED** | N/A | None | **Safety & Cost Blocker**: Prohibited by `_common2.md` line 16 ("Never call external Maps or paid APIs"). |
| **EXP-SMTP-LIVE** | Live Email Notification & Invite Delivery | Telecommunications Probe | **BLOCKED** | N/A | None | **Safety Blocker**: Prohibited by `_common2.md` line 15 ("Always set EMAIL_ENABLED=false ... Never send email"). |

---

## 2. Detailed Experiment Profiles & Status

### 2.1 EXP-REG: Evidence Audit, Reuse Inventory & Data Path Staleness Audit
- **Primary Questions**: 
  1. What empirical evidence already exists in the repository that can be reused for manuscript evidence?
  2. Does multi-hour edge caching of prerendered HTML shells on Vercel actually stale healthcare availability data in MedReach?
- **Owner**: Research Coordinator & Fact Auditor
- **Status**: **EXECUTED**
- **Artifacts & Result Paths**:
  - Evidence Reuse Inventory: `/home/anonymous/medreach/research/evidence-reuse-inventory.md`
  - Master Experiment Register: `/home/anonymous/medreach/research/experiment-register.md`
  - Data Path Audit Report: `/home/anonymous/medreach/research/results/datapath/datapath-staleness-audit.md`
  - Automated Audit Summary JSON: `/home/anonymous/medreach/research/results/datapath/datapath_audit_summary.json`
  - Raw HTTP Headers & HTML Captures: `/home/anonymous/medreach/research/results/datapath/captures/` (22 target endpoints)
  - Data Path Probe Script: `/home/anonymous/medreach/research/results/datapath/datapath_probe.mjs`
- **Definitive Findings**:
  - The stale-availability hazard is **NOT SUPPORTED** in this codebase.
  - Statically prerendered HTML shells served by Vercel edge nodes contain **zero** clinical availability metrics and **zero** provider database records. They render static layout shells with initial empty/loading states ("Loading providers...").
  - All 15 discovery and emergency routes across all three variants use `"use client";` directives and fetch live data client-side after hydration.
  - The client API library (`packages/core/src/api.js`) explicitly purges completed reads immediately (`pendingReads.delete(key)`).
  - The Express backend API on Railway is completely decoupled from Vercel edge caching and emits `no-store` or origin-revalidating headers.
  - The earlier dossier inference in Section 3.1.4 is corrected from an active defect to an architectural design-risk observation.

---

### 2.2 EXP-AOI: Age of Information and Staleness Simulation
- **Primary Question (RQ1)**: How does the age of availability information evolve under realistic provider update behavior, and what does that imply for freshness-aware discovery and ranking?
- **Owner**: AOI Specialist
- **Status**: **EXECUTED**
- **Artifacts & Result Paths**:
  - Experiment Specification: `/home/anonymous/medreach/research/experiments/aoi/SPECIFICATION.md`
  - Simulation Script: `/home/anonymous/medreach/research/experiments/aoi/simulate_aoi.py`
  - Full Technical Report: `/home/anonymous/medreach/research/results/aoi/REPORT.md`
  - Scenario Summary Data: `/home/anonymous/medreach/research/results/aoi/scenario_summary.csv`
  - Time-to-Stale Data: `/home/anonymous/medreach/research/results/aoi/time_to_stale.csv`
  - Time Series Sample: `/home/anonymous/medreach/research/results/aoi/timeseries_sample.csv`
  - Raw Metrics JSON: `/home/anonymous/medreach/research/results/aoi/raw_metrics.json`
  - Charts (PNG):
    * `fig1_aoi_trajectories.png`: AoI sample trajectories across scenarios
    * `fig2_aoi_ecdf.png`: Empirical Cumulative Distribution Functions of information age
    * `fig3_error_vs_coverage_pareto.png`: Error rate vs coverage Pareto frontiers
    * `fig4_phantom_availability_risk.png`: Phantom availability risk analysis
    * `fig5_time_to_stale_distributions.png`: Distributions of time-to-stale under update dropouts
- **Methodological Guardrails**:
  - Explicitly declared as a **SYNTHETIC simulation** of an information-aging process.
  - Does not model physical hospital ward dynamics or claim live clinical observation.
  - Pre-registered staleness thresholds anchored around the existing 30-minute system window (`constants.js`).

---

### 2.3 EXP-PROV: Provenance and Conflicting-Claim Resolution
- **Primary Question (RQ3)**: How effectively does multi-source claim fusion resolve conflicting facility attributes across varying source counts, disagreement rates, and update staleness?
- **Owner**: Provenance Specialist
- **Status**: **EXECUTED**
- **Artifacts & Result Paths**:
  - Fusion Runner: `/home/anonymous/medreach/research/experiments/provenance/exp_prov_runner.mjs`
  - Analysis Script: `/home/anonymous/medreach/research/experiments/provenance/analyze_results.py`
  - Technical Report: `/home/anonymous/medreach/research/results/provenance/PROVENANCE_FUSION_REPORT.md`
  - Raw Trial Datasets: `raw_exp1_trials.json`, `raw_exp2_trials.json`, `raw_exp3_trials.json`, `raw_exp4_trials.json`, `raw_field_trials.json`, `raw_calibration_trials.json`
  - Metrics & Tables: `summary_metrics.json`, `exp1_source_count_disagreement.csv`, `calibration_trials.csv`, `confusion_matrix.csv`, `calibration_analysis.json`
  - Charts (PNG):
    * `fig1_conflict_detection.png`: Conflict detection rate across disagreement rates
    * `fig2_accuracy_and_unresolved.png`: Fusion accuracy and unresolved rate vs source count
    * `fig3_staleness_sensitivity.png`: Sensitivity to source staleness degradation
    * `fig4_dropout_sensitivity.png`: Robustness against source dropout
    * `fig5_calibration_curve.png`: Confidence score calibration curve (Brier score / reliability diagram)
    * `fig6_confusion_matrix.png`: Multi-class confusion matrix for facility capability classification
- **Methodological Guardrails**:
  - Exercises the real repository fusion engines: `facilityClaimFusion.js` and `hospitalFieldFusion.js`.
  - Evaluated confidence scores against formal calibration metrics (Brier score, calibration curve), satisfying the critical integrity requirement.
  - Synthetic ground truth explicitly documented with capabilities and limitations.

---

### 2.4 EXP-TX: Request Correctness & Transactional Coordination
- **Primary Question (RQ2)**: To what extent does an idempotency-guarded, token-based state machine prevent duplicate allocations and maintain lifecycle consistency under concurrent emergency requests?
- **Owner**: Transactional Specialist
- **Status**: **RUNNING**
- **Artifacts & Result Paths**:
  - Experiment Code: `/home/anonymous/medreach/research/experiments/transactional/`
    * `db-guard.mjs`: Safety verification ensuring port 27017 is NEVER touched
    * `fixtures.mjs`: Isolated synthetic hospital and user fixtures
    * `exp1-duplicate-prevention.mjs`: Concurrent duplicate submission test harness
    * `exp2-idempotent-retries.mjs`: Key replay and simulated timeout retry harness
    * `exp3-concurrent-requests.mjs`: Resource competition concurrency harness
  - Results Directory: `/home/anonymous/medreach/research/results/transactional/`
    * `exp1_duplicate_prevention.json`: Replay tests confirming `409 Conflict` (`IDEMPOTENCY_KEY_REUSED`)
    * `exp2_idempotent_retries.json`: Key replaying outcomes
    * `exp3_concurrent_requests.json`: Optimistic concurrency lock outcomes
- **Safety Protocol**:
  - Bound to disposable MongoDB on `127.0.0.1:27018` with dbpath `/tmp/medreach-test-db`.
  - Production database on port 27017 strictly untouched.

---

### 2.5 EXP-LOAD: Load, Stress, Spike, Soak and Recovery Benchmark
- **Primary Question**: What are the throughput, latency, and degradation characteristics of the MedReach backend under baseline, stress, spike, and soak workloads?
- **Owner**: Load Specialist
- **Status**: **RUNNING**
- **Artifacts & Result Paths**:
  - Specification: `/home/anonymous/medreach/research/experiments/load/SPECIFICATION.md`
  - Test Harness: `/home/anonymous/medreach/research/experiments/load/run-load-scenarios.mjs` (via `autocannon`)
  - Seed Script: `/home/anonymous/medreach/research/experiments/load/seed-load-data.mjs`
  - Analysis Script: `/home/anonymous/medreach/research/experiments/load/analyze-results.py`
  - Results Directory: `/home/anonymous/medreach/research/results/load/`
    * Execution Log: `load_execution.log`
    * Raw Runs: `raw/scn01_baseline_*.json`
    * Tables: `tables/`
    * Figures: `figures/`
- **Safety Protocol**:
  - Strictly executed against local instance on port 27018.
  - Zero traffic directed to public Vercel sites or Railway API.

---

### 2.6 EXP-SE: Presentation Boundary Drift & Framework Parity ($N=3$)
- **Primary Question (RQ5)**: What maintainability and performance divergences emerge across Bootstrap, Tailwind, and Skeleton variants under clone-and-own evolution?
- **Owner**: Evaluation Team & Research Coordinator
- **Status**: **EXECUTED**
- **Artifacts & Result Paths**:
  - Evaluation Report: `/home/anonymous/medreach/evaluation/HOSTED_RESULTS.md`
  - Telemetry: `/home/anonymous/medreach/evaluation/results/hosted.json`
  - Lighthouse Audits: `/home/anonymous/medreach/evaluation/results/lighthouse.json`
  - Summary Metrics: `/home/anonymous/medreach/evaluation/results/summary.json`
  - Bundle Decompositions: `evaluation/measure/bundles.mjs`
- **Methodological Guardrails**:
  - Strictly descriptive small-$N$ case study ($N=3$).
  - Acknowledges 100% collinearity with git commit order; makes zero claims of causal framework superiority.

---

### 2.7 EXP-SPA: Spatial Accessibility & Co-Dependent Care
- **Primary Question (RQ4)**: How are emergency capabilities distributed across Mumbai's administrative corridors, and what spatial accessibility disparities emerge under multi-resource co-dependency?
- **Owner**: Health Systems / GIS Team
- **Status**: **NOT ATTEMPTED** (Analytical modeling completed in dossier; live routing simulation omitted)
- **Justification / Blocker**:
  - The static geodesic (Haversine) analysis across the 114 verified facilities is fully detailed in dossier Sections 08 and 16.
  - Dynamic transit simulation using real-time road networks was deliberately not attempted because calling external Google Maps Distance Matrix or Mapbox APIs is strictly prohibited by `_common2.md` line 16. Great-circle distance calculations suffice for structural corridor comparisons.

---

### 2.8 Prohibited & Blocked Investigations (Negative Register)

| Proposed Study | Formal Status | Precise Blocker & Ethical / Safety Constraint |
| :--- | :---: | :--- |
| **EXP-CLINICAL** (Live Patient Outcomes) | **BLOCKED** | Prohibited by research ethics and international regulations (Declaration of Helsinki, ICMJE standards). MedReach is an informational discovery testbed, not an approved medical device. No clinical trial approval, patient consent, or hospital IRB clearance exists. Rule 31-32 strictly prohibits fabricating human participant data or clinical outcome claims. |
| **EXP-MAPS-LIVE** (Paid Maps API Under Traffic) | **BLOCKED** | Prohibited by `_common2.md` Rule 16 ("Never call external Maps or paid APIs") to ensure zero monetary cost and zero external network dependencies. |
| **EXP-SMTP-LIVE** (Live Email Dispatch) | **BLOCKED** | Prohibited by `_common2.md` Rule 15 ("Always set EMAIL_ENABLED=false ... Never send email"). Prevents unsolicited email transmission to real addresses or spamming mail servers. |
| **EXP-VERCEL-LOAD** (Public CDN Load/Spike Testing) | **BLOCKED** | Prohibited by `_common2.md` Rule 19 ("NO load, stress, spike or soak traffic against the three public Vercel deployments or the shared Railway API"). Prevents denial-of-service, bandwidth exhaustion, or quota violations on public hosting tiers. |

---

## 3. Register Verification & Integrity Sign-Off

I certify that this register accurately reflects the verified operational state of all experiments in the MedReach research campaign as of 2026-10-24. No numbers, test results, or citations have been fabricated. All completed and running experiments have been verified against real artifacts on disk.

*Signed,*  
**Research Coordinator & Fact Auditor**  
MedReach Final Research Execution Team
