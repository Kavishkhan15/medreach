# Freshness-Aware, Provenance-Tracked Healthcare Resource Discovery in Fragmented Urban Ecosystems: System Design, Staleness Dynamics, and Transactional Evaluation

**Authors**: MedReach Research Collaboration  
**Affiliation**: Department of Health Informatics and Systems Engineering, Urban Healthcare Systems Initiative  
**Location**: Mumbai, Maharashtra, India  
**Target Venue**: IEEE Transactions on Services Computing / IEEE Access  
**Artifact Repository**: `/home/anonymous/medreach`  
**Evaluation Date**: October 2026  

---

## Abstract

Locating emergency healthcare resources—such as intensive care unit (ICU) beds, specialized surgical facilities, and compatible blood components—in dense, fragmented metropolitan centers like Mumbai represents a critical coordination challenge. Traditional civilian search relies on phone inquiries, unverified static directories, or physical transit between casualty wards, consuming the clinical "golden hour" and exacerbating emergency department crowding. While digital health platforms have emerged, existing regional platforms operate almost exclusively as unverified static directories or asynchronous self-reported bulletins, lacking freshness tracking, provenance fusion, and two-way confirmation.

This paper presents an architectural design and comprehensive empirical evaluation of **MedReach**, an open-source, freshness-aware, and provenance-tracked emergency resource discovery platform designed for urban healthcare coordination. MedReach establishes a decoupled, multi-tiered data model that enforces explicit Age of Information (AoI) boundaries, multi-source provenance fusion with priority cascades, and idempotent state-machine workflows for two-way clinical requests. 

Through extensive empirical evaluation across five experimental suites, we report:
1. **Age of Information (AoI) Dynamics**: In an extensive synthetic simulation suite across 6 operational archetypes (300 trajectories, 1,296,000 query evaluations over 72-hour operational horizons), MedReach's pre-registered 30-minute availability cutoff ($\tau = 30\text{ min}$, configured via `CURRENT_AVAILABILITY_MAX_AGE_MS = 30 * 60 * 1000`) functions as a critical clinical safety governor. Under manual 2-hour shift reporting, the 30-minute threshold withholds status 78.42% of the time, keeping dangerous "phantom availability" (displaying beds as available when physically full) down to 0.337%. Loosening the cutoff to 180 minutes expands coverage to 97.15% but causes phantom availability to explode by 18.9x to 6.382% with an overall status error rate of 53.71%. Furthermore, we demonstrate the "ingestion delay trap": when data is collected via batch crawlers with 15–45 min queue latency, 51.79% of updates arrive already stale at 30 minutes, and 99.64% arrive stale at 10 minutes, proving that discovery freshness is strictly bounded by ingestion latency.
2. **Provenance & Conflicting-Claim Fusion**: Evaluating the production fusion engine against 40,000+ synthetic trials with known ground truth reveals a 100.0% conflict detection rate and a conservative 87.1% fallback rate to "unknown" under unverified divergent scrapers. When resolving claims, the engine achieves 90.29% conditional accuracy. However, formal calibration analysis reveals an essential negative finding: MedReach's confidence metric is an uncalibrated heuristic ordinal ranking (Brier score 0.1315, Expected Calibration Error 0.1255, Maximum Calibration Error 0.7333), rather than a calibrated Bayesian probability.
3. **Data Path & Edge Caching Audit**: An architectural audit of 22 deployed endpoints resolves an earlier theoretical concern: edge-cached prerendered HTML shells served with multi-hour retention contain zero volatile capacity data (structural DOM shells only), with all live availability fetched dynamically at runtime via client-side React hooks, entirely avoiding the static-page staling hazard (**verdict: NOT SUPPORTED**).
4. **Transactional Correctness & Concurrency**: In an isolated suite of 48 test assertions evaluating concurrency and idempotency, the platform achieved a 100.0% pass rate. SHA-256 scoped idempotency keys (`sha256(scope:key)`) reliably reject cross-user collisions with `409 IDEMPOTENCY_KEY_REUSED`, optimistic concurrency control isolates competing mutations under 10-way concurrency, and availability telemetry is strictly decoupled from request fulfillment.
5. **Isolated Load & Throughput Benchmarking**: Single-machine loopback load benchmarking executed via `autocannon` 8.0.0 with HDR histograms demonstrates that baseline database reads (`GET /api/hospitals`) sustain **284.7 req/s** (median latency 3.00 ms, $p_{99} = 9.67\text{ ms}$), while the lightweight Express pipeline (`GET /health`) processes **7,052.9 req/s** (<0.5 ms). Under a workload ramp, throughput saturates at ~395 req/s at concurrency $C=50$, cleanly absorbing an instantaneous 50x surge ($C=250$, 386.7 req/s) with 0 connection drops or timeouts, and exhibiting 100% post-stress normalization to 2.0 ms median latency.

We provide a comprehensive, two-column architectural analysis detailing demonstrable system guarantees versus components still requiring implementation (distributed multi-document transactions and time-to-live bed-reservation locks), establishing an evidence-based foundation for resilient urban health informatics.

---

## Index Terms

Age of Information (AoI), Data Freshness, Emergency Healthcare Informatics, Idempotency, Multi-Source Data Fusion, Provenance Tracking, Resource Discovery, Transactional Reliability.

---

## I. Introduction

In dense urban agglomerations in low- and middle-income countries (LMICs), acute emergency healthcare access remains severely constrained by information friction \cite{metuge2026digital,dalton2019patient}. When a patient suffers severe polytrauma, acute respiratory failure, or obstetric hemorrhage in Mumbai—a metropolitan area exceeding 13 million residents—locating an operational intensive care unit (ICU) bed, a mechanical ventilator, or an appropriate blood component unit is a high-stakes coordination problem \cite{darapaneni2021predicting,naydenova2017healthcare}. 

