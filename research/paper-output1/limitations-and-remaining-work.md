# Limitations and Remaining Work: MedReach Research Output 1
**Document Identifier**: `OUTPUT1-LIMITATIONS-AND-REMAINING-WORK`  
**Manuscript**: Freshness-Aware, Provenance-Tracked Healthcare Resource Discovery in Fragmented Urban Ecosystems  
**Author**: Primary Manuscript Author  
**Target Repository**: `/home/anonymous/medreach`  
**Date**: 2026-10-24  

---

## 1. Explicit Disclaimers & Integrity Boundaries

In strict adherence to the research integrity rules set forth in `_common2.md` and `brief-ms1.md`, the following boundaries are established for all readers, peer reviewers, and engineering teams:

### 1.1 Synthetic Nature of Evaluated Telemetry
- **Synthetic Simulation Labeling**: All Age of Information (AoI) arrival sequences, provider dropout patterns, and continuous-time Markovian capacity shifts evaluated in Section V-A are **100% SYNTHETIC**.
- They are mathematical models parameterized by queueing theory and published operational cadence (e.g., nursing shift handovers, bursty emergency surges, and batch scraper delays). They do **NOT** represent telemetry harvested from live hospital admission feeds.
- The multi-source provenance fusion evaluation (Section V-B) similarly executes on a **seeded synthetic testbed of 40,000+ generated trials** with known ground truth to stress-test conflict detection and priority cascades under controlled noise and dropout.

### 1.2 Absence of Live Physical Hospital Database Integration
- **No Live Wards Connected**: MedReach does **NOT** currently maintain live, authenticated bi-directional database integrations with physical Municipal Corporation of Greater Mumbai (MCGM) tertiary hospitals, peripheral civic centers, or state blood banks.
- The platform incorporates real directory schemas, web scraper adapters for public portals (e.g., BMC health, e-RaktKosh), and seed fixtures representing Mumbai healthcare infrastructure, but active ward telemetry depends on future institutional data-sharing agreements and API standardization.

### 1.3 Zero Clinical Outcome Claims
- This research is an **informatics, systems architecture, and transactional reliability study**.
- **No clinical outcomes were measured**: The study does not evaluate patient survival, triage mortality reduction, morbidity, secondary transfer rates, or emergency response times in civilian transit.
- It licenses only software engineering and information-theory conclusions regarding data freshness bounds, conflict detection accuracy, request idempotency, and state-machine integrity.

---

## 2. Documented Negative & Corrective Findings

### 2.1 The Edge-Caching Staleness Hypothesis (Corrected: NOT SUPPORTED)
- **Prior Hypothesis**: Earlier research drafts hypothesized that Vercel edge caching of prerendered HTML shells with multi-hour retention (`age: 24,496–32,596 seconds`, ~6.8–9.0 hours) presented stale bed counts to emergency patients.
- **Empirical Audit Verdict**: **NOT SUPPORTED**. Exhaustive inspection of the Next.js frontend bundles across all three UI variants (`bootstrap`, `tailwind`, `skeleton`) and live HTTP header probing revealed that prerendered HTML shells contain **zero volatile capacity numbers**. They deliver empty DOM structural shells and navigation chrome; all healthcare resource data is fetched dynamically at runtime via client-side React hooks (`useEffect`) against the Express API.
- **Scientific Value**: This negative finding corrects earlier assumptions and demonstrates that MedReach’s decoupled client-fetch architecture inherently mitigates the edge-staling risk common in static site generation (SSG).

### 2.2 Confidence Metric Calibration Deficiency
- **Empirical Finding**: MedReach’s confidence ratings (`HIGH`, `MEDIUM`, `LOW`) exhibit an Expected Calibration Error (ECE) of **0.1255** and Maximum Calibration Error (MCE) of **0.7333** across 10,615 resolved claims.
- **Assessment**: The confidence score functions as an **uncalibrated heuristic ordinal ranking**, not a posterior probability. For instance, `HIGH` confidence claims achieve an empirical accuracy of 87.65% (below nominal 100%), while `MEDIUM` claims achieve 82.28% (above nominal 70%).

