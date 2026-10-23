# EXP-AOI: Age of Information and Staleness Simulation
**Reproducibility Guide & Experiment Ledger**

## 1. Experiment Metadata
- **Experiment ID**: EXP-AOI-01
- **Domain**: Age of Information (AoI), Information Freshness, Queueing & Stochastic State Consistency
- **Target Repository**: `/home/anonymous/medreach`
- **Specification Document**: [`SPECIFICATION.md`](./SPECIFICATION.md)
- **Simulation Script**: [`simulate_aoi.py`](./simulate_aoi.py)
- **Results Directory**: `../../results/aoi/`
  - Raw JSON: `../../results/aoi/raw_metrics.json`
  - Scenario Summary CSV: `../../results/aoi/scenario_summary.csv`
  - Time-to-Stale CSV: `../../results/aoi/time_to_stale.csv`
  - Trajectory Sample CSV: `../../results/aoi/timeseries_sample.csv`
  - Detailed Report: `../../results/aoi/REPORT.md`
  - Figures:
    - `../../results/aoi/fig1_aoi_trajectories.png`
    - `../../results/aoi/fig2_aoi_ecdf.png`
    - `../../results/aoi/fig3_error_vs_coverage_pareto.png`
    - `../../results/aoi/fig4_phantom_availability_risk.png`
    - `../../results/aoi/fig5_time_to_stale_distributions.png`

---

## 2. Environment & Verified Toolchain
- **OS**: Linux 6.6.137+
- **Python**: 3.11.8 (`numpy` 2.4.6, `matplotlib` 3.11.2)
- **Execution Mode**: Standalone Python deterministic simulation (no external network or database access required).
- **Master Random Seed**: `20261024`

---

## 3. Step-by-Step Reproduction Instructions

From the root of the MedReach repository:

```bash
cd /home/anonymous/medreach

# 1. Verify python environment
python3 -c "import numpy, matplotlib; print('numpy:', numpy.__version__, 'matplotlib:', matplotlib.__version__)"

# 2. Run the deterministic simulation (50 replications x 6 scenarios)
python3 research/experiments/aoi/simulate_aoi.py

# 3. Verify outputs were generated
ls -la research/results/aoi/
```

Expected execution time: ~8–12 seconds on standard CPU.

---

## 4. Key Experimental Parameters

- **Time Horizon ($T$)**: 72 hours (4,320 operational minutes) per replication.
- **Query Evaluation Frequency**: Sampled at 1-minute discrete query intervals ($N = 4,320$ query points per run).
- **Replications ($R$)**: 50 independent stochastic runs per scenario. Total trajectories: $6 \times 50 = 300$; total queries evaluated: $1,296,000$.
- **Ground Truth Capacity Jump Process**: 3-state CTMC (`available`, `limited`, `unavailable`) with mean dwell times $\mathbb{E}[D_{avail}] = 45\text{ min}$, $\mathbb{E}[D_{limited}] = 25\text{ min}$, $\mathbb{E}[D_{unavail}] = 40\text{ min}$.
- **Pre-Registered Candidate Thresholds**:
  - $\tau_1 = 10\text{ min}$ (`RECENT`)
  - $\tau_2 = 30\text{ min}$ (MedReach Production Anchor: `CURRENT_AVAILABILITY_MAX_AGE_MS`)
  - $\tau_3 = 60\text{ min}$ (`UPDATED_RECENTLY`)
  - $\tau_4 = 180\text{ min}$ (3-Hour Loose Directory)
  - $\tau_5 = 360\text{ min}$ (`STALE` Upper Bound)

---

## 5. Limitations & Disclaimers

> [!IMPORTANT]
> **SYNTHETIC SIMULATION LIMITATIONS**:
> - All provider arrivals and capacity transitions are generated via synthetic stochastic models parameterized by typical healthcare queueing literature.
> - No actual human clinical records, private patient data, or live hospital operations were accessed or simulated.
> - This study cannot establish clinical outcomes, triage efficacy, or patient mortality. It evaluates information consistency and latency bounds under MedReach data contracts.
