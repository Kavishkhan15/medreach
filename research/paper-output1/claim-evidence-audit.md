# Claim-Evidence Audit: Output 1 Primary Manuscript
**Manuscript**: Freshness-Aware, Provenance-Tracked Healthcare Resource Discovery in Fragmented Urban Ecosystems: System Design, Staleness Dynamics, and Transactional Evaluation
**Target**: MedReach Platform (`/home/anonymous/medreach`)
**Date**: 2026-10-24
**Auditor**: Primary Manuscript Author

---

## 1. Audit Policy & Evidentiary Standard

Every empirical claim, quantitative measurement, latency figure, and percentage reported in the Output 1 manuscript must trace directly to a verified, executed artifact file within the repository. Unexecuted claims, fabricated citations, unverified clinical assertions, or promotional statements are strictly prohibited.

---

## 2. Claim-to-Artifact Traceability Matrix

| Section & Claim Description | Numeric Value / Finding in Manuscript | Source Artifact Path | Verification Method / Command |
| :--- | :--- | :--- | :--- |
| **AoI: Replications & Scale** | 6 scenarios, 50 replications per scenario (300 trajectories), 1,296,000 query evaluations over 72-hour operational horizons. | `research/results/aoi/REPORT.md`, `scenario_summary.csv`, `raw_metrics.json` | Direct run logs of `simulate_aoi.py`; master seed `20261024`. |
| **AoI: 30-min Anchor Under 2h Shift Reporting (S2)** | Withholds status 78.42% of query instants; active coverage 21.58%; error rate when known 32.49%; phantom availability suppressed to 0.337%. | `research/results/aoi/scenario_summary.csv` (row 6), `REPORT.md` | Aggregated from 50 runs of 4,320 queries. |
| **AoI: Loose Threshold Explosion ($\tau = 180\text{ min}$)** | Coverage rises to 97.15%, but phantom availability increases 18.9x to 6.382%; status error when known reaches 53.71%. | `research/results/aoi/scenario_summary.csv` (row 8), `REPORT.md` | Ratio $6.382\% / 0.337\% = 18.937\approx 18.9\text{x}$. |
| **AoI: Ingestion Pipeline Delay Trap (S5)** | 51.79% of updates arrive already stale at $\tau = 30\text{ min}$; 99.64% arrive already stale at $\tau = 10\text{ min}$; coverage drops to 0.25% at 10m. | `research/results/aoi/time_to_stale.csv` (rows 20-21), `scenario_summary.csv` (row 20) | Direct arrival vs generation timestamp delay tracking. |
| **AoI: Surge & Bursty Tail (S3)** | Median AoI 27.35 min, Mean 40.94 min, P95 stretches to 125.09 min, Max 412.50 min. | `research/results/aoi/scenario_summary.csv` (row 11), `REPORT.md` | Gamma/Pareto heavy-tailed inter-arrival distribution ($k=0.7$). |
| **AoI: Diurnal Shift Night Lull (S6)** | Mean AoI 73.04 min, Median 35.60 min, P95 281.21 min, Max 510.20 min; 55.47% withheld as safe unknown under 30m anchor. | `research/results/aoi/scenario_summary.csv` (row 26), `REPORT.md` | 24-hour non-homogeneous Poisson cycle modeling handover peaks vs night lull. |
| **AoI: Automated Telemetry Baseline (S1)** | Mean AoI 4.30 min, Median 4.11 min, P95 8.70 min; 100.0% coverage under 30m anchor. | `research/results/aoi/scenario_summary.csv` (row 1), `REPORT.md` | Automated telemetry with LogNormal transit delay. |
| **Edge Caching Staleness Audit (NEGATIVE FINDING)** | **Verdict: NOT SUPPORTED**. Edge-cached HTML shells contain zero volatile availability data (empty structural shells only); all availability data fetched dynamically at runtime via `"use client"` React hooks. | `research/results/datapath/datapath-staleness-audit.md` | Exhaustive probe of 22 endpoints (15 HTML routes + 7 API endpoints); AST analysis of client bundles. |
| **Data Fusion: Conflict Detection** | 100.0% conflict detection rate across all divergent usable claims in facility capability and structured fields. | `research/results/provenance/PROVENANCE_FUSION_REPORT.md`, `summary_metrics.json` | Direct execution of production `fuseFacilityClaims` and `resolveHospitalField` on 40,000+ synthetic trials. |
| **Data Fusion: Conservative Safety Fallback** | 87.1% unverified multi-source conflict scenarios held as unresolved (`unknown`); 100.0% freeze rate on institutional verified disputes. | `research/results/provenance/PROVENANCE_FUSION_REPORT.md` (Section 1 & 4.2) | Direct trial evaluation in `raw_exp2_trials.json`. |
| **Data Fusion: Conditional Accuracy** | 90.29% conditional accuracy when a claim is resolved across 12,000 trials; overall decision error rate 7.38%. | `research/results/provenance/PROVENANCE_FUSION_REPORT.md` (Section 1) | Aggregated across 24 noise-source cells in `exp1_source_count_disagreement.csv`. |
| **Data Fusion: Verified Anchor Dominance** | Verified anchor achieves 95.9% correct resolution and 0.0% erroneous decisions against noisy unverified scrapers. | `research/results/provenance/PROVENANCE_FUSION_REPORT.md` (Section 4.2) | 1,000 trials evaluated in Experiment 2. |
| **Confidence Calibration (CRITICAL FINDING)** | Confidence score is an **uncalibrated heuristic ranking**, not a calibrated probability: Brier score 0.1315, ECE 0.1255, MCE 0.7333; HIGH confidence empirical accuracy 87.65% (nominal 100%), MEDIUM 82.28% (nominal 70%). | `research/results/provenance/calibration_analysis.json`, `PROVENANCE_FUSION_REPORT.md` | Reliability diagram and ECE calculation over 10,615 resolved claims in `calibration_trials.csv`. |
| **Transactional: Request Correctness Suite** | 48 test assertions evaluated across 8 sub-domains: 48 passed, 0 failed (100.0% pass rate). | `research/results/transactional/TRANSACTIONAL_RELIABILITY_REPORT.md`, `transactional_experiment_summary.json` | Master test suite executed against isolated MongoDB on port 27018. |
| **Transactional: Idempotency Key Handling** | SHA-256 scoped idempotency key enforces strict deduplication; identical re-submission returns 200 OK with cached record; cross-user key reuse returns `409 IDEMPOTENCY_KEY_REUSED`. | `research/results/transactional/TRANSACTIONAL_RELIABILITY_REPORT.md` (EXP-TX-01 & 02) | 17 assertions in `exp1_duplicate_prevention.json` & `exp2_idempotent_retries.json`. |
| **Transactional: Optimistic Concurrency (OCC)** | Under N=10 and N=8 simultaneous conflicting transitions, exactly 1 atomic update wins (200 OK) and N-1 fail with 409 Conflict. | `research/results/transactional/TRANSACTIONAL_RELIABILITY_REPORT.md` (EXP-TX-03) | Atomic `findOneAndUpdate` checking status and `timeline.[len]: { $exists: false }`. |
| **Transactional: Separation of Telemetry & Request** | Submitting 10 emergency requests, accepting 3, and completing 2 did NOT decrement `AvailabilityObservation` quantity (remained 5). Point-in-time capacity is strictly decoupled from request fulfillment. | `research/results/transactional/TRANSACTIONAL_RELIABILITY_REPORT.md` (EXP-TX-08) | Assertions in `exp8_availability_separation.json`. |
| **Transactional: Current vs Required Implementation** | Current system demonstrably guarantees single-document OCC, idempotent deduplication, and state-machine RBAC, but **REQUIRES IMPLEMENTATION** of multi-document distributed sagas, TTL-based reservation holds, and replica-majority read concerns. | `research/results/transactional/TRANSACTIONAL_RELIABILITY_REPORT.md` (Section 3) | Comprehensive two-column architectural analysis. |
| **Isolated Load & Throughput Benchmarking** | Baseline read throughput: `/api/hospitals` sustains 298.9–299.2 req/s (median latency 3 ms); `/health` sustains 7,131–7,362 req/s (0 ms). Spike test at C=250 achieves 386.7 req/s with 624 ms median latency and 0 errors. Post-load recovery maintains 305–328 req/s. | `research/results/load/load_execution.log`, `scn01_baseline_*.json`, `scn04_spike_peak.json`, `scn06_recovery_*.json` | Isolated `autocannon` 8.0.0 execution on port 4200 backed by MongoDB 27018. |
| **Platform Comparison: Mumbai Landscape** | Existing platforms (BMC Health Dashboard, e-RaktKosh, MahaSBTC, NHM HMIS) operate strictly at Tiers 1–3 (directory listings and unverified self-reported asynchronous stock); 0 platforms provide Tier 4/5 provider-confirmed availability or two-way request orchestration. | `docs/research/medreach-healthcare-access/02-existing-platforms-comparison.md`, `research-measurements/existing-platforms/` | Empirical HTTP inspection and static bundle AST analysis of live Maharashtra public healthcare web portals. |