The urban healthcare landscape in Mumbai is exceptionally pluralistic and fragmented: it comprises municipal medical colleges (e.g., KEM, Sion, Nair, Cooper) managed by the Municipal Corporation of Greater Mumbai (MCGM), state government hospitals (e.g., Sir J.J. Group), charitable trust institutions (e.g., Lilavati, Bombay Hospital, Hinduja), and hundreds of private corporate centers and nursing homes \cite{shinde2026insights,mcgm2021covidwarroom,more2009inequalities}. In the absence of a unified, real-time dispatch and bed-tracking system, citizens, private ambulance operators, and primary clinic physicians traditionally engage in exploratory manual searching—placing repeated telephone calls to casualty departments or physically transporting patients between emergency rooms \cite{patil2016study,mukhopadhyay2018stroke}. This exploratory process frequently consumes the clinical "golden hour", induces catastrophic secondary inter-facility transfers, and increases risks for time-critical conditions \cite{naydenova2017healthcare,darapaneni2021predicting,skordisworrall2011maternal}.

Although public web portals exist—including the Brihanmumbai Municipal Corporation (BMC) health dashboard and the national e-RaktKosh blood transfusion registry—empirical investigation demonstrates that they operate primarily as static directory listings or asynchronous, unverified inventory bulletins \cite{metuge2026digital,mohfw2022eraktkosh}. They lack automated freshness tracking, provide zero information regarding verification provenance, and offer no mechanism for two-way clinical confirmation or reservation holds \cite{haeder2023state,haeder2024consumer}. Consequently, healthcare searchers frequently encounter "phantom availability": digital platforms advertise available beds or blood units that were exhausted hours earlier, leading to tragic misdirection.

To address this challenge, the **MedReach** platform was developed as an open-source, freshness-aware, and provenance-tracked discovery and two-way coordination system. MedReach introduces three core architectural mechanisms:
1. **Freshness-Aware Availability Tracking**: A deterministic evaluation engine that tracks the exact Age of Information (AoI) of resource telemetry and automatically demotes stale observations to `"unknown"` beyond a strict 30-minute threshold (`CURRENT_AVAILABILITY_MAX_AGE_MS = 30 * 60 * 1000`), refusing to present unverified point-in-time capacity as guaranteed care \cite{kaul2012realtime,yates2021age}.
2. **Provenance-Aware Conflicting-Claim Fusion**: A deterministic priority cascade that tracks source reliability, verification status, and timestamps, detecting divergent claims across official APIs, hospital web scrapers, and manual audits, and deferring unresolved institutional disputes to safe ignorance rather than algorithmic guesswork \cite{bleiholder2008data,dong2009data,moreau2011open}.
3. **Idempotent, Two-Way Request Orchestration**: A state-machine transaction model that decouples observational capacity telemetry from request fulfillment, protecting emergency requests against network retries, duplicate submissions, and race conditions via SHA-256 scoped idempotency keys and optimistic concurrency control (OCC).

---

## II. Background and Related Work

### A. Emergency Healthcare Navigation in Urban LMICs
Emergency medical care in urban LMIC contexts faces severe operational barriers characterized by three delays: delay in seeking care, delay in reaching care, and delay in receiving definitive care \cite{dalton2019patient,skordisworrall2011maternal}. In major Indian metropolitan centers like Mumbai, emergency transport operates in a deeply divided market: public 108 ambulances, municipal hospital vehicles, and numerous uncoordinated private ambulance fleets operate without centralized telematics \cite{naydenova2017healthcare,shinde2026insights}. Consequently, patients and their relatives undertake uncoordinated searches across facilities, driving acute emergency department overcrowding in public tertiary centers while nearby peripheral facilities remain underutilized \cite{darapaneni2021predicting,patil2016study}. Digital health interventions have frequently failed to improve outcomes because they digitized directory listings without solving the underlying operational uncertainty of whether a clinical resource is actually vacant at the moment of patient arrival \cite{metuge2026digital,haeder2024persistence}.

### B. Age of Information (AoI) and Data Staleness
The concept of Age of Information (AoI), originally formalized by Kaul, Yates, and Gruteser \cite{kaul2012realtime,yates2021age}, quantifies data freshness from the receiver's perspective. In status-updating systems, if a packet generated at time $U(t)$ arrives at time $t$, the AoI $\Delta(t) = t - U(t)$ grows linearly in the absence of new updates and resets upon receiving fresh data \cite{sun2017update}. In healthcare resource discovery, data staleness is not merely a quality-of-service degradation; it is a clinical safety hazard. As Zou and Ozel \cite{zou2019relative} and Hu and Chen \cite{hu2020optimal} observed, when capacity fluctuates rapidly under emergency admissions, high update throughput does not guarantee freshness if queueing or ingestion delays induce update aging. In HTTP caching, RFC 9111 \cite{fielding2022caching,fielding2022semantics} and RFC 5861 \cite{nottingham2010stale} formalize freshness lifetimes and stale-while-revalidate semantics; however, general web caching specifications do not account for the asymmetric risk where a stale "available" indicator can cause fatal diversion.

### C. Provenance, Information Fusion, and Conflict Resolution
Data fusion from heterogeneous sources has been extensively studied in database literature \cite{bleiholder2008data,dong2009data}. When aggregating information across disparate feeds, conflicts inevitably arise due to timing differences, schema variations, or erroneous reporting \cite{moreau2011open}. In public health and provider directories, empirical studies by Haeder et al. \cite{haeder2023state,haeder2024consumer,haeder2024persistence,haeder2025network} and Burman et al. \cite{burman2022provider} have demonstrated widespread inaccuracy in provider directory listings, where ghost networks and inaccurate contact information impede patient care. In blood banking, Kumari and Raina \cite{kumari2019reasons} and Basavarajegowda et al. \cite{basavarajegowda2026blood} showed that fragmented stock reporting exacerbates acute blood shortages. To resolve conflicting claims without human intervention, fusion engines must track cryptographic provenance, source authority tiers, and verification timestamps \cite{vermeulen2023trust,abedin2021data,liu2024data}.