---

## 3. Two-Column Architectural Analysis: Current Guarantees vs. Remaining Work

The transactional reliability suite (`EXP-TX-01` through `EXP-TX-08`, 48 assertions, 100% pass rate) established clear architectural boundaries:

| What Current MedReach Architecture Demonstrably Guarantees | What Still REQUIRES IMPLEMENTATION for Production Readiness |
| :--- | :--- |
| **1. Strict Idempotent Request Deduplication**:<br>Enforces unique sparse indexes on `sha256(scope:key)`. Identical client retries return original documents with `200 OK`; cross-user key theft is blocked with `409 IDEMPOTENCY_KEY_REUSED`. | **Atomic Multi-Document Distributed Transactions**:<br>Application logic coordinates cross-collection workflows (e.g. updating `EmergencyRequest` while writing `AuditLog`). A failure during the second write leaves the first committed without an automatic two-phase commit or transactional Saga rollback. |
| **2. Safe In-Flight Timeout Recovery**:<br>Client disconnections during submission recover cleanly upon retry without duplicate document insertion or ghost state in MongoDB. | **Distributed TTL-Based In-Flight Mutex**:<br>Idempotency hashes are permanently persisted in document models. An in-memory or Redis-based distributed mutex with TTL would reduce MongoDB unique-index collision overhead under extreme burst traffic. |
| **3. Optimistic Concurrency Control (OCC)**:<br>Concurrent competing state transitions use atomic `findOneAndUpdate` checking prior status and timeline length. Exactly 1 request commits; N-1 conflicting requests receive `409 Conflict`. | **Client-Side Conflict Resolution Protocols**:<br>The backend returns `409 Conflict` and relies on the user or client to refresh. Implementing HTTP `ETag` / `If-Match` headers or WebSocket conflict broadcasts would streamline triage coordination for hospital desks. |
| **4. Strict State-Machine RBAC & Transition Invariants**:<br>Terminal states (`REJECTED`, `CANCELLED`, `COMPLETED`) cannot be mutated; expired requests auto-finalize; unauthorized actors receive `403 Forbidden`. | **Configurable Data-Driven Workflow Engine**:<br>Transition graphs are hardcoded static JavaScript objects. Supporting customized municipal protocols (e.g., secondary triage stages or pediatric transfers) currently requires code refactoring. |
| **5. Monotonic Read Consistency**:<br>Repeated reads during concurrent writes maintain 100% synchronization between document status and timeline history without split-brain anomalies. | **Replica Set Majority Read/Write Concerns**:<br>In distributed multi-node MongoDB deployments, explicit `readConcern: "majority"` and `writeConcern: { w: "majority" }` must be configured to guarantee linearizability across read secondaries. |
| **6. Complete Telemetry-Request Decoupling**:<br>Submitting or accepting emergency requests does not alter `AvailabilityObservation` values, preventing point-in-time capacity reports from acting as unverified reservations. | **Active Reservation & Bed-Hold Mechanism with TTL**:<br>Because availability is purely observational, the system lacks a temporary "reservation hold" (e.g., a 15-minute bed lock while an ambulance is en route). A formal `Reservation` entity with TTL expiration is required to bridge discovery and admission. |

---

## 4. Prioritized Engineering Roadmap

1. **Immediate (Pre-Deployment)**:
   - Implement post-processing probability calibration (Platt scaling or isotonic regression) on the confidence engine to map categorical heuristics to true Bayesian probabilities.
   - Configure MongoDB `majority` write and read concerns across production Railway/Atlas instances.
2. **Intermediate (Platform Expansion)**:
   - Introduce a formal `ReservationHold` schema with 15-minute TTL locks to prevent race conditions during patient transit.
   - Implement WebSocket-driven live conflict broadcasts to synchronize casualty desk dispatchers.
3. **Long-Term (Institutional Integration)**:
   - Establish HL7 FHIR-compliant bi-directional gateways to bridge MCGM hospital EHRs and e-RaktKosh inventory databases into verified MedReach ingestion feeds.