---

## 3. Negative & Corrective Findings Explicitly Tracked

1. **Edge Caching Staleness Correction**:
   - *Previous Dossier Inference*: Hypothesized that multi-hour Vercel edge caching (`x-vercel-cache: HIT`, age ~32,000s) presented stale bed counts to emergency patients.
   - *Empirical Audit Finding*: **Not Supported**. HTML shells contain only structural DOM skeletons; data fetching is entirely client-side via React hooks with zero server-side SSG availability baking.
   - *Resolution in Manuscript*: Reported prominently in Results and Discussion as a corrected architectural finding, distinguishing real static shell caching from hypothetical SSG data staling.
2. **Confidence Score Calibration Deficiency**:
   - *Previous Assumption*: Assumed confidence levels (`HIGH`, `MEDIUM`, `LOW`) mapped to calibrated probabilities of claim correctness.
   - *Empirical Audit Finding*: Expected Calibration Error is 0.1255, and Maximum Calibration Error is 0.7333. The score functions as an uncalibrated heuristic ordinal ranking, not a true probability.
   - *Resolution in Manuscript*: Formally documented in the Provenance and Data Fusion section as an uncalibrated metric requiring future Platt scaling or isotonic regression.

---

## 4. Citation-Integrity Repair Audit (FIX-MS1)