### D. The Mumbai Healthcare Digital Landscape: Empirical Taxonomy
To rigorously contextualize existing regional platforms, we formulate a five-tier operational taxonomy of resource visibility:
- **Tier 1 (Directory Listing)**: Static facility registry (name, address, telephone, GPS coordinates).
- **Tier 2 (Service Offered)**: Static catalog of clinical specialties and infrastructure (e.g., "ICU", "Blood Bank", "CT").
- **Tier 3 (Resource Reported Available)**: Asynchronous, self-reported count of vacant units (e.g., "12 beds vacant", "5 units A+"). Lacks transactional guarantee, reservation hold, or freshness verification.
- **Tier 4 (Resource Confirmed Currently Available)**: Synchronous, verified reservation or holding lock confirmed by clinical or dispatch personnel within an active freshness window.
- **Tier 5 (Completed Request)**: End-to-end lifecycle orchestration: triage match, dispatch, bed hold, transit, and intake handover.

Table I classifies existing regional platforms in Mumbai and India against this hierarchy based on empirical inspection of their live web portals and documentation.

```
+-------------------------------------------------------------------------------------------------------------------------+
| TABLE I: Five-Tier Operational Taxonomy of Healthcare Resource Visibility in Mumbai & India                              |
+------------------------------------+------------+--------------------------+--------------------+-----------------------+
| Platform / System                  | Tier Level | Operational Mechanism    | Freshness Tracking | Request Confirmation  |
+------------------------------------+------------+--------------------------+--------------------+-----------------------+
| BMC Health Dashboard (COVID Era)   | Tier 1–3   | 2-hour manual reporting  | Timestamp display  | Central War Room only |
| e-RaktKosh (National Blood Portal) | Tier 1–3   | Daily self-reported stock| Date stamp display | Telephone inquiry only|
| MahaSBTC Blood Registry            | Tier 1–3   | Periodic manual updates  | Date stamp display | Unconfirmed directory |
| NHM HMIS / National Health Portal  | Tier 1–2   | Monthly aggregated audit | None (Historical)  | None                  |
| 108 Maharashtra EMS (BVG)          | Tier 1–2   | Telephone dispatch queue | Real-time vehicle  | Voice dispatch triage |
| **MedReach (This Work)**           | **Tier 1–4**| **AoI decay + OCC engine**| **Strict 30m AoI** | **Two-way idempotent**|
+------------------------------------+------------+--------------------------+--------------------+-----------------------+
```

As demonstrated in Table I, existing regional platforms operate strictly at Tiers 1–3. Zero existing platforms provide automated freshness governors, programmatic provenance fusion, or two-way idempotent clinical request coordination.

---

## III. Research Gap and Contributions

### A. Research Gap
The critical research gap in urban digital health is the gulf between passive, unverified directory registries (Tiers 1–3) and verifiable, freshness-governed request coordination (Tiers 4–5). While theoretical computer science has formalized AoI decay in packet networks, and database literature has developed multi-source conflict resolution, these principles have not been unified into an open-source, deployable emergency health informatics platform capable of preventing phantom availability errors while maintaining high-throughput transactional reliability under fragmented LMIC infrastructure constraints.

### B. Summary of Contributions
This paper provides an end-to-end systems and empirical evaluation of MedReach, making the following contributions:
1. **Formal AoI Characterization & Safety Governor**: We formulate the information-ageing process in emergency discovery and evaluate it across 6 realistic operational archetypes (300 trajectories, 1,296,000 queries). We prove that MedReach's 30-minute anchor prevents an 18.9x surge in phantom availability errors and characterize the "ingestion delay trap".
2. **Empirical Evaluation of Multi-Source Provenance Fusion**: We execute the production claim fusion engine against 40,000+ synthetic trials with known ground truth, establishing a 100.0% conflict detection rate and 90.29% resolution accuracy, while identifying an uncalibrated heuristic property in the platform's confidence scoring engine.
3. **Empirical Resolution of the Edge-Caching Hazard**: We resolve an earlier architectural concern through an audit of 22 deployed endpoints, demonstrating that edge caching of prerendered HTML shells does not induce availability staling because volatile metrics are fetched strictly via client-side React hooks (**verdict: NOT SUPPORTED**).
4. **Transactional Correctness & Concurrency Evaluation**: In an isolated suite of 48 test assertions, we demonstrate that SHA-256 scoped idempotency keys, 10-way optimistic concurrency control, and telemetry-request decoupling achieve 100.0% reliability under concurrent stress.
5. **Single-Machine Workload Scaling & Stress Benchmarking**: Using `autocannon` 8.0.0 with HDR histograms, we characterize baseline throughput (284.7 req/s for DB reads, 7,052.9 req/s for Express routing), identify the saturation knee at $C=50$, prove absorption of an instantaneous 50x surge ($C=250$), and demonstrate 100% post-stress normalization to 2.0 ms median latency.

---

## IV. Research Questions

This study investigates five primary research questions:
- **RQ1 (AoI Dynamics & Staleness Boundary)**: How does the 30-minute availability cutoff ($\tau = 30\text{ min}$) impact coverage, staleness, and phantom availability risk across heterogeneous update patterns compared to relaxed thresholds ($\tau \in [60, 180, 360]\text{ min}$)?
- **RQ2 (Multi-Source Provenance Fusion & Calibration)**: How reliably does the production fusion cascade detect conflicting claims across official APIs, scrapers, and audits, and are the resulting confidence scores statistically calibrated probabilities?
- **RQ3 (Edge-Caching Datapath Staleness Hazard)**: Does multi-hour edge caching of prerendered HTML shells on public CDN edge nodes present stale availability counts to emergency searchers?
- **RQ4 (Transactional Reliability & State-Machine Invariants)**: How effectively do SHA-256 scoped idempotency keys and optimistic concurrency control enforce state-machine integrity and prevent duplicate submissions under concurrent load?
- **RQ5 (Single-Machine Load Scaling, Saturation, and Recovery)**: What are the single-machine throughput limits, latency distributions, and saturation behaviors of the platform under baseline, scaling ($C=1 \to 400$), 50x spike, and post-stress recovery conditions?

---

## V. System Under Study: MedReach Architecture

MedReach is an open-source, decoupled emergency healthcare coordination platform designed for urban centers. It is implemented in Node.js/Express, backed by MongoDB 8.0, and exposes RESTful API endpoints consumed by client applications. The platform features multiple presentation-layer frontend implementations sharing a single unified backend service.

