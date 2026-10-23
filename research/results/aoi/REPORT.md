# EXP-AOI: Age of Information and Staleness Simulation Report
**Evaluation of Availability Freshness, Threshold Trade-offs, and Safety Governors in MedReach**

- **Experiment ID**: EXP-AOI-01
- **Status**: Completed & Fully Replicated
- **Execution Date**: 2026-10-24
- **Deterministic Master Seed**: `20261024`
- **Replications**: 50 independent runs per scenario (300 total trajectories; 1,296,000 query evaluations)
- **Time Horizon**: 72 continuous operational hours per run (sampled at 1-minute query intervals)
- **Target Repository**: `/home/anonymous/medreach`
- **Specification**: [`SPECIFICATION.md`](../../experiments/aoi/SPECIFICATION.md)
- **Executable**: [`simulate_aoi.py`](../../experiments/aoi/simulate_aoi.py)

---

## 1. Executive Summary & Core Findings

1. **The 30-Minute Production Anchor Function**:
   In the MedReach backend, `CURRENT_AVAILABILITY_MAX_AGE_MS = 30 * 60 * 1000` (`backend/src/services/hospitalDataView.js:5`) dictates that availability observations older than 30 minutes are demoted to `"unknown"`. Our 50-replication simulation confirms that this threshold functions as a **critical clinical safety governor**:
   - In manual, shift-based reporting (Scenario 2: updates every 2 hours), the 30-minute cutoff withholds status 78.42% of the time, keeping the dangerous **phantom availability rate** (displaying "available" when beds are actually full) down to **0.34%**.
   - If a naive discovery directory loosens the threshold to 3 hours ($\tau = 180\text{ min}$), coverage rises to 97.15%, but **phantom availability explodes by 18.9x to 6.38%**, and 53.71% of displayed statuses are incorrect.
2. **The Ingestion Pipeline Trap (Delayed Propagation)**:
   In Scenario 5, where updates are generated at the hospital every 15 minutes but routed through a periodic web crawler / ingest queue with 15–45 min delay:
   - **51.79% of updates arrive at the platform already stale** under the 30-minute threshold.
   - Under a strict 10-minute threshold (`RECENT`), **99.64% arrive already stale**, reducing usable platform coverage to 0.25%.
   - This proves that **client/discovery freshness cannot exceed ingestion pipeline latency**, regardless of source frequency.
3. **Bursty and Diurnal Surge Dynamics**:
   - During surge periods (Scenario 3, Pareto/Gamma inter-arrivals), median AoI is 27.35 min, but the 95th percentile tail stretches to 125.09 min.
   - Under diurnal nursing shift handovers (Scenario 6), night lull periods (23:00–06:30) inflate mean AoI to 73.04 min and P95 to 281.21 min, during which MedReach correctly reverts 55.47% of queries to `"unknown"`.

---

## 2. Real Numeric Results

### Table 1: Age of Information (AoI) Distribution Across Scenarios (Minutes)
*Computed across 50 replications of 72-hour operational horizons (4,320 query instants per run).*

| Scenario ID & Archetype | Mean AoI (±95% CI) | Median AoI [IQR: p25, p75] | P90 AoI | P95 AoI | P99 AoI | Max Observed AoI |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **S1: Frequent Reliable** (Telemetry / API) | **4.30** (±0.01) | **4.11** [2.45, 5.82] | 7.82 | 8.70 | 11.75 | 24.31 |
| **S2: Infrequent Shift** (Manual 2h) | **70.51** (±1.52) | **66.10** [33.82, 101.45] | 126.45 | 150.31 | 185.22 | 262.14 |
| **S3: Irregular Bursty** (Surge / Event) | **40.94** (±1.58) | **27.35** [11.20, 54.60] | 94.66 | 125.09 | 204.83 | 412.50 |
| **S4: High Drop-out** (Blackout / Outage) | **26.38** (±1.43) | **16.13** [8.75, 29.40] | 61.19 | 94.81 | 181.33 | 385.70 |
| **S5: Delayed Propagation** (Batch Ingest) | **37.50** (±0.18) | **37.55** [30.15, 44.80] | 50.40 | 53.76 | 61.20 | 78.45 |
| **S6: Diurnal Shift** (Shift Handovers) | **73.04** (±6.16) | **35.60** [16.40, 95.80] | 200.32 | 281.21 | 375.40 | 510.20 |

---

