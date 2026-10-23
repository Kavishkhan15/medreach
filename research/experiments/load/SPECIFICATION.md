# EXP-LOAD: Load, Stress, Spike, Soak, and Recovery Benchmarking Specification
**Pre-Registered Research Protocol & Benchmarking Methodology**
**Date**: 2026-10-24
**Experiment ID**: EXP-LOAD-01
**Specialist**: Load and Reliability Testing Specialist (Antigravity)
**Target Repository**: `/home/anonymous/medreach`
**Target Backend**: Local Express backend (`http://127.0.0.1:4200`)
**Target Database**: Local isolated MongoDB instance (`mongodb://127.0.0.1:27018/medreach_load_test`)
**Code Location**: `/home/anonymous/medreach/research/experiments/load/`
**Results Location**: `/home/anonymous/medreach/research/results/load/`

---

## 1. Research Question & Objectives

In emergency healthcare routing and availability coordination platforms, traffic varies between steady-state lookup rates and severe surges (mass casualty incidents, localized epidemic outbreaks, disaster alerts). Failure or unbounded latency degradation during high load compromises emergency admissions and ambulance routing.

This empirical investigation addresses:
1. **Steady-State Baseline**: What is the minimum latency profile and maximum unconstrained throughput of the MedReach Node.js/Express API under zero queuing and minimal concurrency ($C=1$)?
2. **Workload Scaling**: How does throughput and response latency scale across realistic multi-user concurrent loads ($C \in \{5, 10, 25, 50\}$)?
3. **Saturation & Degradation Thresholds**: At what concurrency level and request rate does the Node.js event loop and database connection pool reach saturation? Where does the latency knee curve occur?
4. **Resilience to Traffic Spikes**: Can the server absorb a 50x sudden traffic spike ($C=5 \to C=250$) without connection resets or unhandled exceptions?
5. **Sustained Soak Stability**: Over a continuous high-workload period, does the system demonstrate memory leakage, socket leakage, or gradual latency drift?
6. **Post-Load Recovery**: Does the server instantly return to baseline latency and 0% error rate once high stress ceases, or does lingering queue congestion degrade subsequent requests?

---

## 2. Absolute Safety & Isolation Guarantees

In accordance with `_common2.md` and `brief-load.md`:
1. **Zero External Traffic**: Under no circumstances is any traffic directed at public Vercel sites (`*.vercel.app`) or the Railway production API. All requests target `http://127.0.0.1:4200`.
2. **Database Isolation**: The owner's live database on `127.0.0.1:27017` (`/home/anonymous/medreach/data`) is strictly isolated and NEVER contacted. All test data resides in `mongodb://127.0.0.1:27018/medreach_load_test`.
3. **Pre-Scenario Verification**: The test harness verifies `mongosh --port 27018` connectivity and asserts that port `27017` is NOT the target before EVERY individual scenario.
4. **Side-Effect Elimination**:
   - `EMAIL_ENABLED=false`: Zero external email or SMTP calls.
   - `AI_PROVIDER=rule_based`: Zero external LLM or paid API calls.
   - `ROUTING_PROVIDER=none`: Zero external map or geocoding calls.
   - Read-only queries (`GET /health` and `GET /api/hospitals`) avoid mutating shared state.

---

## 3. Tooling Justification & Version Pinning

### Tool Selected: `autocannon v8.0.0`
- **Version**: `autocannon@8.0.0` (Node.js runtime v24.22.1).
- **Justification**:
  1. **Runtime Alignment**: Built on `undici`, the native high-performance HTTP client powering modern Node.js, ensuring consistent TCP connection reuse and HTTP/1.1 pipelining semantics.
  2. **Coordinated Omission Compensation**: Integrates `hdr-histogram-js` with automatic correction for coordinated omission (where delayed responses artificially suppress the sampling of queued requests).
  3. **High Resolution**: Provides microsecond-level latency distributions ($p_{50}, p_{90}, p_{95}, p_{97.5}, p_{99}, p_{99.9}$) and structured JSON output for automated ingestion.
  4. **Lightweight & Containerless**: Avoids Docker daemon overhead and network bridge latency jitter, executing directly against loopback (`127.0.0.1`).

---

## 4. Hardware Machine Specification

All benchmarks are executed locally on the physical host machine:
- **Processor**: AMD Ryzen 7 3700X 8-Core Processor (16 logical vCPUs)
- **Memory**: 15 GiB Total RAM (~7.3 GiB free/available)
- **Operating System**: Linux Ubuntu 24.04 LTS (x86_64, kernel 6.8.0)
- **Node.js**: v24.22.1
- **MongoDB**: v8.0.34
*Note: Results characterize the throughput and latency limits of this single host system under local loopback networking, establishing relative scaling properties and architectural bottlenecks rather than production multi-region cloud capacity.*

---

## 5. Experimental Scenarios & Pre-Registered Parameters

| Scenario ID | Name | Concurrency ($C$) | Duration / Ramp | Target Endpoint | Stop Conditions (Fail-Safe) |
|---|---|---|---|---|---|
| **SCN-01** | Baseline Reference | $C=1$ | 10s (3 runs) | `/health` & `/api/hospitals` | Error rate $> 0\%$ or $p_{95} > 500\text{ ms}$ |
| **SCN-02** | Workload Ramp | $C \in \{5, 10, 25, 50\}$ | 10s per step (3 runs) | `/health` & `/api/hospitals` | Error rate $> 5\%$ or $p_{95} > 2,000\text{ ms}$ |
| **SCN-03** | Controlled Stress | $C \in \{100, 200, 400\}$ | 10s per step | `/health` & `/api/hospitals` | Error rate $> 20\%$ or $p_{95} > 5,000\text{ ms}$ |
| **SCN-04** | Traffic Spike | $C=5 \to C=250 \to C=5$ | 5s / 10s / 5s | `/api/hospitals` | Timeouts $> 50\%$ or connection resets |
| **SCN-05** | Sustained Soak | $C=30$ | 60s sustained | `/api/hospitals` | Memory RSS increase $> 500\text{ MB}$ or $p_{95} > 3\times$ baseline |
| **SCN-06** | Post-Load Recovery | $C=1$ | 10s (post-soak) | `/health` & `/api/hospitals` | Median latency $> 1.5\times$ baseline or errors $> 0\%$ |

---

## 6. Mathematical Metrics & Percentile Validity

Let $N$ denote the total completed HTTP requests during scenario run $r$.
- **Throughput ($X$)**:
  $$X = \frac{N}{T} \quad (\text{requests/second})$$
- **Latency Percentile Validity**:
  A percentile $p$ requires a minimum sample count $N \ge \frac{10}{1 - p/100}$ to avoid rank-order quantization error:
  - For $p_{50}$: requires $N \ge 20$
  - For $p_{90}$: requires $N \ge 100$
  - For $p_{95}$: requires $N \ge 200$
  - For $p_{99}$: requires $N \ge 1,000$
  *All scenario runs are pre-configured to generate $N \gg 2,000$ samples, guaranteeing statistical validity for $p_{99}$.*
- **Variability Across Repeats**:
  For 3 repeated executions under identical conditions:
  $$\text{Mean} = \bar{X} = \frac{1}{3}\sum_{i=1}^3 X_i, \quad \sigma = \sqrt{\frac{1}{2}\sum_{i=1}^3 (X_i - \bar{X})^2}, \quad \text{CV\%} = \frac{\sigma}{\bar{X}} \times 100$$