```
+---------------------------------------------------------------------------------------------------------+
|                                    MEDREACH PLATFORM ARCHITECTURE                                        |
+---------------------------------------------------------------------------------------------------------+
| [ Client Presentation Layer ]                                                                            |
|   - Modular Frontends (Universal "use client" React Hooks, Dynamic Runtime Fetching)                     |
+---------------------------------------------------------------------------------------------------------+
                                                  |  HTTPS / REST (Cache-Control: no-store on writes)
                                                  v
+---------------------------------------------------------------------------------------------------------+
| [ API Gateway & Ingestion Boundary ] (Express 4.21, Node.js 24)                                          |
|   - Request Body Validation (Zod schemas)                                                               |
|   - Ingestion Staleness Filter (Rejects availability reports older than 30 minutes)                     |
|   - Idempotency Gate (SHA-256 Key Scoping: sha256(scope:key), Sparse Unique Index)                      |
+---------------------------------------------------------------------------------------------------------+
         |                                        |                                        |
         v                                        v                                        v
+------------------------+      +---------------------------------+      +--------------------------------+
| Freshness Engine       |      | Provenance Fusion Cascade       |      | Transactional Coordination     |
| - AoI Tracker:         |      | - Source Reliability Weights:   |      | - State Machine Validator      |
|   Delta(t) = t - U(t)  |      |   Official > Hospital > Scraper |      | - Optimistic Concurrency (OCC):|
| - Staleness Boundary:  |      | - Conflict Detection & Fallback |      |   atomic findOneAndUpdate      |
|   tau = 30 min cutoff  |      | - Heuristic Confidence Engine   |      | - Telemetry Decoupling Ledger  |
+------------------------+      +---------------------------------+      +--------------------------------+
         |                                        |                                        |
         +----------------------------------------+----------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------------+
| [ Persistence Layer ] (MongoDB 8.0, WiredTiger Engine)                                                  |
|   - Collections: hospitals, bloodbanks, ambulances, emergencyrequests, availabilityobservations        |
|   - Unique Sparse Compound Indexes: { idempotencyKeyHash: 1 }, { facilityId: 1, resourceType: 1 }      |
+---------------------------------------------------------------------------------------------------------+
```

### A. Freshness Evaluation Engine and Staleness Governor
The freshness engine tracks the timestamp $U(t)$ of every availability observation. In `packages/core/src/domain/freshness.js`, MedReach evaluates observation age:
$$\Delta(t) = t - U(t)$$
If $\Delta(t) \le \tau_{\text{fresh}}$ (15 minutes), the resource status is classified as `UPDATED_RECENTLY`. If $15\text{ min} < \Delta(t) \le \tau_{\text{cutoff}}$ (30 minutes), it is classified as `STALE`. Beyond 30 minutes (`CURRENT_AVAILABILITY_MAX_AGE_MS = 30 * 60 * 1000`), the observation is classified as `OUTDATED`, and the system automatically withholds the numeric availability count, demoting the facility status to `"unknown"`.

### B. Provenance Tracking and Priority Cascade
The fusion engine (`backend/src/services/hospitalFieldFusion.js`) ingests claims from heterogeneous sources:
1. `GOVERNMENT_API` (Official health authority registry, priority weight 1.0)
2. `HOSPITAL_OFFICIAL` (Direct hospital administrative portal, priority weight 0.9)
3. `COMMUNITY_VOLUNTEER` (Field volunteer physical audit, priority weight 0.7)
4. `UNVERIFIED_SCRAPER` (Third-party web crawler, priority weight 0.4)

When divergent claims emerge, the engine computes a weighted consensus. If disagreement occurs between verified official sources, or if only unverified scraper claims diverge, the cascade refrains from arbitrary voting and safely marks the field as `UNKNOWN`, preventing inaccurate data presentation.

### C. Transactional Request Coordination Engine
Emergency requests (`EmergencyRequest`, `BloodRequest`, `AmbulanceBooking`) require strict ACID guarantees at the document level:
- **Idempotency Scoping**: Clients submit an `Idempotency-Key` header (UUIDv4 or alphanumeric string). The server computes a scoped hash:
$$\text{hash} = \text{SHA-256}(\text{Scope} \parallel ":" \parallel \text{Key})$$
A unique sparse index on `idempotencyKeyHash` ensures that resubmissions return `200 OK` with the original response, while cross-user key reuse is blocked with `409 IDEMPOTENCY_KEY_REUSED`.
- **Optimistic Concurrency Control (OCC)**: State mutations execute via atomic MongoDB operations (`findOneAndUpdate`), asserting that `status` matches the expected previous state and that the mutation does not interleave concurrent writes.
- **Telemetry-Request Decoupling**: Availability observations are append-only time-series records. Request submissions and admissions do not alter observation counts, preventing the system from falsely advertising observational reports as transactional reservations.

---

## VI. Methodology and Experimental Setup

### A. AoI Stochastic Simulation Framework (EXP-AOI)
To evaluate information ageing without placing live hospital wards at risk, we developed a discrete-event stochastic simulation harness (`research/experiments/aoi/simulate_aoi.py`). The simulator models a 72-hour operational horizon across 6 operational archetypes:
1. **S1 (Frequent Reliable)**: Automated IoT telemetry with log-normal inter-arrival delays ($\mu = 5\text{ min}$, $\sigma = 1\text{ min}$).
2. **S2 (Infrequent Shift)**: Manual nurse shift reporting (bimodal handover peaks at 8-hour intervals, mean 120 min).
3. **S3 (Irregular Bursty)**: Mass-casualty surge updates governed by heavy-tailed Pareto distributions ($\alpha = 1.5$).
4. **S4 (High Dropout)**: Network blackouts and dropped updates (40% uniform random packet loss).
5. **S5 (Delayed Propagation)**: Batch web scraping pipelines introducing 15–45 minute queueing delays before ingestion.
6. **S6 (Diurnal Shift)**: Non-homogeneous Poisson process capturing daytime activity vs. overnight lull.

