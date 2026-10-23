# Freshness-Aware, Provenance-Tracked Healthcare Resource Discovery in Fragmented Urban Ecosystems: System Design, Staleness Dynamics, and Transactional Evaluation

**Authors**: MedReach Research Collaboration  
**Affiliation**: Department of Health Informatics and Systems Engineering  
**Target Venue**: IEEE Transactions on Services Computing / IEEE Access  
**Artifact Repository**: `/home/anonymous/medreach`  
**Evaluation Date**: October 2026  

---

## Abstract

Locating emergency healthcare resources—such as intensive care unit (ICU) beds, specialized operating theatres, and compatible blood components—in dense, fragmented metropolitan centers like Mumbai represents a critical coordination challenge. Traditional civilian search relies on phone inquiries, unverified static directories, or physical transit between casualty wards, consuming the clinical "golden hour" and exacerbating emergency department crowding. While digital health platforms have emerged, existing regional platforms operate almost exclusively as unverified static directories or asynchronous self-reported bulletins, lacking freshness tracking, provenance fusion, and two-way confirmation.

This paper presents an architectural design and comprehensive empirical evaluation of **MedReach**, an open-source, freshness-aware, and provenance-tracked emergency resource discovery platform designed for urban healthcare coordination. MedReach establishes a decoupled, multi-tiered data model that enforces explicit Age of Information (AoI) boundaries, multi-source provenance fusion with priority cascades, and idempotent state-machine workflows for two-way clinical requests. 

Through extensive empirical evaluation across four experimental suites, we report:
1. **Age of Information (AoI) Dynamics**: In an extensive synthetic simulation suite across 6 operational archetypes (300 trajectories, 1,296,000 query evaluations), MedReach's pre-registered 30-minute availability cutoff (`CURRENT_AVAILABILITY_MAX_AGE_MS = 30 * 60 * 1000`) functions as a critical clinical safety governor. Under manual 2-hour shift reporting, the 30-minute threshold withholds status 78.42% of the time, keeping dangerous "phantom availability" (displaying beds as available when physically full) down to 0.337%. Loosening the cutoff to 180 minutes expands coverage to 97.15% but causes phantom availability to explode by 18.9x to 6.382% with an overall status error rate of 53.71%. Furthermore, we demonstrate the "ingestion delay trap": when data is collected via batch crawlers with 15–45 min queue latency, 51.79% of updates arrive already stale at 30 minutes, and 99.64% arrive stale at 10 minutes, proving that discovery freshness is strictly bounded by ingestion latency.
2. **Provenance & Conflicting-Claim Fusion**: Evaluating the production fusion engine against 40,000+ synthetic trials with known ground truth reveals a 100.0% conflict detection rate and a conservative 87.1% fallback rate to "unknown" under unverified divergent scrapers. When resolving claims, the engine achieves 90.29% conditional accuracy. However, formal calibration analysis reveals an essential negative finding: MedReach's confidence metric is an uncalibrated heuristic ordinal ranking (Brier score 0.1315, Expected Calibration Error 0.1255, Maximum Calibration Error 0.7333), rather than a calibrated Bayesian probability.
3. **Data Path & Edge Caching Audit**: An architectural audit of 22 deployed endpoints resolves an earlier theoretical concern: edge-cached prerendered HTML shells served with multi-hour retention contain zero volatile capacity data (structural DOM shells only), with all live availability fetched dynamically at runtime via client-side React hooks, entirely avoiding the static-page staling hazard.
4. **Transactional Correctness & Concurrency**: In an isolated suite of 48 test assertions evaluating concurrency and idempotency, the platform achieved a 100.0% pass rate. SHA-256 scoped idempotency keys reliably reject cross-user collisions with `409 IDEMPOTENCY_KEY_REUSED`, optimistic concurrency control isolates competing mutations under 10-way concurrency, and availability telemetry is strictly decoupled from request fulfillment.

We provide a comprehensive, two-column architectural analysis detailing demonstrable system guarantees versus components still requiring implementation (distributed multi-document transactions and time-to-live bed-reservation locks), establishing an evidence-based foundation for resilient urban health infrastructure.

---

## Index Terms

Age of Information (AoI), Data Freshness, Emergency Healthcare Informatics, Idempotency, Multi-Source Data Fusion, Provenance Tracking, Resource Discovery, Transactional Reliability.

---

## I. Introduction

In dense urban agglomerations in low- and middle-income countries (LMICs), acute emergency healthcare access remains severely constrained by information friction \cite{metuge2026digital,dalton2019patient}. When a patient suffers severe polytrauma, acute respiratory failure, or obstetric hemorrhage in Mumbai—a metropolitan area exceeding 13 million residents—locating an operational intensive care unit (ICU) bed, a mechanical ventilator, or an appropriate blood component unit is a high-stakes coordination problem \cite{darapaneni2021predicting,naydenova2017healthcare}. 

The urban healthcare landscape in Mumbai is exceptionally pluralistic and fragmented: it comprises municipal medical colleges (e.g., KEM, Sion, Nair, Cooper) managed by the Municipal Corporation of Greater Mumbai (MCGM), state government hospitals (e.g., Sir J.J. Group), charitable trust institutions (e.g., Lilavati, Bombay Hospital, Hinduja), and hundreds of private corporate centers and nursing homes \cite{shinde2026insights,mcgm2021covidwarroom}. In the absence of a unified, real-time dispatch and bed-tracking system, citizens, private ambulance operators, and primary clinic physicians traditionally engage in exploratory manual searching—placing repeated telephone calls to casualty departments or physically transporting patients between emergency rooms \cite{patil2016study,mukhopadhyay2018stroke}. This exploratory process frequently consumes the clinical "golden hour", induces catastrophic secondary inter-facility transfers, and increases risks for time-critical conditions \cite{naydenova2017healthcare,darapaneni2021predicting}.