| Citation Key | Status | Resolution / Action Taken | Crossref Verification / DOI |
| :--- | :--- | :--- | :--- |
| `kaul2012real` | Key Mismatch | Corrected to canonical key `kaul2012realtime` matching `references.bib`. | Verified: DOI `10.1109/infcom.2012.6195689`, IEEE INFOCOM 2012. |
| `yates2021age` | Missing from bib | Verified via Crossref REST API; complete BibTeX entry added. | Verified: DOI `10.1109/jsac.2021.3065072`, IEEE JSAC 2021. |
| `sun2017update` | Missing from bib | Verified via Crossref REST API; complete BibTeX entry added. | Verified: DOI `10.1109/tit.2017.2735804`, IEEE Trans. Inf. Theory 2017. |
| `bleiholder2008data` | Missing from bib | Verified via Crossref REST API; complete BibTeX entry added. | Verified: DOI `10.1145/1456650.1456651`, ACM Comput. Surv. 2009. |
| `dong2009data` | Missing from bib | Verified via Crossref REST API; complete BibTeX entry added. | Verified: DOI `10.14778/1687627.1687691`, Proc. VLDB Endow. 2009. |
| `moreau2011open` | Missing from bib | Verified via Crossref REST API; complete BibTeX entry added. | Verified: DOI `10.1016/j.future.2010.07.005`, Future Gener. Comput. Syst. 2011. |
| `albutt2020emergency` | Unverified | Removed from manuscript; replaced with verified LMIC navigation papers. | Replaced with `metuge2026digital` (DOI `10.59067/afjhms.v11i2.126`) and `dalton2019patient` (DOI `10.1371/journal.pone.0223537`). |
| `balsari2017emergency` | Unverified | Removed from manuscript; replaced with verified Mumbai health studies. | Replaced with `darapaneni2021predicting` (DOI `10.1007/978-981-16-1502-3_5`) and `naydenova2017healthcare` (DOI `10.12688/wellcomeopenres.11536.2`). |
| `kamdar2019emergency` | Unverified | Removed from manuscript; replaced with verified Mumbai health studies. | Replaced with `patil2016study` (DOI `10.18203/2394-6040.ijcmph20164287`) and `shinde2026insights` (DOI `10.7759/cureus.78768`). |
| `roy2017trauma` | Unverified | Removed from manuscript; replaced with verified Mumbai health studies. | Replaced with `mukhopadhyay2018stroke` (DOI `10.26727/njrcm.2018.7.2.148-152`) and `mcgm2021covidwarroom`. |