For each scenario, 50 independent Monte Carlo trajectories were executed (master seed `20261024`), querying the platform every 60 seconds (4,320 queries per trajectory; 216,000 queries per scenario; 1,296,000 query evaluations overall) across 5 threshold configurations ($\tau \in [10, 30, 60, 180, 360]\text{ min}$).

### B. Multi-Source Fusion & Calibration Evaluation (EXP-PROV)
We benchmarked the production fusion engine (`fuseFacilityClaims` and `resolveHospitalField`) across 40,000+ synthetic trials containing controlled noise distributions. In Experiment 1, source counts ($K \in [2, 10]$) and disagreement rates ($d \in [0.0, 0.8]$) were varied across 12,000 trials with known ground truth. Formal calibration was evaluated by computing Brier score, Expected Calibration Error (ECE), and Maximum Calibration Error (MCE) across 10,615 evaluated claims divided into 10 uniform reliability bins.

### C. Datapath & Edge Caching Audit Protocol (EXP-DATAPATH)
To audit edge caching, we deployed a multi-stage probe across all three production frontend deployments and the Railway API backend. We analyzed the Abstract Syntax Tree (AST) of built client bundles to determine whether availability data was baked into static server components (`generateStaticParams`) or fetched at runtime. We executed 22 automated HTTP probes logging `Cache-Control`, `x-vercel-cache`, `Age`, and response body payloads.

### D. Transactional Concurrency & State-Machine Suite (EXP-TX)
An automated Mocha/Chai integration harness (`research/experiments/transactional/run-all-tx-experiments.mjs`) evaluated 48 test assertions across 8 distinct transactional experiments. Tests targeted an isolated local MongoDB instance running on port 27018 with `EMAIL_ENABLED=false` and `AI_PROVIDER=rule_based`. Pre-flight scripts verified that the live database on port 27017 was strictly uncontacted.

### E. Isolated Single-Machine Load Testing Protocol (EXP-LOAD)
Load benchmarking was executed using `autocannon` 8.0.0 built on Node's native `undici` client stack, utilizing HDR histograms and automatic coordinated omission compensation. Benchmarks were conducted locally against `http://127.0.0.1:4200` on an isolated test database (port 27018) on an AMD Ryzen 7 3700X workstation (16 vCPUs, 15 GiB RAM, Linux Ubuntu 24.04). Scenarios encompassed:
- Baseline reference ($C=1$, 10s, 3 runs) for `/health` and `/api/hospitals`
- Workload ramp ($C \in [5, 10, 25, 50]$, 10s each)
- Controlled stress ramp ($C \in [100, 200, 400]$, 10s each)
- Instantaneous 50x spike ($C=5 \to 250 \to 5$, 20s total)
- Sustained soak ($C=30$, 60s)
- Post-stress recovery normalization ($C=1$, 10s)

---

## VII. Experimental Results

### A. RQ1: Age of Information Dynamics and Staleness Governance (EXP-AOI)
Table II summarizes the empirical findings across the 6 operational archetypes under MedReach's pre-registered 30-minute threshold ($\tau = 30\text{ min}$) compared to relaxed thresholds ($\tau = 180\text{ min}$).

```
+-----------------------------------------------------------------------------------------------------------------------------------+
| TABLE II: Empirical AoI Dynamics and Staleness Performance Across Six Operational Scenarios                                       |
+----------------------+--------------------+--------------------+---------------+-----------------+----------------+---------------+
| Scenario Archetype   | Mean / Median AoI  | P95 AoI (min)      | Coverage %    | Stale Withheld %| Error When Known| Phantom Avail %|
|                      | (min)              |                    | (at tau=30m)  | (at tau=30m)    | (at tau=30m)   | (tau 30 vs 180)|
+----------------------+--------------------+--------------------+---------------+-----------------+----------------+---------------+
| S1: Frequent Telemetry| 4.30 / 4.11        | 8.70               | 100.00%       | 0.00%           | 11.10%         | 0.18% vs 0.18%|
| S2: Infrequent Shift | 70.51 / 66.10      | 150.31             | 21.58%        | 78.42%          | 32.49%         | 0.34% vs 6.38%|
| S3: Irregular Bursty | 40.94 / 27.35      | 125.09             | 52.72%        | 47.28%          | 26.38%         | 0.55% vs 3.69%|
| S4: High Dropout     | 26.38 / 16.13      | 94.81              | 78.09%        | 21.91%          | 26.46%         | 0.84% vs 2.25%|
| S5: Crawler Ingest   | 37.50 / 37.55      | 53.76              | 24.39%        | 75.61%          | 41.74%         | 0.60% vs 3.90%|
| S6: Diurnal Handover | 73.04 / 35.60      | 281.21             | 44.53%        | 55.47%          | 27.76%         | 0.61% vs 3.99%|
+----------------------+--------------------+--------------------+---------------+-----------------+----------------+---------------+
```

The empirical results demonstrate:
1. **AoI Trajectories and Information Decay**: As illustrated in the simulation traces and cumulative distribution functions, information age grows rapidly under intermittent reporting, requiring deterministic thresholds to prevent stale data dissemination. When balancing coverage against error rate across varying threshold levels, MedReach's 30-minute anchor establishes an optimal operational frontier.
2. **The Phantom Availability Surge**: Under manual shift reporting (S2), the 30-minute threshold withholds status 78.42% of the time, keeping phantom availability down to 0.337%. Relaxing the threshold to $\tau = 180\text{ min}$ expands coverage to 97.15%, but causes phantom availability to surge by **18.9x to 6.382%**, with overall status error reaching 53.71%.
3. **The Ingestion Delay Trap**: In S5, web scrapers scrape data with 15–45 min queue latency. At $\tau = 30\text{ min}$, **51.79% of updates arrive already stale**. If the threshold is tightened to $\tau = 10\text{ min}$, **99.64% arrive already stale**, driving active coverage down to 0.25%. This proves that discovery freshness is strictly bounded by ingestion delay.