Although public web portals exist—including the Brihanmumbai Municipal Corporation (BMC) health dashboard and the national e-RaktKosh blood transfusion registry—empirical investigation demonstrates that they operate primarily as static directory listings or asynchronous, unverified inventory bulletins \cite{metuge2026digital}. They lack automated freshness tracking, provide zero information regarding verification provenance, and offer no mechanism for two-way clinical confirmation or reservation holds. Consequently, healthcare searchers frequently encounter "phantom availability": digital platforms advertise available beds or blood units that were exhausted hours earlier, leading to tragic misdirection.

To address this challenge, the **MedReach** platform was developed as an open-source, freshness-aware, and provenance-tracked discovery and two-way coordination system. MedReach introduces three core architectural mechanisms:
1. **Freshness-Aware Availability Tracking**: A deterministic evaluation engine that tracks the exact Age of Information (AoI) of resource telemetry and automatically demotes stale observations to `"unknown"` beyond a strict 30-minute threshold (`CURRENT_AVAILABILITY_MAX_AGE_MS = 30 * 60 * 1000`), refusing to present unverified point-in-time capacity as guaranteed care.
2. **Provenance-Aware Conflicting-Claim Fusion**: A deterministic priority cascade that tracks source reliability, verification status, and timestamps, detecting divergent claims across official APIs, hospital web scrapers, and manual audits, and deferring unresolved institutional disputes to safe ignorance rather than algorithmic guesswork.
3. **Idempotent, Two-Way Request Orchestration**: A state-machine transaction model that decouples observational capacity telemetry from request fulfillment, protecting emergency requests against network retries, duplicate submissions, and race conditions via SHA-256 scoped idempotency keys and optimistic concurrency control (OCC).

### Contributions
This paper provides an end-to-end systems and empirical evaluation of MedReach, making the following contributions:
- **Formal Age of Information (AoI) Characterization**: We formulate the information-ageing process in healthcare discovery and evaluate it across 6 realistic operational archetypes (frequent telemetry, shift reporting, surge bursts, network blackouts, crawler ingest delays, and diurnal cycles) over 300 stochastic trajectories and 1,296,000 query evaluations. We prove that MedReach's 30-minute anchor prevents an 18.9x surge in phantom availability errors.
- **Empirical Evaluation of Multi-Source Provenance Fusion**: We execute the production claim fusion engine against a synthetic benchmark of 40,000+ trials, establishing a 100.0% conflict detection rate and 90.29% resolution accuracy, while identifying an uncalibrated heuristic property in the platform's confidence scoring engine.
- **Empirical Resolution of the Edge-Caching Hazard**: We resolve an earlier architectural question through a live audit of 22 deployed endpoints, demonstrating that edge caching of prerendered HTML shells does not induce availability staling because all volatile metrics are fetched strictly via runtime client hooks.
- **Rigorous Transactional Validation & Two-Column Boundary Analysis**: We evaluate 48 test assertions across 8 transactional sub-domains with a 100.0% pass rate, providing a rigorous comparative analysis detailing demonstrable system guarantees versus components still requiring implementation (e.g., distributed multi-document sagas and active TTL-based reservation holds).

---

## II. Background and Related Work

### A. Emergency Healthcare Navigation in Urban LMICs
Emergency healthcare delivery in urban India and comparable LMIC environments is characterized by high patient volumes, severe resource constraints, and multi-tier public-private fragmentation \cite{naydenova2017healthcare,patil2016study}. Empirical studies in Mumbai emphasize that pre-hospital delay, informal search patterns, and fragmented facility directories directly hinder timely care delivery \cite{mukhopadhyay2018stroke,darapaneni2021predicting}. Digital patient navigation systems have shown promise in reducing referral delays and improving coordination \cite{metuge2026digital,sugira2026design,dalton2019patient}, but their efficacy hinges entirely on data reliability and timely synchronization \cite{chen2024patient}.

### B. Age of Information (AoI) and Data Staleness
Introduced by Kaul, Yates, and Gruteser \cite{kaul2012realtime}, the Age of Information (AoI) metric quantifies the freshness of knowledge about a remote physical process from the perspective of an end observer. In contrast to network latency or packet throughput, AoI evaluates the elapsed time since the most recently delivered update was generated at the physical source:
$$\Delta(t) = t - U(t)$$
AoI theory has been widely studied in cyber-physical systems, vehicular telemetry, and Internet of Things (IoT) sensor networks \cite{zou2019relative,hu2020optimal}. In healthcare informatics, however, availability systems have historically treated data as binary: records are either present in a database or absent. Applying AoI to urban healthcare capacity exposes the hazard of asynchronous updates: capacity changes dynamically while static directory caches remain stagnant, inducing dangerous mismatches between physical and reported states \cite{liu2024data,abedin2021data}.

### C. Provenance, Information Fusion, and Conflict Resolution
Provenance models define structured mechanisms for tracking the lineage, entities, and activities responsible for data generation \cite{peng2026when}. In healthcare web aggregation, discovery platforms inevitably collect conflicting assertions: an official municipal directory may claim an ICU is operational, a scraped hospital web page may indicate temporary suspension, and a citizen report may allege overcrowding. Resolving conflicting claims requires structured evidence fusion \cite{feng2023examining,vermeulen2023trust}. While continuous Bayesian belief updating is common in sensor networks, clinical discovery systems typically demand conservative, auditable decision cascades that prioritize institutional verification and transparent dispute flagging \cite{vermeulen2023trust}.

