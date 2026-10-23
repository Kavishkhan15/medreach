import os

target_path = "/home/anonymous/medreach/docs/research/medreach-healthcare-access/research-proposal.md"

content = """# Research Proposal: Freshness-Aware Resource Discovery and Transactional Coordination in Fragmented Urban Healthcare Systems

**Document identifier**: `research-proposal`  
**Target repository path**: `/home/anonymous/medreach/docs/research/medreach-healthcare-access/research-proposal.md`  
**Project**: MedReach Academic Research Programme  
**Target audience**: Academic Research Supervisor, Institutional Ethics Committee, and Project Governance Board  
**Date of record**: 2026-10-23  
**Author / Specialist**: MedReach Research Programme Team  
**Operational status**: Formal Research Proposal and Methodological Roadmap (Pre-Experimental Phase)  

---

## 1. Title, executive summary, and problem statement

### 1.1 Working Title
> **Freshness-Aware Resource Discovery and Transactional Coordination in Fragmented Urban Healthcare Systems: An Architectural Evaluation in Mumbai**

### 1.2 Abstract-Style Summary
Urban emergency healthcare in low- and middle-income countries (LMICs) suffers from severe informational friction. While critical resources—such as intensive care unit (ICU) beds, specialized blood components, and emergency ambulances—exist across fragmented municipal, charitable, and private facilities, patients experience acute search delays, secondary ambulance diversions, and preventable clinical deterioration. Existing digital health platforms address this challenge either through static directories or unconfirmed, self-reported numerical counts. In high-turnover emergency environments, these asynchronous numbers decay rapidly into "phantom networks," where listed availability does not translate into physical clinical intake.

This research proposal establishes a multi-track investigation centered on the MedReach platform. The study evaluates:
1. Continuous Age of Information (AoI) decay modeling and multi-source provenance fusion for emergency resource discovery.
2. Lightweight transactional hold coordination designed to bridge the operational gap between asynchronous visibility and confirmed clinical intake.
3. Client-side presentation efficiency across three distinct architectural variants sharing a common headless domain core.

The proposal synthesizes an evidence base of 52 verified academic and institutional sources, establishes explicit research questions with falsifiable hypotheses, outlines an isolated laboratory evaluation design, defines statutory privacy and ethical boundaries in India, and provides a phased roadmap with clear decision gates.

### 1.3 The Problem in Plain Language
When an individual suffers an acute medical emergency (such as severe trauma, acute respiratory failure, or obstetric hemorrhage) in the Mumbai metropolitan region, the family or attending physician must quickly answer three practical questions:
1. Which nearby hospital has a vacant, staffed ICU or oxygen bed right now?
2. Which blood bank has compatible blood components available on the shelf?
3. How can an emergency ambulance be routed to that facility without being turned away at the casualty gate?

In practice, the answers are obscured. Public municipal teaching hospitals are frequently crowded beyond 100% capacity, while peripheral municipal general hospitals and private nursing homes may have open beds that are invisible to the public. Blood availability reported on national web portals is often hours out of date, meaning listed units have already been cross-matched or issued. Families spend the critical "golden hour" making telephone calls, relying on informal social media appeals, or traveling physically between hospital casualty gates in an auto-rickshaw or ambulance. 

The core problem is not merely an absolute shortage of medical equipment; it is an informational coordination failure where volatile, life-critical availability data decays faster than existing directories update, and where no open, lightweight system exists to confirm intake before the patient arrives.

---

## 2. Validated primary research gap and competitive platform analysis

### 2.1 The Validated Primary Research Gap
Following rigorous competitive benchmarking (`02-existing-platforms-comparison.md`) and gap challenge analysis (`06-research-gap-and-novelty-assessment.md`), the primary evidence-supported research gap is defined as:

> **The Asynchronous Visibility Dilemma in Urban Emergency Resource Discovery:**  
> Existing digital healthcare platforms in fragmented metropolitan environments operate either as static directory listings (Tier 1/2) or as asynchronous, unconfirmed self-reported counts (Tier 3). In acute medical crises, this creates a structural gap between reported availability and operational intake (Tier 4), resulting in secondary inter-facility transfers, search delays, and phantom network navigation. There is an absence of validated, open systems that combine continuous Age-of-Information decay modeling, multi-source provenance fusion, and lightweight two-way transactional confirmation into a unified, cross-category discovery architecture.

### 2.2 Why the Gap Survived Critical Challenge
The research gap survived critical challenge because it avoids making false claims of total absence while targeting a verified operational bottleneck:
1. **Rejection of the "No Platform Exists" Fallacy**: The proposal does not claim that Mumbai lacks digital healthcare platforms. Multiple public and commercial platforms operate in Mumbai. The gap focuses specifically on the *epistemological and operational tier* at which these platforms function.
2. **The Fragility of Tier 3 Self-Attestation**: Literature on provider directory accuracy (Haeder & Zhu 2024, 2025; Elton & Xu 2024) proves that passive self-reported directories decay into 30%–50% error rates. In emergency care, an inaccurate listing is clinically hazardous.
3. **The Post-Pandemic Labor Chasm**: During the COVID-19 pandemic, Mumbai successfully achieved confirmed Tier 4 bed allocation by deploying 24 municipal Ward War Rooms staffed 24/7 by medical officers who manually called hospitals to confirm every bed before dispatching an ambulance (MCGM 2021). Post-crisis, this human labor became unsustainable. The unresolved challenge is whether software protocols can provide confirmed transactional coordination without permanent call-center overhead.

### 2.3 Competing Systems and What They Genuinely Deliver
To maintain empirical honesty, existing systems are evaluated based on verified evidence (`02-existing-platforms-comparison.md`):

| Existing Platform / System | Operating Entity | What It Genuinely Delivers | Operational Boundary and Unresolved Gap |
| :--- | :--- | :--- | :--- |
| **e-RaktKosh** (`eraktkosh.in`) | MoHFW / C-DAC, Government of India | Centralized web directory of registered blood banks; publishes periodic stock counts by blood group across 3,500+ blood centers. | Stock updates rely on manual web batch entry; updates lag by 12–48 hours in peripheral centers. Lacks patient reservation, real-time hold requests, or emergency replacement donor matching. |
| **ABDM Health Facility Registry (HFR)** | National Health Authority (NHA) | Authoritative national registry assigning unique Health Facility IDs (HFIDs); standardizes administrative addresses, geocodes, and service categories. | Functions as a static institutional registry (Tier 1/2). Does not track dynamic operational status (e.g., active ICU bed occupancy) or provide consumer emergency routing. |
| **BMC Citizen Health Portal** (`bmchealth.in`) | Municipal Corporation of Greater Mumbai | Public portal listing municipal dispensaries, maternity homes, and specialized hospitals; provides OPD schedules and administrative details. | Static institutional catalog. Does not integrate private corporate hospitals, lacks live bed occupancy feeds, and does not support transactional holds. |
| **BMC Ward War Rooms** (Disaster Infrastructure) | MCGM / Public Health Department | Centralized municipal triage and bed allocation deployed during COVID-19 surges; matched lab-confirmed patients to staffed beds via ward dashboards. | Required high municipal physician staffing; discontinued for routine non-pandemic emergency admissions. |
| **Maharashtra Emergency Medical Services (MEMS 108)** | Government of Maharashtra / BVG India | Toll-free emergency ambulance dispatch; dispatchers communicate with public casualty wards via closed voice channels. | Closed telephone dispatch system; operational facility status is invisible to citizens and private clinics. Cannot reserve private ICU beds or blood units. |
| **Commercial Aggregators** (Practo, Apollo 24/7) | Private Corporate Platforms | Outpatient appointment booking, telemedicine consultations, and home pharmaceutical delivery. | Commercial directories optimized for elective outpatient care. Explicitly exclude acute emergency casualty triage, public hospital beds, and real-time blood bank inventory. |

---

## 3. Structural organization: Rationale for study partitioning

The research programme resolves the structural question evaluated in `06-research-gap-and-novelty-assessment.md` by adopting a **two-output partitioned structure** rather than a single monolithic paper:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      TWO-OUTPUT RESEARCH PROGRAMME ARCHITECTURE                         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  OUTPUT 1: HEALTHCARE ACCESS & INFORMATICS STUDY (PRIMARY FOCUS)                       │
│  - Focus: Urban emergency resource discovery, Age of Information decay modeling,       │
│           multi-source provenance fusion, and two-way transactional hold mechanics.   │
│  - Methodology: Algorithmic simulation, concurrency stress testing, spatial analysis.  │
│  - Target Venues: Health informatics and services research journals                    │
│                   (e.g., JMIR Medical Informatics, BMC Health Services Research).      │
│                                                                                        │
│  OUTPUT 2: EMPIRICAL SOFTWARE ENGINEERING CASE STUDY (SECONDARY FOCUS)                 │
│  - Focus: Clone-and-own evolutionary frontend porting, presentation boundary drift,    │
│           logic leakage into UI shells, and small-N maintainability profiling.         │
│  - Methodology: AST inspection, code complexity metrics, laboratory performance.      │
│  - Target Venues: Software engineering venues (e.g., IEEE Software, ACM ESEM, JWE).    │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Rationale for Partitioning
1. **Reviewer and Disciplinary Alignment**: Health informatics reviewers evaluate clinical validity, triage safety, and urban health disparities; they view comparative analyses of Tailwind PostCSS compilation and Bootstrap bundle sizes as irrelevant technical clutter. Conversely, software engineering reviewers evaluate clone-and-own maintainability and AST complexity, viewing the Mumbai healthcare domain as an incidental application.
2. **Methodological Rigor**: Combining both themes into one manuscript dilutes the primary healthcare gap and forces awkward, unconvincing transitions between emergency patient survival and CSS framework ergonomics. Partitioning ensures that each output maintains clear disciplinary depth.

---

## 4. Research questions and measurable outcomes

Cross-referencing the formal inquiry classifications in `07-research-questions-and-hypotheses.md`, the primary healthcare access study addresses five specific questions across inferential hypotheses and descriptive case propositions:

```
+-------------------------------------------------------------------------------------------------------+
| RESEARCH QUESTIONS, HYPOTHESES, AND MEASURABLE OUTCOMES                                               |
+---------+-----------------------------------+-----------------------------+---------------------------+
| Inquiry | Domain Focus                      | Epistemological Status      | Measurable Target Outcome |
+---------+-----------------------------------+-----------------------------+---------------------------+
| **RQ1** | Information Freshness & Ranking   | Algorithmic Simulation      | Rank displacement,        |
|         |                                   | (Falsifiable Hypotheses)    | Spearman's rank rho       |
| **RQ2** | Transactional Concurrency Safety  | Synthetic Stress Benchmark  | Double-allocation rate,   |
|         |                                   | (Falsifiable Hypotheses)    | 409 Conflict error rate   |
| **RQ3** | Multi-Source Provenance & Quality | Descriptive Empirical Audit | Discrepancy rate,         |
|         |                                   | (Grounded Case Proposition) | Confidence tier entropy   |
| **RQ4** | Spatial Accessibility & Equity    | Exploratory Spatial Analysis| Spatial Gini coefficient, |
|         |                                   | (Grounded Case Proposition) | Travel time disparity     |
| **RQ5** | Presentation Boundary Drift (SE)  | Descriptive Case Study (N=3)| AST similarity index,     |
|         |                                   | (Grounded Case Proposition) | Cognitive complexity churn|
+---------+-----------------------------------+-----------------------------+---------------------------+
```

### 4.1 Detailed Formulations
- **RQ1 (Information Freshness and Ranking)**:
  - *Question*: How does continuous Age of Information (AoI) decay modeling displace facility rankings compared to conventional static distance sorting?
  - *Falsifiable Hypotheses*:
    - $H_{0,1}$: Deterministic AoI decay produces zero rank displacement ($\text{RankDisplacement} = 0$, Spearman's $\rho = 1.0$).
    - $H_{1,1}$: Deterministic AoI decay produces significant rank displacement ($\text{RankDisplacement} > 0$, Spearman's $\rho < 0.85$), systematically demoting stale facilities ($AoI > 60\text{ min}$) in favor of freshly verified capacity.
- **RQ2 (Transactional Concurrency Safety)**:
  - *Question*: Does the integration of cryptographic idempotency keys and state-locking middleware eliminate double-allocation during concurrent reservation spikes for scarce medical resources?
  - *Falsifiable Hypotheses*:
    - $H_{0,2}$: Concurrent hold requests under high contention ($N \ge 50$ requests/sec) result in double-allocation rates exceeding 0.0%.
    - $H_{1,2}$: Mutex-locked transactional hold processing guarantees exactly-once allocation with a 0.0% double-allocation rate, converting excess attempts to deterministic `409 Conflict` responses.
- **RQ3 (Multi-Source Provenance and Quality)**:
  - *Proposition P1*: Multi-source fusion reconciling statutory registries (HFR), provider self-attestation, and community verification will identify a baseline discrepancy rate exceeding 25% across facility capability fields.
- **RQ4 (Spatial Accessibility and Equity)**:
  - *Proposition P2*: Travel impedance modeling across Mumbai's 24 municipal wards will demonstrate that acute hospital capacity is concentrated in southern and central wards, leaving eastern and northern suburban informal settlements with travel time disparities exceeding 45 minutes during peak traffic.
- **RQ5 (Presentation Boundary Drift - SE Output)**:
  - *Proposition P3*: In clone-and-own frontend evolution, business logic isolated in a headless core (`@medreach/core`) experiences progressive leakage into presentation components, resulting in measurable AST divergence across variants over time.

---

## 5. System design summary: Exists versus proposed

In strict accordance with the code audit (`01-medreach-code-and-feature-audit.md`), existing and proposed architectural elements are separated:

```
+---------------------------------------------------------------------------------------------------+
| MEDREACH ARCHITECTURAL BASELINE: CURRENT REALITY VS. PROPOSED EXTENSIONS                          |
+---------------------------------------------------------------------------------------------------+
|  WHAT CURRENTLY EXISTS IN CODEBASE (VERIFIED)                                                     |
|                                                                                                   |
|  1. Shared Express Backend (@medreach/backend, port 4000):                                        |
|     - 136 JavaScript files (11,089 physical LOC) providing complete REST API.                    |
|     - Mongoose models: User, Hospital, Resource, EmergencyRequest, BloodBank.                     |
|     - Middlewares: JWT authentication, Role-Based Access Control, Helmet security headers,        |
|       multi-tier rate limiting, input sanitization, idempotency verification.                     |
|     - Background workers: Email outbox queue, automated request expiration timers.                |
|                                                                                                   |
|  2. Shared Core Frontend Logic (@medreach/core):                                                  |
|     - 20 JavaScript files (1,828 physical LOC) containing isomorphic business logic.              |
|     - In-flight HTTP request deduplication (pendingReads Map), session refresh state machine.     |
|     - Deterministic freshness calculation and Age of Information status mapping.                  |
|     - Spatial filtering, Haversine distance calculations, and formatting helpers.                 |
|                                                                                                   |
|  3. Three Functional Frontend Variants (variants/bootstrap, tailwind, skeleton):                 |
|     - 39 identical route paths implemented across all three variants (40 JS files per variant).   |
|     - Full presentation layer for hospital search, bed requests, blood banking, and tracking.     |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|  WHAT IS PROPOSED FOR FUTURE PHASES (NOT YET BUILT / REQUIRES APPROVAL)                           |
|                                                                                                   |
|  1. Two-Way Provider Hold Confirmation Protocol:                                                  |
|     - Lightweight webhook/SMS confirmation bridge allowing provider casualty nurses to confirm     |
|       or decline a hold request with a single tap, transitioning state from Tier 3 to Tier 4.     |
|  2. Live Government Registry Ingestion Adapters:                                                  |
|     - Automated synchronization adapters for ABDM Health Facility Registry and e-RaktKosh APIs.   |
|  3. Real-Time Push Invalidation Engine:                                                           |
|     - Server-Sent Events (SSE) or WebSockets push channel to replace client polling.              |
|  4. Automated Directory Reachability Auditor:                                                     |
|     - Background worker executing scheduled telephone reachability pings to detect dead numbers.  |
|  5. Multilingual Assisted Navigation Bot:                                                         |
|     - Directory-grounded triage chatbot supporting Hindi and Marathi for low-literacy users.      |
+---------------------------------------------------------------------------------------------------+
```

---

## 6. Evaluation design across three research tracks

The empirical evaluation is organized across three complementary tracks, grounded in the methodology specifications (`09`, `10`, `11`, `13`):

### 6.1 Track 1: Algorithmic Simulation and Ranking Evaluation (RQ1, RQ4)
- **Objective**: Evaluate the impact of continuous AoI decay modeling on emergency facility ranking and measure spatial accessibility disparities across Mumbai.
- **Methodology**: 
  - A discrete-event simulation replaying 24 hours of synthetic bed occupancy and blood unit consumption across 60 simulated healthcare facilities in Mumbai's 24 administrative wards.
  - Compares facility rank order under: (a) pure geographic Haversine distance, (b) static provider tiering, and (c) MedReach AoI-penalized score ($S = \text{Score} \cdot e^{-\lambda \cdot AoI}$).
- **Metrics**: Spearman's rank correlation coefficient ($\rho$), top-3 rank displacement frequency, wasted travel distance (km), and ward-level spatial Gini coefficients.

### 6.2 Track 2: Backend Reliability and Concurrency Stress Benchmark (RQ2)
- **Objective**: Verify transactional hold safety, zero double-allocation, and rate limiter efficacy under concurrent emergency load spikes.
- **Methodology**:
  - Executed strictly in an **isolated local laboratory testbed** (dedicated local MongoDB on port 27018, isolated Express instance).
  - Synthetic load generation using k6/Autocannon simulating 50 to 500 concurrent hold requests targeted at a single remaining ICU bed fixture.
- **Metrics**: Double-allocation count (must equal 0), rate of deterministic `409 Conflict` responses, idempotency replay accuracy (identical response on duplicate key), and p95/p99 transaction latency.

### 6.3 Track 3: Presentation Efficiency and Software Maintainability Case Study (RQ5)
- **Objective**: Profile client-side performance, resource consumption, and structural code divergence across the three frontend variants sharing the Express backend.
- **Methodology**:
  - Executed on a bare-metal desktop testbed with headless Chromium via Playwright, enforcing static traffic shaping (Slow 4G, CPU 4x slowdown).
  - AST parsing using Babel to quantify component tree depth, prop passing complexity, and code duplication.
- **Metrics**: Lighthouse performance score, First Contentful Paint (FCP), Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), JavaScript bundle transfer size (kB), DOM node count, and Halstead / Cognitive Complexity churn.

---

## 7. Status of empirical measurements: Performed versus pending

In strict compliance with `16-experimental-results.md` and project integrity standards, the boundary between completed measurements and pending experiments is explicit:

```
+-------------------------------------------------------------------------------------------------------+
| EMPIRICAL MEASUREMENT STATUS AUDIT                                                                    |
+-----------------------------------+-------------------+-----------------------------------------------+
| Measurement Activity              | Current Status    | Evidentiary Basis / Verification Reference    |
+-----------------------------------+-------------------+-----------------------------------------------+
| Static Codebase & Route Audit     | **COMPLETED**     | `01-medreach-code-and-feature-audit.md`       |
| Existing Platforms HTTP Audit     | **COMPLETED**     | `02-existing-platforms-comparison.md`         |
| Academic Literature Verification  | **COMPLETED**     | `03`, `04`, `05`, `references-health.bib`     |
| Passive Vercel Edge Observations  | **COMPLETED**     | `16-experimental-results.md` (Part A)         |
| AST Structural Parity Audit       | **COMPLETED**     | `01`, `11-backend-reliability-evidence.md`    |
| Dependency Vulnerability Audit    | **COMPLETED**     | `11-backend-reliability-evidence.md`          |
| Multi-Variant Local Benchmark Run | `NOT PERFORMED`   | Requires isolated testbed setup (Part B)      |
| Concurrency Hold Stress Benchmark | `NOT PERFORMED`   | Strictly prohibited on production (Part B)    |
| Real-Time AoI Simulation Trace    | `NOT PERFORMED`   | Requires trace runner execution (Part B)      |
| Human User Usability Study        | `NOT PERFORMED`   | Strictly blocked pending IEC ethics approval  |
| Clinical Field Evaluation         | `NOT PERFORMED`   | Strictly blocked pending IEC & hospital MoUs  |
+-----------------------------------+-------------------+-----------------------------------------------+
```

All unperformed experiments are formally designated as `NOT YET MEASURED`. Zero speculative numbers, simulated p-values, or synthetic participant scores appear in this proposal.

---

## 8. Implementation changes genuinely required before experiments run

To execute the planned laboratory benchmarks without violating safety rules or compromising the owner's active working tree, a prioritized list of implementation tasks is defined. **Each task requires explicit owner approval prior to execution.**

```
+-------------------------------------------------------------------------------------------------------+
| PRIORITIZED IMPLEMENTATION TASKS REQUIRED FOR BENCHMARK EXECUTION                                     |
+------+------------------------------------------+----------+-------------+----------------------------+
| Prio | Task Description                         | Scope    | Est. Effort | Safety & Approval Note     |
+------+------------------------------------------+----------+-------------+----------------------------+
| **1**| **Isolated Laboratory Testbed Setup**     | Dev/Ops  | 2–3 Days    | Creates separate local DB  |
|      | Shell script to launch isolated MongoDB  |          |             | on port 27018 with mock    |
|      | on dedicated port with synthetic seed    |          |             | data. Owner approval req.  |
| **2**| **k6 Concurrency Stress Test Harness**   | Scripts  | 2 Days      | Standalone load script     |
|      | Scripts simulating concurrent hold spikes|          |             | targeting local testbed    |
|      | to validate idempotency and mutex locks  |          |             | only. Owner approval req.  |
| **3**| **Trace-Driven AoI Ranking Simulator**   | Tools    | 2–3 Days    | Python/Node script to      |
|      | Batch simulator evaluating AoI ranking   |          |             | replay 24-hr occupancy     |
|      | displacement across simulated facilities |          |             | data. Owner approval req.  |
| **4**| **Automated Playwright Benchmark Runner**| Scripts  | 2 Days      | Standardized harness to    |
|      | Local test runner capturing CDP metrics, |          |             | capture throttled client   |
|      | FCP, LCP, and DOM depth without network  |          |             | runs. Owner approval req.  |
| **5**| **Sanitized Telemetry Exporter**         | Backend  | 1 Day       | Exporter to dump JSON      |
|      | Utility to export aggregated benchmark   |          |             | metrics with zero PII or   |
|      | metrics with zero credentials/tokens     |          |             | secrets. Owner approval req|
+------+------------------------------------------+----------+-------------+----------------------------+
```

---

## 9. Ethics and data governance prerequisites

Based on the statutory analysis in `14-data-governance-and-ethics.md`, research activities are governed by Indian legal frameworks, including the Digital Personal Data Protection Act 2023 (DPDPA 2023), the Information Technology Act 2000 & SPDI Rules 2011, the ABDM Health Data Management Policy, and the ICMR National Ethical Guidelines (2017).

### 9.1 Mandatory Prerequisites Before Human-Participant Studies
Before recruiting human participants, interviewing patients, or testing with real clinical emergency seekers:
1. **Institutional Ethics Committee (IEC) Clearance**: Formal written protocol approval from an ICMR-registered ethics committee.
2. **Operationalized Consent Management**: Multilingual Participant Information Sheets (PIS) and Informed Consent Forms (ICF) in Marathi, Hindi, and English conforming to DPDPA Section 6 and ICMR Chapter 5.
3. **Data Protection Impact Assessment (DPIA)**: An independent security audit of data flows, encryption at rest (AES-256), and transport security (TLS 1.3).
4. **Institutional Memoranda of Understanding (MoUs)**: Formal data-sharing agreements with participating municipal or private hospitals.

### 9.2 Activities Strictly Blocked Pending Approval
- **BLOCKED**: Enrolling real patients, distress callers, or vulnerable community members.
- **BLOCKED**: Collecting, logging, or storing real clinical diagnoses, medical history, or personal identifiers.
- **BLOCKED**: Routing live emergency medical patients based on prototype recommendations.
- **BLOCKED**: Testing fault-injection or denial-of-service simulations on production infrastructure.

### 9.3 Confidentiality and Safety Affirmation
The research programme maintains an absolute privacy safeguard:
- **Zero Real User Data**: No real patient records, personal addresses, or live emergency requests exist in research datasets.
- **Zero Secrets**: No production database URIs, JWT signing secrets, SMTP credentials, or authentication tokens appear in research documents, logs, or outputs.

---

## 10. Summary of risks, limitations, and threats to validity

Cross-referencing `17-threats-to-validity-and-limitations.md`, the study's core methodological boundaries are summarized:

1. **Construct Validity**:
   - *Shared Backend Constant*: All variants query the identical Express backend on port 4000. Client-side measurements reflect presentation rendering and bundle size, not server efficiency.
   - *Feature Non-Equivalence*: Subtle differences in hook bindings and container DOM nesting across clone-and-own variants confound pure framework styling comparisons.
2. **Internal Validity**:
   - *Sequential Implementation Collinearity*: Variants were developed sequentially (`bootstrap` $\rightarrow$ `tailwind` $\rightarrow$ `skeleton`). Developer learning curve and progressive refactoring are collinear with framework choice, precluding causal attribution.
   - *Hosting and CDN Confounders*: Public Vercel edge observations reflect varying deploy dates, edge caching, and dynamic compression; they serve as descriptive snapshots only.
3. **External Validity**:
   - *Small-$N$ Software Sample ($N=3$)*: Findings from three specific codebases cannot be generalized to the population of all web applications.
   - *Mumbai Context Specificity*: Municipal administrative structures (24 wards) and unique public-private dual care-seeking patterns in Mumbai limit direct generalization to rural regions or single-payer health systems.
   - *Provider Reporting Latency*: Prototype tests assume reliable availability inputs; in production, provider reporting delays (documented at 30%–50% in literature) represent an operational bottleneck.
4. **Conclusion Validity**:
   - *Clinical Outcome Gap*: Software performance optimization (e.g., faster LCP) cannot be claimed to reduce clinical mortality without prospective clinical trials.

---

## 11. Timeline of phases with decision gates

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   RESEARCH PROGRAMME ROADMAP                                           │
├───────────────────┬──────────────────────────────────────────┬─────────────────────────────────────────┤
│ Phase             │ Key Milestone Objectives                 │ Mandatory Decision Gate                 │
├───────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────┤
│ **Phase A**       │ Methodological framing, code audit,      │ **GATE 1: Dossier Approval**            │
│ (Current)         │ literature synthesis, proposal drafting. │ Supervisor and governance sign-off on   │
│                   │ Status: Completed.                       │ scientific scope and gap boundaries.    │
├───────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────┤
│ **Phase B**       │ Isolated laboratory testbed deployment,  │ **GATE 2: Bench Safety Review**         │
│ (Months 1–2)      │ synthetic fixture generation, k6 stress  │ Verification that load tests ran on     │
│                   │ testing, AoI ranking simulation traces.  │ isolated testbed with zero leaks.       │
├───────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────┤
│ **Phase C**       │ Institutional Ethics Committee (IEC)     │ **GATE 3: Formal IEC Clearance**        │
│ (Months 2–4)      │ protocol submission, multilingual PIS/ICF│ Written ethical clearance certificate   │
│                   │ preparation, clinical safety audit.      │ from ICMR-registered committee.         │
├───────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────┤
│ **Phase D**       │ Pilot usability testing with healthy     │ **GATE 4: Usability Review**            │
│ (Months 4–6)      │ volunteers and authorized hospital staff │ Audit of task completion rates and      │
│                   │ using non-production sandbox data.       │ confirmation workflow usability.        │
├───────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────┤
│ **Phase E**       │ Observational hospital intake pilot,     │ **GATE 5: Publication Clearance**       │
│ (Months 6–9)      │ data reconciliation, manuscript drafting │ Independent audit confirming zero       │
│                   │ for Output 1 (Health) and Output 2 (SE). │ over-claims and full reproducibility.   │
└───────────────────┴──────────────────────────────────────────┴─────────────────────────────────────────┘
```

---

## 12. Closing readiness recommendation

### Scientific and Technical Verdict
**The MedReach research programme is METHODOLOGICALLY READY FOR CONTROLLED LABORATORY BENCHMARKING (Phase B), but REMAINS STRICTLY EMBARGOED FROM HUMAN-SUBJECT TESTING (Phase D/E).**

### Actionable Next Steps (Immediate Priorities)
1. **What Is Ready to Proceed Immediately (Phase B)**:
   - Implementation of the isolated laboratory testbed harness (local MongoDB on port 27018, synthetic seed fixtures).
   - Execution of the automated k6 concurrency stress suite to evaluate transactional hold mechanics.
   - Execution of the AoI ranking simulation trace across synthetic Mumbai ward capacity datasets.
   - Execution of local, throttled Playwright client profiling across the three frontend variants.
2. **What Must Be Formally Approved First**:
   - *Owner Authorization*: The project owner must formally approve the prioritized implementation tasks listed in Section 8 before code changes occur.
   - *Ethics Submission*: The research team must prepare the formal IEC dossier for Phase C submission.
3. **Commitment to Integrity**:
   - All experimental outputs will maintain absolute transparency: unperformed tests will remain marked as `NOT YET MEASURED`, and findings will remain grounded in verifiable code and literature evidence.
"""

with open(target_path, "w", encoding="utf-8") as f:
    f.write(content.strip())
    f.write("\n")

print(f"Research proposal generated at: {target_path}")