### B. RQ2: Multi-Source Provenance and Conflicting-Claim Fusion (EXP-PROV)
Evaluating 40,000+ synthetic trials established:
- **100.0% Conflict Detection**: Divergent claims across facility capabilities and structured attributes are universally detected. The cascade consistently isolates unverified conflicting reports as source disagreement increases.
- **Conservative Ignorance Fallback**: Under unverified scraper conflicts, the engine safely held the status as `unknown` in **87.1%** of cases. When verified official anchors exist, the engine achieved **95.9% correct resolution** and 0.0% decision error.
- **Conditional Accuracy**: Across 12,000 trials with known ground truth, when a claim was resolved, the engine achieved **90.29% conditional accuracy** (overall decision error rate 7.38%).

```
+-------------------------------------------------------------------------------------------------------------------+
| TABLE III: Heuristic Confidence Calibration Analysis (EXP-PROV-05)                                                |
+------------------+---------------------+--------------+--------------------+-------------------+------------------+
| Confidence Label | Nominal Probability | Sample Count | Empirical Accuracy | 95% Conf. Interval| Calibration Gap  |
+------------------+---------------------+--------------+--------------------+-------------------+------------------+
| HIGH             | 1.000               | 8,948        | 0.8765             | [0.8697, 0.8833]  | -0.1235          |
| MEDIUM           | 0.700               | 1,507        | 0.8228             | [0.8035, 0.8421]  | +0.1228          |
| LOW              | 0.400               | 154          | 0.6429             | [0.5672, 0.7185]  | +0.2429          |
| UNKNOWN          | 0.100               | 6            | 0.8333             | [0.5351, 1.0000]  | +0.7333          |
+------------------+---------------------+--------------+--------------------+-------------------+------------------+
```

**Critical Negative Finding**: As shown in Table III, formal calibration analysis reveals that MedReach's confidence score is an **uncalibrated heuristic ranking** rather than a calibrated probability:
- Brier Score: **0.1315**
- Expected Calibration Error (ECE): **0.1255**
- Maximum Calibration Error (MCE): **0.7333**
- Verdict: `UNBOUNDED_HEURISTIC_RANKING`

The score represents an ordinal source-prioritization weight, not a statistical confidence probability.

### C. RQ3: Data Path & Edge Caching Staleness Audit (EXP-DATAPATH)
**Definitive Verdict: NOT SUPPORTED**.
An architectural audit of 22 deployed endpoints across Vercel and Railway refuted an earlier theoretical concern:
- **Zero Volatile Data in HTML Shells**: Edge-cached HTML shells served with `x-vercel-cache: HIT` (age ~32,000s) contain only static structural skeletons, navigation bars, and placeholder text ("Loading providers..."). They contain **zero** clinical availability counts, bed numbers, or provider database records.
- **Universal Client-Side Runtime Fetching**: All 15 discovery and emergency routes enforce `"use client";` directives. Data fetching occurs strictly in React `useEffect` hooks *after* DOM hydration.
- **Independent Backend Header Policy**: The Express backend operates on Railway, emitting `Cache-Control: no-store` on all transactional endpoints.

Thus, edge caching of static HTML shells does not induce healthcare availability staling.

### D. RQ4: Transactional Reliability & State-Machine Invariants (EXP-TX)
In the master transactional reliability suite, MedReach achieved a **100.0% pass rate (48 passed / 0 failed)**:

```
+---------------------------------------------------------------------------------------------------------+
| TABLE IV: Transactional Reliability & Concurrency Suite Results (EXP-TX)                                 |
+-------------------+-------------------------------------------------------------+-------+--------+------+
| Experiment ID     | Transactional Scenario Evaluated                            | Total | Passed | Pass%|
+-------------------+-------------------------------------------------------------+-------+--------+------+
| EXP-TX-01         | Duplicate Prevention & Scoped Idempotency Keys              |  10   |   10   | 100% |
| EXP-TX-02         | Idempotent Retries & Simulated Timeout Recovery             |   5   |    5   | 100% |
| EXP-TX-03         | Concurrent Requests Competing for State Mutations (OCC)     |   5   |    5   | 100% |
| EXP-TX-04         | Stale-State & Out-of-Order Transition Prevention            |   6   |    6   | 100% |
| EXP-TX-05         | State Machine RBAC & Role Permission Enforcement            |   5   |    5   | 100% |
| EXP-TX-06         | Interrupted In-Flight Operations & Safe Resumption          |   4   |    4   | 100% |
| EXP-TX-07         | Read Consistency During Rapid Concurrent Transitions        |   4   |    4   | 100% |
| EXP-TX-08         | Complete Telemetry-Request Decoupling Ledger                |   6   |    6   | 100% |
+-------------------+-------------------------------------------------------------+-------+--------+------+
| **TOTAL**         | **Master Transactional Reliability Suite**                  | **48**| **48** | 100% |
+-------------------+-------------------------------------------------------------+-------+--------+------+
```

Key guarantees proven:
1. Re-submitting an identical key by the same actor returns `200 OK` with the original document; cross-user reuse is rejected with `409 IDEMPOTENCY_KEY_REUSED`.
2. Under 10-way simultaneous conflicting state transitions, exactly 1 atomic update commits, and 9 receive `409 Conflict`.
3. In EXP-TX-08, submitting 10 emergency requests, accepting 3, and completing 2 did NOT decrement reported availability in `AvailabilityObservation` (remained 5 beds), proving complete architectural decoupling.

### E. RQ5: Isolated Load, Stress, and Recovery Benchmarks (EXP-LOAD)
*Scope Characterization: These measurements represent a single local machine operating across loopback networking (`127.0.0.1`), characterizing architectural throughput and queuing behavior rather than distributed cloud capacity.*

Table V details the performance across baseline, scaling, and stress conditions.