### D. The Mumbai Healthcare Digital Landscape: Empirical Taxonomy
To ground this research in operational reality, we conducted an empirical survey of existing healthcare discovery platforms serving the Mumbai Metropolitan Region (MMR). Following the five-tier taxonomy defined in the MedReach research dossier:
- **Tier 1 (Directory Listing)**: Static facility registry (name, address, telephone).
- **Tier 2 (Service Offered)**: Static catalog of specialties and departments (e.g., "ICU", "Blood Bank").
- **Tier 3 (Resource Reported Available)**: Asynchronous, unverified numerical capacity reports (e.g., "4 beds vacant").
- **Tier 4 (Resource Confirmed Currently Available)**: Synchronous, two-way verified reservation hold.
- **Tier 5 (Completed Request)**: Full lifecycle orchestration from dispatch to ward intake.

Empirical HTTP and static bundle analysis of public portals (including the BMC Health Dashboard, national e-RaktKosh, and Maharashtra State Blood Transfusion Council / MahaSBTC) reveals that **zero existing regional platforms operate at Tier 4 or Tier 5**. Platforms operate strictly at Tiers 1–3, leaving patients vulnerable to stale numbers and providing no mechanism to hold a critical bed while an ambulance is en route.

---

## III. System Under Study: MedReach Architecture

MedReach is structured as a decoupled, multi-variant service ecosystem designed for low-bandwidth web access and resilient backend operations.

```
+---------------------------------------------------------------------------------------+
|                                CLIENT DISCOVERY LAYER                                 |
|  - Three Frontend Variants: Bootstrap (Vanilla JS), Tailwind (CSS-in-JS), Skeleton     |
|  - Universal "use client" Hooks: Client-side runtime data fetching (useEffect)        |
|  - Zero In-Memory Client Caching: Simultaneous in-flight read deduplication only      |
+---------------------------------------------------------------------------------------+
                                           |
                                           | HTTP/1.1 (JSON API)
                                           v
+---------------------------------------------------------------------------------------+
|                                  MEDREACH CORE API                                    |
|  - Availability Engine: Deterministic AoI evaluation (hospitalDataView.js)            |
|  - Staleness Governor: CURRENT_AVAILABILITY_MAX_AGE_MS = 30 * 60 * 1000 (30 min)      |
|  - Provenance Fusion: Deterministic priority cascade (facilityClaimFusion.js)         |
|  - Transactional Core: Optimistic Concurrency Control (OCC) + Idempotency Guard       |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                               PERSISTENCE & OBSERVATIONS                              |
|  - MongoDB 8.0: Dual-collection separation                                            |
|    * Append-Only Observational Store: AvailabilityObservation                         |
|    * Transactional Workflow Store: EmergencyRequest, BloodRequest, AmbulanceBooking  |
+---------------------------------------------------------------------------------------+
```

### A. Freshness Evaluation Engine and Staleness Governor
In MedReach, facility capability (static clinical offerings) and current availability (volatile capacity) are strictly segregated. In `backend/src/services/hospitalDataView.js`, the platform evaluates current availability using a deterministic 30-minute anchor:
```javascript
export const CURRENT_AVAILABILITY_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

const current = observation?.verificationStatus === "verified"
  && CURRENT_STATUSES.has(observation.status)
  && now.getTime() - entry.at <= CURRENT_AVAILABILITY_MAX_AGE_MS;

return {
  facility: name,
  capability: facility?.capability || "unknown",
  status: current ? observation.status : "unknown",
  count: current && Number.isInteger(observation.quantity) ? observation.quantity : null,
  observedAt: current ? new Date(entry.at).toISOString() : null,
  lastObservedAt: entry ? new Date(entry.at).toISOString() : null,
};
```
If an observation exceeds 30 minutes, `status` reverts to `"unknown"` and `count` is masked to `null`. The timestamp remains visible strictly as `lastObservedAt` for auditability.

### B. Provenance Tracking and Priority Cascade
The fusion engine (`facilityClaimFusion.js` and `hospitalFieldFusion.js`) ingests claims from diverse sources, assigning baseline reliability weights from `backend/src/config/constants.js`:
- `official_api`: 1.0
- `government_directory`: 0.85
- `authorized_feed`: 0.80
- `manual_verification`: 0.75
- `hospital_site`: 0.60
- `other`: 0.30

Rather than computing unweighted averages or black-box heuristic scores, MedReach enforces a transparent lexicographical cascade:
1. **Verification Partitioning**: If any claim possesses `verificationStatus === "verified"`, unverified claims are excluded from the resolution candidate pool.
2. **Disagreement Detection**: If multiple distinct values exist across usable claims, `conflict: true` is asserted.
3. **Consensus Requirement**: If the verified candidate pool contains disagreement, resolution aborts, returning `{ capability: "unknown", conflict: true, selectedClaim: null }`.
4. **Lexicographical Selection**: In consensus pools, claims are sorted by confidence level (`HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0`), breaking ties by recency (`observedAt`).

### C. Transactional Request Engine
For two-way requests (`EmergencyRequest`, `BloodRequest`, `AmbulanceBooking`), MedReach enforces:
- **SHA-256 Scoped Idempotency**: Headers formatted as `Idempotency-Key` are hashed with user identity and resource scope (`sha256(scope:key)`). A unique sparse index on `idempotencyKeyHash` ensures that client retries return the original document (`200 OK`), while unauthorized key reuse triggers `409 IDEMPOTENCY_KEY_REUSED`.
- **Optimistic Concurrency Control (OCC)**: State transitions utilize atomic MongoDB operations (`findOneAndUpdate`) asserting that `status` matches the expected previous state and that the `timeline` array has not been concurrently appended:
  ```javascript
  { _id: id, status: expectedStatus, [`timeline.${expectedTimelineLength}`]: { $exists: false } }
  ```