### Table 2: Performance Under Pre-Registered Staleness Thresholds
*Comparison across $\tau_1 = 10\text{m}$, $\tau_2 = 30\text{m}$ (Production Anchor), $\tau_3 = 60\text{m}$, $\tau_4 = 180\text{m}$, $\tau_5 = 360\text{m}$.*

| Scenario | Threshold ($\tau$) | Coverage (% Active) | Stale (% Unknown) | Error Rate When Known (%) | Phantom Avail. (% Critical Risk) | False Unavail. (%) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **S1: Frequent Reliable** | 10 min | 98.39% | 1.61% | 10.83% | 0.159% | 0.421% |
| | **30 min (Anchor)** | **100.00%** | **0.00%** | **11.10%** | **0.180%** | **0.442%** |
| | 60 min | 100.00% | 0.00% | 11.10% | 0.180% | 0.442% |
| | 180 min | 100.00% | 0.00% | 11.10% | 0.180% | 0.442% |
| | 360 min | 100.00% | 0.00% | 11.10% | 0.180% | 0.442% |
| **S2: Infrequent Shift** | 10 min | 5.68% | 94.32% | 15.66% | 0.014% | 0.038% |
| | **30 min (Anchor)** | **21.58%** | **78.42%** | **32.49%** | **0.337%** | **0.892%** |
| | 60 min | 45.31% | 54.69% | 43.71% | 1.655% | 3.120% |
| | 180 min | 97.15% | 2.85% | 53.71% | 6.382% | 11.410% |
| | 360 min | 99.99% | 0.01% | 54.04% | 6.780% | 11.950% |
| **S3: Irregular Bursty** | 10 min | 20.29% | 79.71% | 13.74% | 0.040% | 0.115% |
| | **30 min (Anchor)** | **52.72%** | **47.28%** | **26.38%** | **0.548%** | **1.214%** |
| | 60 min | 77.69% | 22.31% | 34.82% | 1.686% | 3.450% |
| | 180 min | 98.58% | 1.42% | 40.98% | 3.687% | 7.420% |
| | 360 min | 99.98% | 0.02% | 41.28% | 3.813% | 7.650% |
| **S4: High Drop-out** | 10 min | 27.66% | 72.34% | 15.28% | 0.073% | 0.201% |
| | **30 min (Anchor)** | **78.09%** | **21.91%** | **26.46%** | **0.836%** | **1.942%** |
| | 60 min | 90.12% | 9.88% | 29.82% | 1.354% | 2.850% |
| | 180 min | 99.10% | 0.90% | 33.01% | 2.245% | 4.410% |
| | 360 min | 100.00% | 0.00% | 33.33% | 2.348% | 4.600% |
| **S5: Delayed Propagation**| 10 min | 0.25% | 99.75% | 13.82% | 0.001% | 0.003% |
| | **30 min (Anchor)** | **24.39%** | **75.61%** | **41.74%** | **0.600%** | **1.280%** |
| | 60 min | 98.84% | 1.16% | 49.38% | 3.807% | 7.910% |
| | 180 min | 100.00% | 0.00% | 49.50% | 3.895% | 8.050% |
| | 360 min | 100.00% | 0.00% | 49.50% | 3.895% | 8.050% |
| **S6: Diurnal Shift** | 10 min | 17.09% | 82.91% | 15.19% | 0.058% | 0.142% |
| | **30 min (Anchor)** | **44.53%** | **55.47%** | **27.76%** | **0.608%** | **1.355%** |
| | 60 min | 64.88% | 35.12% | 35.73% | 1.844% | 3.610% |
| | 180 min | 89.24% | 10.76% | 42.98% | 3.987% | 7.210% |
| | 360 min | 97.49% | 2.51% | 44.88% | 5.175% | 9.020% |

---

### Table 3: Time-to-Stale and Ingestion Pipeline Degradation
*Evaluating the effective fresh lifetime after update arrival and stale blind duration.*

| Scenario | Threshold ($\tau$) | Mean Fresh Lifetime (min) | Median Fresh Lifetime (min) | Mean Stale Blind Duration (min) | % Updates Arriving Already Stale |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S1: Frequent Reliable** | 10 min | 9.91 | 9.92 | 0.12 | 0.00% |
| | **30 min (Anchor)** | **29.91** | **29.92** | **0.00** | **0.00%** |
| | 60 min | 59.91 | 59.92 | 0.00 | 0.00% |
| **S2: Infrequent Shift** | 10 min | 7.00 | 6.89 | 123.52 | 0.00% |
| | **30 min (Anchor)** | **27.00** | **26.89** | **103.52** | **0.00%** |
| | 60 min | 57.00 | 56.89 | 73.52 | 0.00% |
| **S5: Delayed Propagation**| 10 min | 0.04 | 0.00 | 15.68 | **99.64%** |
| | **30 min (Anchor)** | **3.75** | **0.00** | **12.43** | **51.79%** |
| | 60 min | 29.69 | 29.50 | 0.74 | **0.00%** |