```
+-------------------------------------------------------------------------------------------------------------------------+
| TABLE V: Single-Machine Workload Scaling, Latency Percentiles, and Saturation Behavior                                   |
+-------------------+-------+-------------+-------------+------------+------------+------------+------------+-------------+
| Endpoint / Workload| Concur| Total Reqs  | Throughput  | Median p50 | p90 Latency| p97.5 Lat. | p99 Latency| Error Rate  |
|                   | ($C$) |             | (req/s)     | (ms)       | (ms)       | (ms)       | (ms)       |             |
+-------------------+-------+-------------+-------------+------------+------------+------------+------------+-------------+
| GET /health (Base)| C=1   | 232,720     | 7,052.9     | 0.00       | 0.00       | 0.00       | 0.00       | 0.000%      |
| GET /api/hospitals| C=1   | 9,140       | 284.7       | 3.00       | 3.33       | 8.33       | 9.67       | 0.000%      |
| GET /api/hospitals| C=5   | 11,904      | 396.8       | 11.00      | 18.00      | 21.00      | 23.33      | 0.000%      |
| GET /api/hospitals| C=10  | 12,710      | 397.1       | 23.67      | 30.67      | 35.00      | 38.33      | 0.000%      |
| GET /api/hospitals| C=25  | 11,873      | 395.8       | 62.33      | 70.33      | 76.00      | 78.33      | 0.000%      |
| GET /api/hospitals| C=50  | 12,229      | 394.5       | 124.67     | 139.33     | 147.67     | 152.33     | 0.000%      |
| GET /api/hospitals| C=100 | 3,851       | 385.1       | 260.00     | 278.00     | 290.00     | 297.00     | 0.000%      |
| GET /api/hospitals| C=200 | 3,802       | 380.2       | 510.00     | 550.00     | 591.00     | 597.00     | 0.000%      |
| GET /api/hospitals| C=400 | 3,954       | 395.4       | 982.00     | 1057.00    | 1091.00    | 1163.00    | 0.000%      |
| Peak Surge (50x)  | C=250 | 3,867       | 386.7       | 624.00     | 686.00     | 703.00     | 715.00     | 0.000%      |
| Sustained Soak    | C=30  | 19,117      | 318.6       | 72.00      | 83.00      | 90.00      | 95.00      | 0.160%      |
| Post-Stress Recov.| C=1   | 9,806       | 316.7       | 2.00       | 3.00       | 8.00       | 9.00       | 0.000%      |
+-------------------+-------+-------------+-------------+------------+------------+------------+------------+-------------+
```

Key empirical insights from load testing:
1. **Saturation Knee at $C=50$**: Database-backed read throughput scales from 284.7 req/s at $C=1$ to an architectural saturation knee of ~395 req/s at $C=50$.
2. **Queue Absorption Without Drops**: As concurrency is pushed from $C=100$ to $C=400$, throughput plateaus at 380–395 req/s while the Node.js event loop absorbs excess connections into queue backlog, gracefully scaling median latency from 260.0 ms to 982.0 ms with **0 connection drops and 0 timeouts**.
3. **Surge Resilience & Normalization**: An instantaneous 50x spike ($C=250$, 386.7 req/s) was absorbed without error. Following sustained stress, the system immediately normalized to **2.00 ms median latency** at $C=1$.

---

## VIII. Discussion

### A. The 30-Minute Anchor as a Clinical Safety Governor
Our empirical findings provide compelling theoretical and operational justification for MedReach's 30-minute availability cutoff. In emergency healthcare discovery, the clinical cost of a false positive ("phantom availability") is fundamentally asymmetric to the cost of a false negative ("unknown status"):
- A searcher who receives `"unknown"` is directed to place a phone call or proceed to a major public medical college with high baseline capacity.
- A searcher who receives a false `"available"` indicator may direct an emergency ambulance through dense metropolitan traffic to a facility whose last bed was exhausted an hour earlier, resulting in fatal delay during acute trauma or myocardial infarction.

By capping phantom availability below 0.84% across all scenarios, the 30-minute anchor prevents digital platforms from becoming vectors of misdirection.

### B. Two-Column Architectural Analysis: Demonstrable Guarantees vs. Required Implementation
To ensure complete scientific transparency, Table VI contrasts what the current MedReach architecture demonstrably guarantees versus what still requires implementation for enterprise clinical deployment:

```
+-------------------------------------------------------------------------------------------------------------------------+
| TABLE VI: Demonstrable Architectural Guarantees vs. Required Implementation                                               |
+-------------------------------------------------------------+-----------------------------------------------------------+
| What Current MedReach Architecture Demonstrably Guarantees  | What Still REQUIRES IMPLEMENTATION for Production Scale   |
+-------------------------------------------------------------+-----------------------------------------------------------+
| 1. Strict Idempotent Deduplication by Scope & Key:          | Atomic Multi-Document Distributed Transactions:           |
|    Enforces unique sparse index on sha256(scope:key).       | Cross-collection workflows (EmergencyRequest + AuditLog)  |
|    Re-submitting returns original record (200 OK); cross-   | rely on single-document findOneAndUpdate without multi-   |
|    user reuse is rejected with 409 IDEMPOTENCY_KEY_REUSED.  | document session transactions (startTransaction).         |
+-------------------------------------------------------------+-----------------------------------------------------------+
| 2. Optimistic Concurrency Control (OCC) on Competing State: | In-Flight Mutex / Distributed Lock:                       |
|    Under 10-way concurrency, findOneAndUpdate ensures       | Idempotency keys are persisted directly in MongoDB.       |
|    exactly 1 atomic update succeeds; 9 receive 409 Conflict.| A Redis-based distributed lock (Redlock) with TTL would   |
|    Zero race-condition overwrites or interleaved timelines. | eliminate database unique-index collision overhead.      |
+-------------------------------------------------------------+-----------------------------------------------------------+
| 3. Strict State-Machine Transitions & RBAC Enforcement:     | Dynamic / Configurable State Machine Engine:              |
|    Transitions out of terminal states (REJECTED, CANCELLED) | State transitions are hardcoded as static JavaScript      |
|    are blocked; unauthorized roles receive 403 Forbidden.   | structures. Dynamic multi-facility triage workflows       |
|    Expired requests automatically transition to EXPIRED.    | require code modifications rather than data-driven rules. |
+-------------------------------------------------------------+-----------------------------------------------------------+
| 4. Telemetry-Request Decoupling:                            | Time-To-Live (TTL) Bed Reservation Hold Engine:           |
|    Emergency admissions do not deduct from reported         | The system tracks observational telemetry but lacks an    |
|    AvailabilityObservation quantities. Observations remain  | active 15-minute bed-reservation lock securing beds       |
|    strictly observational; requests require confirmation.   | during physical ambulance transit.                        |
+-------------------------------------------------------------+-----------------------------------------------------------+
| 5. Monotonic Read Consistency During Concurrent Writes:     | Read-After-Write Replica Set Consistency:                 |
|    Across 40 concurrent reads during rapid transitions,     | To guarantee read-after-write consistency across secondary|
|    status was 100% synchronized with the terminal timeline  | read replicas, readConcern: "majority" and writeConcern:  |
|    entry (0 split-brain reads).                             | "majority" must be explicitly configured.                 |
+-------------------------------------------------------------+-----------------------------------------------------------+
```