- **Architectural Telemetry Separation**: Submitting, accepting, or completing an emergency request does not deduct from the append-only `AvailabilityObservation` collection, explicitly preventing point-in-time capacity bulletins from being misrepresented as guaranteed reservations.

---

## IV. Research Questions & Methodology

We formulated four empirical research questions to evaluate MedReach's architecture:

- **RQ1 (Age of Information & Staleness)**: How does the age of availability information evolve across diverse provider update behaviors, and what are the operational trade-offs of MedReach's 30-minute staleness threshold compared to alternative candidate bounds?
- **RQ2 (Provenance Fusion & Conflict Resolution)**: How accurately does MedReach's discrete priority cascade resolve conflicting multi-source claims, how safely does it handle unverified disputes, and how well-calibrated are its confidence metrics?
- **RQ3 (Data Path & Edge Caching Staleness)**: Does edge caching of prerendered HTML shells served with multi-hour retention headers present stale healthcare availability to clients?
- **RQ4 (Transactional Concurrency & Guarantees)**: How robust is MedReach's request lifecycle against network timeouts, concurrent competing updates, and duplicate submissions, and what are the exact boundaries between guaranteed and un-implemented transactional behaviors?

### Experimental Environment
All experiments were executed on an isolated Linux environment (Ubuntu 24.04, Node.js v24.22.1, Python 3.11.8 with NumPy 2.4.6 and Matplotlib 3.11.2, MongoDB 8.0.34). In strict compliance with safety rules, all tests ran on isolated disposable instances (port 27018 / port 4200), strictly leaving production databases and public hosted deployments untouched.

---

## V. Experimental Results

### A. RQ1: Age of Information Dynamics and Staleness Governance (EXP-AOI)
To evaluate RQ1, we executed a deterministic, seeded Monte Carlo simulation across 6 operational scenarios, modeling 72 continuous hours of operational time per run with 1-minute discrete query evaluations (4,320 queries per trajectory). Across $R = 50$ replications per scenario, the suite evaluated **300 trajectories and 1,296,000 query evaluations**.

Ground truth physical facility capacity was simulated as a 3-state continuous-time Markov chain (`available`, `limited`, `unavailable`) with mean dwell times $\mathbb{E}[D_{\text{avail}}] = 45\text{ min}$, $\mathbb{E}[D_{\text{limited}}] = 25\text{ min}$, and $\mathbb{E}[D_{\text{unavail}}] = 40\text{ min}$. Pre-registered candidate thresholds included $\tau_1 = 10\text{m}$, $\tau_2 = 30\text{m}$ (production anchor), $\tau_3 = 60\text{m}$, $\tau_4 = 180\text{m}$, and $\tau_5 = 360\text{m}$.

```
+-------------------------------------------------------------------------------------------------------------------------+
| TABLE I: Empirical Age of Information (AoI) Distribution Across Operational Scenarios (Values in Minutes)               |
+--------------------------+--------------------+--------------+----------+----------+----------+----------+--------------+
| Scenario Archetype       | Mean AoI (±95% CI) | Median AoI   | P25 AoI  | P75 AoI  | P90 AoI  | P95 AoI  | Max AoI      |
+--------------------------+--------------------+--------------+----------+----------+----------+----------+--------------+
| S1: Frequent Reliable    |   4.30 (±0.01)     |   4.11       |   2.45   |   5.82   |   7.82   |   8.70   |  24.31       |
| S2: Infrequent Shift     |  70.51 (±1.52)     |  66.10       |  33.82   | 101.45   | 126.45   | 150.31   | 262.14       |
| S3: Irregular Bursty     |  40.94 (±1.58)     |  27.35       |  11.20   |  54.60   |  94.66   | 125.09   | 412.50       |
| S4: High Drop-out        |  26.38 (±1.43)     |  16.13       |   8.75   |  29.40   |  61.19   |  94.81   | 385.70       |
| S5: Delayed Propagation  |  37.50 (±0.18)     |  37.55       |  30.15   |  44.80   |  50.40   |  53.76   |  78.45       |
| S6: Diurnal Shift Cycle  |  73.04 (±6.16)     |  35.60       |  16.40   |  95.80   | 200.32   | 281.21   | 510.20       |
+--------------------------+--------------------+--------------+----------+----------+----------+----------+--------------+
```

```
+-------------------------------------------------------------------------------------------------------------------------+
| TABLE II: Threshold Comparison: Active Coverage vs. Critical Phantom Availability Risk                                  |
+--------------------------+--------------------+--------------+--------------+--------------------+----------------------+
| Scenario Archetype       | Threshold ($\tau$) | Coverage (%) | Stale (%)    | Error Rate Known % | Phantom Avail. (%)   |
+--------------------------+--------------------+--------------+--------------+--------------------+----------------------+
| S1: Frequent Reliable    | 10 min             |  98.39%      |   1.61%      |      10.83%        |       0.159%         |
|                          | 30 min (Anchor)    | 100.00%      |   0.00%      |      11.10%        |       0.180%         |
|                          | 60 min             | 100.00%      |   0.00%      |      11.10%        |       0.180%         |
| S2: Infrequent Shift     | 10 min             |   5.68%      |  94.32%      |      15.66%        |       0.014%         |
|                          | 30 min (Anchor)    |  21.58%      |  78.42%      |      32.49%        |       0.337%         |
|                          | 60 min             |  45.31%      |  54.69%      |      43.71%        |       1.655%         |
|                          | 180 min (Loose)    |  97.15%      |   2.85%      |      53.71%        |       6.382% (18.9x) |
| S3: Irregular Bursty     | 30 min (Anchor)    |  52.72%      |  47.28%      |      26.38%        |       0.548%         |
|                          | 180 min            |  98.58%      |   1.42%      |      40.98%        |       3.687%         |
| S4: High Drop-out        | 30 min (Anchor)    |  78.09%      |  21.91%      |      26.46%        |       0.836%         |
|                          | 180 min            |  99.10%      |   0.90%      |      33.01%        |       2.245%         |
| S5: Delayed Propagation  | 10 min             |   0.25%      |  99.75%      |      13.82%        |       0.001%         |
|                          | 30 min (Anchor)    |  24.39%      |  75.61%      |      41.74%        |       0.600%         |
|                          | 60 min             |  98.84%      |   1.16%      |      49.38%        |       3.807%         |
| S6: Diurnal Shift Cycle  | 30 min (Anchor)    |  44.53%      |  55.47%      |      27.76%        |       0.608%         |
|                          | 180 min            |  89.24%      |  10.76%      |      42.98%        |       3.987%         |
+--------------------------+--------------------+--------------+--------------+--------------------+----------------------+
```