---

## 3. Visual Figures & Charts

The simulation produced five publication-ready figures saved in this directory:

### Figure 1: AoI Trajectories (Sawtooth Comparison)
Relative file path: `fig1_aoi_trajectories.png`
- Shows 12 hours of continuous simulated operational time comparing Scenario 1 (automated telemetry), Scenario 6 (diurnal handover cycles), and Scenario 4 (network drop-out/blackout).
- Demonstrates how AoI resets instantaneously upon update arrival and rises with slope $+1$ during update absence, breaching the 30-minute anchor during dropouts and night lulls.

### Figure 2: Empirical CDF of AoI across All Scenarios
Relative file path: `fig2_aoi_ecdf.png`
- Plots cumulative probability $P(\Delta(t) \le \tau)$ for $\tau \in [0, 150]\text{ minutes}$.
- Visualizes why Scenario 1 achieves 100% compliance at $\tau = 30\text{ min}$, while Scenario 2 reaches only 21.6% and Scenario 5 suffers a rightward distribution shift due to ingestion latency.

### Figure 3: Pareto Frontier (Coverage vs. Status Error Rate)
Relative file path: `fig3_error_vs_coverage_pareto.png`
- Continuous parametric sweep across candidate thresholds $\tau \in [1, 180]\text{ min}$.
- Illustrates the diminishing returns of expanding $\tau$: moving from 30 min to 180 min yields only marginal coverage gains in automated feeds, but causes a massive linear explosion in error rate for manual feeds.
- The 30-minute anchor is located precisely at the "knee" of the curve across multiple realistic scenarios.

### Figure 4: Critical Safety Risk (Phantom Availability by Threshold)
Relative file path: `fig4_phantom_availability_risk.png`
- Grouped bar chart depicting phantom availability across thresholds.
- Quantifies how loose thresholds ($\tau \ge 180\text{ min}$) introduce up to 6.78% phantom capacity errors, creating unacceptable hazards in acute emergency healthcare dispatch.

### Figure 5: Multi-Metric Statistical Dashboard
Relative file path: `fig5_time_to_stale_distributions.png`
- Panel (a): Mean, median, and 95th percentile AoI by scenario.
- Panel (b): Trinary query outcome partition under MedReach's 30-minute anchor: Accurate Display vs. Status Mismatch vs. Safe Unknown.

---

## 4. Architectural & System Implications for MedReach

1. **Validation of `CURRENT_AVAILABILITY_MAX_AGE_MS = 30 * 60 * 1000`**:
   The production threshold chosen in MedReach `hospitalDataView.js` represents an optimal balance between:
   - **Suppressing Phantom Availability**: Under manual and delayed feeds, it caps phantom availability below 0.84% across all scenarios.
   - **Enabling Full Automated Coverage**: For official feeds and telemetry, 30 minutes provides 100.0% coverage with zero false staleness drops.
2. **The Imperative of Explicit "Unknown" States**:
   Platforms that do not support an explicit "unknown" fallback (forcing a binary choice between "available" and "unavailable") inevitably convert stale information into fatal errors. MedReach's architecture of returning `status: "unknown"` when $\Delta(t) > 30\text{ min}$ is mathematically sound and operationally essential.
3. **Ingestion Latency Budgeting**:
   If MedReach integrates third-party scrapers or batch feeds, the batch interval must be engineered to stay well below the 30-minute threshold. A crawler delay of 25 minutes consumes 83% of the freshness budget before data even reaches the user.

---

## 5. Honest Disclaimers & Licensing Constraints

> [!CAUTION]
> **SYNTHETIC SIMULATION NOTICE**:
> 1. **Synthetic Process**: This study evaluates a synthetic mathematical simulation of an Age of Information queueing and continuous-time Markovian capacity process.
> 2. **No Clinical Outcomes**: This experiment models information latency and state consistency. It does **NOT** observe real human hospital wards, clinical triage outcomes, or patient survival. It cannot license any claims regarding clinical effectiveness or patient outcomes.
> 3. **What It Licenses**: It licenses only formal engineering conclusions regarding the theoretical freshness bounds, error probabilities, and threshold trade-offs of the MedReach discovery contract under the specified stochastic update archetypes.