### C. Corrective and Negative Findings
Scientific progress requires rigorous reporting of hypotheses that failed or assumptions that were corrected:
1. **Correction of Edge Caching Staleness**: An earlier research hypothesis inferred that multi-hour Vercel edge caching presented stale bed counts to searchers. Our empirical audit definitively refuted this: cached HTML shells contain zero volatile capacity data, with all live availability fetched dynamically at runtime.
2. **Confidence Metric Reality**: MedReach's confidence score was previously assumed to represent a probability. Formal calibration analysis proved it is an uncalibrated heuristic ordinal ranking (ECE 0.1255, MCE 0.7333), which must be calibrated via Platt scaling or isotonic regression before being used in formal clinical risk models.

---

## IX. Threats to Validity

- **Construct Validity**: While AoI and throughput are accurately measured, MedReach's heuristic confidence metric does not represent a calibrated Bayesian probability. Interpreting it as a probability would introduce construct invalidity.
- **Internal Validity**: The 22-endpoint datapath audit was conducted on live production endpoints under read-only conditions, preventing synthetic probe bias. Transactional benchmarks evaluated exact API controllers on port 27018 with identical database schemas.
- **External Validity**: Telemetry arrival streams and dropout episodes were generated synthetically. MedReach does not possess live automated API feeds into BMC or MCGM hospital management systems; empirical findings reflect mathematical queueing behavior rather than observed clinical telemetry.
- **Conclusion Validity**: Load and concurrency benchmarks were evaluated in an isolated single-node environment (MongoDB 8.0 on port 27018, Node.js on port 4200). Distributed cluster dynamics, network partitions, and replica lag were not evaluated.

---

## X. Ethical and Data-Governance Considerations

Operating digital platforms in emergency healthcare involves profound ethical responsibilities:
- **Prevention of Misdirection**: The paramount ethical imperative is avoiding directing unstable patients to unavailable facilities. MedReach's conservative fallback to `"unknown"` explicitly prioritizes human safety over platform coverage metrics.
- **Statutory Privacy Compliance**: The platform is architected for strict compliance with the Indian Digital Personal Data Protection (DPDP) Act 2023 and the Ayushman Bharat Digital Mission (ABDM) Health Data Management Policy. Emergency requests enforce field-level redaction, guest tracking uses cryptographic tokens rather than public identifiers, and zero protected health information (PHI) is written to unencrypted logs or client bundles.
- **Prohibition of Unverified Clinical Dispatch**: The platform's API response contracts explicitly classify submissions as requests requiring clinical confirmation rather than guaranteed reservations, preventing false expectations of care.

---

## XI. Limitations

1. **Synthetic Telemetry**: Empirical AoI and fusion evaluations relied on synthetic arrival streams and noise models. While grounded in published literature, they do not replace prospective observational field studies.
2. **Absence of Real-Time Ward IoT Integration**: The platform currently relies on manual staff reporting, scraper feeds, and API webhooks rather than automated bed-sensor telemetry.
3. **Single-Node Benchmark Bounds**: Load and concurrency evaluations were restricted to an isolated single workstation across loopback networking. Multi-region cloud scaling and database replication lag remain uncharacterized.
4. **Heuristic Confidence Metric**: The platform's confidence score requires post-hoc statistical calibration before being integrated into clinical decision-support systems.

---

## XII. Reproducibility and Artifact Availability

To enable full scientific reproducibility, all experimental harnesses, simulation code, raw trial outputs, and figure generation scripts are preserved in the repository:
- **AoI Simulation**: `research/experiments/aoi/simulate_aoi.py`, `research/results/aoi/`
- **Provenance Fusion**: `research/experiments/provenance/`, `research/results/provenance/`
- **Datapath Audit**: `research/results/datapath/datapath-staleness-audit.md`
- **Transactional Suite**: `research/experiments/transactional/run-all-tx-experiments.mjs`, `research/results/transactional/`
- **Load Benchmarks**: `research/results/load/`

Reproduction requires Node.js v24+, Python 3.11+ (NumPy, Matplotlib), and an isolated MongoDB instance on port 27018. The master random seed for all stochastic simulations is fixed at `20261024`.

---

## XIII. Conclusion and Future Work

This paper presented an architectural design and empirical evaluation of MedReach, an open-source, freshness-aware, and provenance-tracked healthcare resource discovery platform for fragmented urban ecosystems. Through rigorous evaluation of Age of Information dynamics, conflicting-claim fusion, edge caching, transactional concurrency, and single-machine load scaling, we demonstrated that MedReach's 30-minute staleness anchor and conservative fallback mechanisms prevent catastrophic phantom availability errors while maintaining high throughput and transactional integrity. By formally establishing the boundaries between current demonstrable guarantees and required future implementations, this work provides a reproducible, evidence-based blueprint for the next generation of resilient urban emergency health informatics.

Future work will focus on:
1. Implementing Platt scaling and isotonic regression to calibrate the heuristic confidence metric.
2. Developing HL7 FHIR ingestion gateways to connect directly with hospital electronic health record (EHR) systems.
3. Implementing an active two-way `ReservationHold` entity with automatic 15-minute TTL locks to secure beds during ambulance transit.
4. Executing institutional data-sharing agreements with municipal authorities to conduct prospective clinical field trials.

---

## References

*(Full verified bibliography containing 46 cited references formatted according to IEEE standards in `references.bib`)*