As detailed in Table II, the 30-minute anchor enforces safety across all operational regimes:
- Under infrequent shift updates (S2), the 30-minute cutoff withholds status 78.42% of the time, restricting phantom availability to 0.337%. Loosening $\tau$ to 180 minutes raises coverage to 97.15%, but **phantom availability increases by 18.9x to 6.382%**, meaning 1 in every 16 searches misdirects a critically ill patient to a saturated hospital.
- In Scenario 5 (batch crawler delay of 15–45 min), Table III reveals that **51.79% of updates arrive at the platform already stale** under the 30-minute threshold, and **99.64% arrive already stale** under the 10-minute threshold (`mean fresh lifetime = 0.04 min`). Discovery freshness cannot exceed ingestion pipeline latency.

```
+-------------------------------------------------------------------------------------------------------------------------+
| TABLE III: Time-to-Stale and Ingestion Pipeline Freshness Loss                                                          |
+--------------------------+--------------------+-----------------------+-----------------------+-------------------------+
| Scenario Archetype       | Threshold ($\tau$) | Mean Fresh Life (min) | Blind Outage Duration | % Arriving Stale        |
+--------------------------+--------------------+-----------------------+-----------------------+-------------------------+
| S1: Frequent Reliable    | 10 min             |         9.91 min      |        0.12 min       |          0.00%          |
|                          | 30 min (Anchor)    |        29.91 min      |        0.00 min       |          0.00%          |
| S2: Infrequent Shift     | 30 min (Anchor)    |        27.00 min      |      103.52 min       |          0.00%          |
| S5: Delayed Propagation  | 10 min             |         0.04 min      |       15.68 min       |         99.64%          |
|                          | 30 min (Anchor)    |         3.75 min      |       12.43 min       |         51.79%          |
|                          | 60 min             |        29.69 min      |        0.74 min       |          0.00%          |
+--------------------------+--------------------+-----------------------+-----------------------+-------------------------+
```

### B. RQ2: Multi-Source Provenance and Conflicting-Claim Fusion (EXP-PROV)
The provenance fusion engine was evaluated across 40,000+ synthetic trials reproducing multi-source conflict scenarios:
1. **Conflict Detection**: Across all suites, the engine achieved a **100.0% conflict detection rate** whenever divergent usable claims were submitted for facility capabilities or structured fields (telephone numbers and specialties).
2. **Conservative Safety Profile**: Under unverified multi-source disagreement (e.g., conflicting web scrapers), MedReach held **87.1% of scenarios as unresolved (`unknown`)**, preventing unverified claims from displaying misleading capacity. In institutional disputes between verified sources, the engine exhibited a **100.0% freeze rate**, correctly refusing to pick an arbitrary winner.
3. **Resolution Accuracy**: When claims were resolved, the engine achieved a **conditional accuracy of 90.29%** across 12,000 trials, with an overall error rate of 7.38%. A single verified anchor source completely dominated noisy scrapers, yielding **95.9% correct resolution and 0.0% errors** across 1,000 trials.
4. **Calibration Analysis (Negative Finding)**: Evaluation of 10,615 resolved claims revealed a **Brier score of 0.1315**, an **Expected Calibration Error (ECE) of 0.1255**, and a **Maximum Calibration Error (MCE) of 0.7333**. MedReach's confidence levels (`HIGH`, `MEDIUM`, `LOW`) function as an **uncalibrated heuristic ordinal ranking**: `HIGH` confidence claims exhibited an empirical accuracy of 87.65% (below nominal 100%), while `MEDIUM` claims exhibited 82.28% (above nominal 70%).

### C. RQ3: Data Path & Edge Caching Staleness Audit (EXP-DATAPATH)
To investigate whether edge caching of Next.js prerendered HTML shells served by Vercel edge nodes stales healthcare availability, we performed an empirical probe of 22 deployed endpoints (15 HTML routes across the three variants and 7 Express API endpoints).

**Verdict: NOT SUPPORTED**. The investigation conclusively demonstrated that the claimed stale-availability hazard is **not present** in MedReach:
- **Zero Volatile Data in HTML Shells**: Prerendered HTML shells served from Vercel's edge cache (`x-vercel-cache: HIT`, age ~32,000s) contain only static layout skeletons, navigation bars, search inputs, and placeholder text ("Loading providers..."). They contain **zero** clinical availability numbers, bed counts, or provider records.
- **Universal Client-Side Runtime Fetching**: All 15 healthcare discovery routes execute `"use client";` directives. Data fetching occurs strictly in React `useEffect` hooks *after* DOM hydration via `api.listHospitals()`.
- **Decoupled Backend Edge Policy**: The Express backend is hosted independently on Railway, emitting `Cache-Control: no-store` on all transactional endpoints.

This negative finding corrects earlier theoretical inferences, confirming that MedReach's decoupled client-fetch architecture is immune to static-page edge staling.

### D. RQ4: Transactional Reliability & State-Machine Invariants (EXP-TX)
In an isolated suite of 8 transactional sub-domains evaluated against MongoDB on port 27018, all **48 test assertions passed (100.0% pass rate)**:
- **Idempotency Enforcement**: Submitting duplicate emergency requests with the same idempotency key cleanly returned the cached record (`200 OK`). Cross-user key theft was blocked with `409 IDEMPOTENCY_KEY_REUSED`.
- **Optimistic Concurrency Control (OCC)**: Under 10 simultaneous conflicting state transitions, exactly 1 atomic update succeeded (`200 OK`) and 9 failed with `409 Conflict`, preserving timeline integrity without interleaved steps.
- **Telemetry-Request Decoupling**: Submitting 10 emergency requests, accepting 3, and completing 2 did not decrement reported availability in `AvailabilityObservation` (remained 5 beds), verifying that point-in-time capacity bulletins are strictly separated from request fulfillment.

```
+-------------------------------------------------------------------------------------------------------------------------+
| TABLE IV: Transactional Reliability Evaluation Suite (EXP-TX-01 through EXP-TX-08)                                      |
+-------------------+-------------------------------------------------------------+-------+--------+----------+-----------+
| Experiment ID     | Focus Area / Sub-Domain Evaluated                           | Tests | Passed | Failed   | Pass Rate |
+-------------------+-------------------------------------------------------------+-------+--------+----------+-----------+
| EXP-TX-01         | Duplicate Request Prevention & Idempotency Key Handling     |  10   |   10   |    0     |  100.00%  |
| EXP-TX-02         | Idempotent Retries & Simulated Timeout Recovery             |   7   |    7   |    0     |  100.00%  |
| EXP-TX-03         | Concurrent Requests Competing for State Mutations (OCC)     |   4   |    4   |    0     |  100.00%  |
| EXP-TX-04         | Stale-State & Out-of-Order Transition Prevention            |   7   |    7   |    0     |  100.00%  |
| EXP-TX-05         | State-Machine RBAC & Valid Transition Lifecycle             |   6   |    6   |    0     |  100.00%  |
| EXP-TX-06         | Interrupted Operations & Safe Idempotent Resumption         |   4   |    4   |    0     |  100.00%  |
| EXP-TX-07         | Read-Status Consistency Across Repeated & Concurrent Reads  |   4   |    4   |    0     |  100.00%  |
| EXP-TX-08         | Observational Telemetry vs. Request Fulfillment Separation  |   6   |    6   |    0     |  100.00%  |
+-------------------+-------------------------------------------------------------+-------+--------+----------+-----------+
| TOTAL             | Master Transactional Reliability Suite                      |  48   |   48   |    0     |  100.00%  |
+-------------------+-------------------------------------------------------------+-------+--------+----------+-----------+
```

### E. Isolated Load & Throughput Benchmarking (EXP-LOAD)
Local load benchmarking executed via `autocannon` 8.0.0 on port 4200 (MongoDB 27018) established system throughput baselines:
- **Baseline Reads**: `/api/hospitals` sustained **298.9 to 299.2 req/s** (median latency 3 ms, 0 errors, 0 timeouts). The lightweight `/health` endpoint sustained **7,131 to 7,362 req/s** (0 ms latency).
- **Workload Ramp & Spike**: Under a concurrency ramp from $C=5$ to $C=50$, `/api/hospitals` maintained ~400 req/s. Under an extreme spike test of $C=250$, throughput stabilized at **386.7 req/s with 624 ms median latency** and 0 non-2xx errors.
- **Post-Load Recovery**: Following sustained soak workloads ($C=30$, 60s), recovery runs immediately returned to **305.6 to 328.6 req/s** with median latency returning to 2 ms, confirming zero memory leaks or uncollected database handles.

---

## VI. Discussion

### A. The 30-Minute Anchor as a Clinical Safety Mechanism
Our findings provide a strong theoretical and empirical justification for MedReach's 30-minute availability cutoff. In healthcare discovery, the cost of a false positive ("phantom availability") is fundamentally asymmetric to the cost of a false negative ("unknown status"):
- A searcher who receives `"unknown"` is prompted to telephone the casualty desk or proceed to a major tertiary medical college with high baseline capacity.
- A searcher who receives a false `"available"` indicator may direct an ambulance through congested urban traffic to a peripheral hospital whose last ICU bed was filled an hour earlier, resulting in catastrophic diversion during respiratory or circulatory arrest.
By capping phantom availability below 0.84% across all scenarios, the 30-minute anchor prevents digital platforms from becoming vectors of misdirection.

### B. Two-Column Architectural Analysis: Current Guarantees vs. Required Implementation
To ensure complete transparency, Table V provides an evidence-based comparison contrasting what MedReach demonstrably guarantees versus what still requires implementation for enterprise production readiness:

```
+-------------------------------------------------------------------------------------------------------------------------+
| TABLE V: Demonstrable Architectural Guarantees vs. Required Implementation                                               |
+-------------------------------------------------------------+-----------------------------------------------------------+
| What Current MedReach Architecture Demonstrably Guarantees  | What Still REQUIRES IMPLEMENTATION for Production Scale   |
+-------------------------------------------------------------+-----------------------------------------------------------+
| 1. Strict Idempotent Deduplication by Scope & Key:          | Atomic Multi-Document Distributed Transactions:           |
|    Enforces unique sparse index on sha256(scope:key).       | Cross-collection workflows (EmergencyRequest + AuditLog)  |
|    Identical retries return 200 OK with original record.    | coordinate in app logic without a multi-document session. |
|    Cross-user key theft blocked with 409 Conflict.          | An audit failure leaves the primary request committed.    |
+-------------------------------------------------------------+-----------------------------------------------------------+
| 2. Safe In-Flight Timeout Recovery:                         | Distributed In-Flight Lock with TTL:                      |
|    Client dropouts during execution recover cleanly upon    | Idempotency hashes are persisted in document models.      |
|    retry without duplicate records or phantom state.        | A Redis/memory mutex would reduce DB index collision load.|
+-------------------------------------------------------------+-----------------------------------------------------------+
| 3. Optimistic Concurrency Control (OCC):                    | Automated Client-Side Conflict Resolution Protocols:      |
|    Atomic findOneAndUpdate verifies previous status and     | When 409 is returned, client must refresh manually.       |
|    timeline length. Exactly 1 update commits; N-1 fail.     | HTTP ETag / If-Match or WebSockets are needed for desks.  |
+-------------------------------------------------------------+-----------------------------------------------------------+
| 4. Strict State-Machine RBAC & Transition Invariants:       | Configurable Workflow Engine / State Machine Versioning:  |
|    Terminal states cannot be mutated; expired requests      | State transitions are hardcoded static JavaScript objects.|
|    auto-finalize; unauthorized roles receive 403 Forbidden. | Dynamic municipal protocol changes require code edits.    |
+-------------------------------------------------------------+-----------------------------------------------------------+
| 5. Monotonic Read Consistency During Concurrent Writes:     | Read-After-Write Majority Replica Consistency:            |
|    40 concurrent reads during state mutations showed 0      | In distributed MongoDB clusters, readConcern: "majority"   |
|    split-brain reads between document status and timeline.  | must be configured to prevent stale secondary reads.      |
+-------------------------------------------------------------+-----------------------------------------------------------+
| 6. Complete Telemetry-Request Decoupling:                   | Active Bed Reservation / Allocation Hold with TTL:        |
|    Creating/accepting requests does not alter               | System lacks a 15-minute temporary bed hold while patient |
|    AvailabilityObservation records; telemetry != reservation| is en route, risking capacity loss during transit.        |
+-------------------------------------------------------------+-----------------------------------------------------------+
```

---

## VII. Threats to Validity

1. **Internal Validity (Simulation Assumptions)**: Ground-truth capacity transitions were modeled via a 3-state continuous-time Markov process. While transition rates were calibrated to published emergency department dwell times (25–45 min), actual hospital capacity dynamics may exhibit non-exponential, multi-resource dependencies.
2. **External Validity (Synthetic Telemetry)**: All evaluated provider arrival sequences and dropout episodes were generated synthetically. MedReach does not possess active live integrations with MCGM hospital admission servers; empirical results reflect mathematical queueing behavior rather than observed clinical telemetry.
3. **Construct Validity (Confidence Metric)**: As revealed by our calibration audit, the confidence metric is an uncalibrated heuristic. Treating it as a probability would introduce construct invalidity; it is properly interpreted as an ordinal priority weight.
4. **Conclusion Validity**: Transactional and load benchmarks were conducted in an isolated single-node environment (MongoDB 8.0 on port 27018, Node.js on port 4200). Distributed cluster dynamics (network partitions, replica replication lag) were not evaluated.

---

## VIII. Ethical and Data-Governance Considerations

Operating digital platforms in emergency healthcare involves profound ethical responsibilities:
- **Prevention of Misdirection**: The paramount ethical hazard is directing an unstable patient to an unavailable facility. MedReach's conservative fallback to `"unknown"` explicitly prioritizes patient safety over platform coverage metrics.
- **Privacy and Data Protection**: The platform strictly complies with the Indian Digital Personal Data Protection (DPDP) Act 2023. Emergency requests enforce field-level redaction, guest tracking uses cryptographic tokens rather than public identifiers, and zero protected health information (PHI) is written to unencrypted logs or client bundles.
- **Equity and Non-Exclusion**: MedReach provides three lightweight frontend variants (including a zero-dependency Bootstrap variant under 150 KB) ensuring full usability on low-cost Android mobile devices operating on 2G/3G networks.

---

## IX. Limitations and Future Work

### Limitations
- **No Clinical Outcome Measurement**: This research did not evaluate clinical endpoints (e.g., mortality, morbidity, transfer times).
- **Lack of Physical Ward Integration**: Real-world deployment requires official institutional data-sharing agreements with municipal authorities.
- **Absence of Active Bed Holds**: The system currently tracks observational telemetry rather than transactional bed reservations with TTL holds.

### Future Work
- **Probability Calibration**: Applying Platt scaling or isotonic regression to calibrate the confidence scoring engine into true Bayesian probabilities.
- **HL7 FHIR Gateway Integration**: Developing FHIR-compliant ingestion adapters to connect directly to hospital electronic health record (EHR) systems.
- **Active Reservation Engine**: Implementing a formal two-way `ReservationHold` entity with automatic 15-minute TTL expiration to secure beds during ambulance transit.

---

## X. Reproducibility and Artifact Availability

In accordance with open-science standards, all code, benchmark suites, raw data files, and figure generation scripts are fully preserved within the repository:
- **AoI Simulation**: [`research/experiments/aoi/simulate_aoi.py`](file:///home/anonymous/medreach/research/experiments/aoi/simulate_aoi.py), [`research/results/aoi/`](file:///home/anonymous/medreach/research/results/aoi/)
- **Provenance Fusion**: [`research/experiments/provenance/`](file:///home/anonymous/medreach/research/experiments/provenance/), [`research/results/provenance/`](file:///home/anonymous/medreach/research/results/provenance/)
- **Data Path Audit**: [`research/results/datapath/datapath-staleness-audit.md`](file:///home/anonymous/medreach/research/results/datapath/datapath-staleness-audit.md)
- **Transactional Suite**: [`research/experiments/transactional/run-all-tx-experiments.mjs`](file:///home/anonymous/medreach/research/experiments/transactional/run-all-tx-experiments.mjs), [`research/results/transactional/`](file:///home/anonymous/medreach/research/results/transactional/)
- **Load Benchmarks**: [`research/results/load/`](file:///home/anonymous/medreach/research/results/load/)

Reproduction requires Node.js v24+, Python 3.11+ (NumPy, Matplotlib), and a disposable MongoDB instance on port 27018.

---

## XI. Conclusion

This paper presented an architectural design and empirical evaluation of MedReach, a freshness-aware, provenance-tracked healthcare resource discovery platform for fragmented urban ecosystems. Through rigorous evaluation of Age of Information dynamics, conflicting-claim fusion, edge caching, and transactional concurrency, we demonstrated that MedReach's 30-minute staleness anchor and conservative fallback mechanisms prevent catastrophic phantom availability errors while maintaining high throughput and transactional integrity. By formally establishing the boundaries between current demonstrable guarantees and required future implementations, this work provides a reproducible, evidence-based blueprint for the next generation of resilient urban emergency health informatics.

---

## References

*(Consolidated from verified bibliography in `references.bib`)*

1. A. E. Metuge, "Digital Patient Navigation Systems and Treatment Acceptance: A Mixed-Methods Study of Patient Coordination in Modern Healthcare Clinics," *African Journal of Health and Medical Sciences*, vol. 11, no. 2, pp. 126, 2026. doi: 10.59067/afjhms.v11i2.126.
2. N. Darapaneni et al., "Predicting Hospital Bed Requirements for COVID-19 Patients in Mumbai City and Mumbai Suburban Region," *Advances in Intelligent Systems and Computing*, vol. 1324, pp. 53–64, 2021. doi: 10.1007/978-981-16-1502-3_5.
3. E. Naydenova et al., "Healthcare choices in Mumbai slums: A cross-sectional study," *Wellcome Open Research*, vol. 2, pp. 115, 2017. doi: 10.12688/wellcomeopenres.11536.2.
4. S. R. Shinde and S. R. Deshpande, "Insights into Public-Private Sector Variations in Maternal Health Care Utilization in an Urban Slum in Mumbai," *Cureus*, vol. 18, no. 2, pp. e78768, 2026. doi: 10.7759/cureus.78768.
5. S. Patil et al., "Study of health seeking behavior and its determinants among attendees of urban health center, Dharavi, Mumbai, India," *International Journal of Community Medicine and Public Health*, vol. 3, no. 1, pp. 215–219, 2016. doi: 10.18203/2394-6040.ijcmph20164287.
6. A. Mukhopadhyay et al., "Stroke among slum dwellers: Risk factors and health-seeking behavior in elderly residents of Dharavi, Mumbai," *National Journal of Research in Community Medicine*, vol. 7, no. 2, pp. 148–152, 2018. doi: 10.26727/njrcm.2018.7.2.148-152.
7. S. K. Kaul, R. Yates, and M. Gruteser, "Real-time status: How often should one update?," in *Proc. 2012 Proceedings IEEE INFOCOM*, 2012, pp. 2731–2735. doi: 10.1109/infcom.2012.6195689.
8. R. D. Yates et al., "Age of Information: An Introduction and Survey," *IEEE Journal on Selected Areas in Communications*, vol. 39, no. 5, pp. 1183–1210, 2021. doi: 10.1109/jsac.2021.3065072.
9. Y. Sun et al., "Update or Wait: How to Keep Your Data Fresh," *IEEE Transactions on Information Theory*, vol. 63, no. 11, pp. 7492–7508, 2017. doi: 10.1109/tit.2017.2735804.
10. L. Moreau et al., "The Open Provenance Model core specification (v1.1)," *Future Generation Computer Systems*, vol. 27, no. 6, pp. 743–756, 2011. doi: 10.1016/j.future.2010.07.005.
11. X. L. Dong, L. Berti-Equille, and D. Srivastava, "Truth discovery and copying detection in a dynamic world," *Proceedings of the VLDB Endowment*, vol. 2, no. 1, pp. 562–573, 2009. doi: 10.14778/1687627.1687691.
12. J. Bleiholder and F. Naumann, "Data fusion," *ACM Computing Surveys*, vol. 41, no. 1, pp. 1–41, 2009. doi: 10.1145/1456650.1456651.
13. D. Sugira et al., "Design and Prototype Development of a Patient Navigation Platform for Healthcare Services in Kigali, Rwanda," *Research Square*, 2026. doi: 10.21203/rs.10831662/v1.
14. M. Dalton et al., "Patient navigation services for cancer care in low-and middle-income countries: A scoping review," *PLOS ONE*, vol. 14, no. 10, pp. e0223537, 2019. doi: 10.1371/journal.pone.0223537.
15. M. Chen et al., "Patient Navigation in Cancer Treatment: A Systematic Review," *Current Oncology Reports*, vol. 26, no. 3, pp. 270–281, 2024. doi: 10.1007/s11912-024-01514-9.
16. Municipal Corporation of Greater Mumbai, "Decentralized COVID-19 War Room Model and Real-Time Bed Management Standard Operating Procedures," *Public Health Department, BMC*, 2021.
