# MedReach Research Report: Request Correctness & Transactional Reliability (EXP-TX)

**Date & Time**: 2026-10-23T20:12:12.105Z  
**Specialist Role**: Backend & Transactional Reliability Specialist  
**Target Environment**: Node.js v24.22.1, MongoDB 8.0.34 on **Isolated Port 27018**  
**Database Isolation Check**: Confirmed `27018` exclusively; port `27017` untouched.  

---

## Executive Summary

This empirical study rigorously investigates the request correctness, concurrency guarantees, and state-machine transitions of the MedReach healthcare emergency coordination platform. The evaluation tested 8 distinct transactional sub-domains spanning duplicate prevention, idempotent retries, optimistic concurrency control under contention, state-machine invariants, interrupted workflows, read-after-write consistency, and the architectural separation between observational capacity reports and admission reservations.

| Metric | Measured Value |
|---|---|
| **Total Test Assertions** | **48** |
| **Passing Tests** | **48** |
| **Failing Tests** | **0** |
| **Pass Rate** | **100.00%** |
| **Database Isolation** | Verified on port 27018 (PID verified via admin serverStatus) |

---

## Experiment Results Breakdown


### EXP-TX-01: Duplicate Request Prevention and Idempotency Key Handling
- **Tests Evaluated**: 10
- **Passed**: 10 | **Failed**: 0
- **Details**:
  - [x] **1.1**: Initial emergency request succeeds with 201 Created
  - [x] **1.2**: Reusing key with different authenticated user returns 409 IDEMPOTENCY_KEY_REUSED
  - [x] **1.3**: Guest emergency request succeeds with 201 and tracking token
  - [x] **1.4**: Unauthenticated guest reusing authenticated user's idempotency key is rejected with 409 Conflict
  - [x] **1.5**: BloodRequest duplicate key returns 409 IDEMPOTENCY_KEY_REUSED
  - [x] **1.6**: AmbulanceBooking duplicate key returns 409 IDEMPOTENCY_KEY_REUSED
  - [x] **1.7**: Unique sparse idempotencyKeyHash indexes verified across all 5 transaction models
  - [x] **1.8**: Direct DB insert with duplicate idempotencyKeyHash triggers Mongo E11000 error
  - [x] **1.9**: Scope salting prevents cross-resource collision with identical Idempotency-Key
  - [x] **1.10**: Malformed Idempotency-Key formats rejected with 400 Bad Request


### EXP-TX-02: Idempotent Retries and Simulated Timeout Recovery
- **Tests Evaluated**: 7
- **Passed**: 7 | **Failed**: 0
- **Details**:
  - [x] **2.1**: Authenticated user replay returns 200 OK with same requestId and no duplicate document
  - [x] **2.2**: Idempotent replay with altered body returns cached original without mutating record
  - [x] **2.3**: Guest idempotent replay returns 200 OK with identical trackingToken and requestId
  - [x] **2.4**: Simulated client timeout followed by retry recovers cleanly with exactly 1 DB record
  - [x] **2.5**: Ambulance booking idempotent replay returns 200 OK with same reference and single DB booking
  - [x] **2.6**: Blood request idempotent replay returns 200 OK with same reference and single DB record
  - [x] **2.7**: 10 consecutive idempotent retries all return 200 OK with unchanged database document count


### EXP-TX-03: Concurrent Requests Competing for State Mutations & Resources
- **Tests Evaluated**: 4
- **Passed**: 4 | **Failed**: 0
- **Details**:
  - [x] **3.1**: N=10 simultaneous EmergencyRequest transitions: exactly 1 wins (200 OK), 9 fail with 409 Conflict
  - [x] **3.2**: Optimistic concurrency preserves timeline integrity without duplicate or phantom steps
  - [x] **3.3**: N=8 simultaneous conflicting AmbulanceBooking updates: OCC isolates branches with 409s and commits valid terminal status
  - [x] **3.4**: N=10 simultaneous requests created successfully (triage queueing, non-blocking ingestion)


### EXP-TX-04: Stale-State and Out-of-Order Transition Prevention
- **Tests Evaluated**: 7
- **Passed**: 7 | **Failed**: 0
- **Details**:
  - [x] **4.1**: Rejection of transition when expectedStatus mismatches actual database state
  - [x] **4.2**: Rejection of transition when expectedTimelineLength mismatches actual timeline history
  - [x] **4.3**: Invalid state transition from terminal REJECTED status is blocked with 409
  - [x] **4.4**: Stale transition on terminal BloodRequest blocked with 409
  - [x] **4.5**: Stale transition on terminal AmbulanceBooking blocked with 409
  - [x] **4.6**: Transition on expired request auto-finalizes to EXPIRED and rejects with 409
  - [x] **4.7**: Patient cannot submit reply when status is not INFORMATION_REQUESTED


### EXP-TX-05: Documented State Machine Transitions and RBAC Enforcement
- **Tests Evaluated**: 6
- **Passed**: 6 | **Failed**: 0
- **Details**:
  - [x] **5.1**: Full EmergencyRequest happy path: REQUESTED -> SENT -> UNDER_REVIEW -> INFORMATION_REQUESTED -> UNDER_REVIEW -> ACCEPTED -> COMPLETED
  - [x] **5.2**: EmergencyRequest rejection path: UNDER_REVIEW -> REJECTED
  - [x] **5.3**: EmergencyRequest patient cancellation path: UNDER_REVIEW -> CANCELLED
  - [x] **5.4**: RBAC & payload validation guards enforced on state transitions (403/400)
  - [x] **5.5**: BloodRequest state transitions: REQUESTED -> CONFIRMED -> COMPLETED
  - [x] **5.6**: AmbulanceBooking state transitions: RECORDED -> UNDER_REVIEW -> CONFIRMED -> DISPATCHED -> COMPLETED


### EXP-TX-06: Interrupted In-Flight Operations and Safe Idempotent Resumption
- **Tests Evaluated**: 4
- **Passed**: 4 | **Failed**: 0
- **Details**:
  - [x] **6.1**: Identical transition retry after simulated network interruption returns 200 without duplicate timeline or audit entries
  - [x] **6.2**: Altered transition parameters on already-committed state rejected with 409 Conflict
  - [x] **6.3**: Uncommitted operation retry creates the record cleanly without ghost lock or stale failure
  - [x] **6.4**: Provider status update replay after lost response returns 200 OK ('Status already recorded.')


### EXP-TX-07: Request-Status Consistency Across Repeated and Concurrent Reads
- **Tests Evaluated**: 4
- **Passed**: 4 | **Failed**: 0
- **Details**:
  - [x] **7.1**: 50 repeated consecutive reads yield 100% identical state and timeline
  - [x] **7.2**: 40 concurrent reads during active state transitions maintain strict status-timeline consistency (0 split-brain reads)
  - [x] **7.3**: Database timeline history exactly correlates with AuditLog entries
  - [x] **7.4**: Guest access with incorrect tracking token consistently rejected with 403 Forbidden


### EXP-TX-08: Architectural Separation Between Observational Availability and Request Fulfillment
- **Tests Evaluated**: 6
- **Passed**: 6 | **Failed**: 0
- **Details**:
  - [x] **8.1**: Recorded initial availability observation (5 ICU beds) into append-only observation store
  - [x] **8.2**: Submitting 10 emergency bed requests does NOT decrement reported availability (observations remain strictly observational)
  - [x] **8.3**: Accepting hospital bed requests does NOT deduct from AvailabilityObservation (no transactional lock/hold on reported capacity)
  - [x] **8.4**: Completing emergency admission does NOT alter AvailabilityObservation time-series ledger
  - [x] **8.5**: Stale availability reports (>30 min old) are rejected at ingestion boundary
  - [x] **8.6**: API response contracts explicitly classify submissions as requests requiring clinical confirmation rather than guaranteed reservations


---

## Two-Column Architectural Analysis: Demonstrable Guarantees vs. Required Implementation

Per the research brief specifications, the table below provides a precise, evidence-based comparative analysis contrasting what the **current architecture demonstrably guarantees** versus what **still requires implementation** for full enterprise-grade transactional resilience.

| What the CURRENT Architecture Demonstrably Guarantees (With Empirical Evidence) | What Still REQUIRES IMPLEMENTATION |
|---|---|
| **1. Strict Idempotent Deduplication by Scope & Key**:<br>Empirically proven in EXP-TX-01 & 02. The combination of SHA-256 scoping (`sha256(scope:key)`) and unique sparse indexes on `idempotencyKeyHash` ensures that re-submitting an identical key by the same actor returns `200 OK` with the original document, while a different actor re-using the key is immediately blocked with `409 IDEMPOTENCY_KEY_REUSED`. | **Atomic Multi-Document Distributed Transactions (Two-Phase Commit / Sagas)**:<br>The current backend relies on single-document atomic updates (`findOneAndUpdate`). Cross-collection workflows (e.g. updating `EmergencyRequest` and logging `AuditLog` or dispatching email events) are coordinated in application logic without a MongoDB multi-document session transaction (`startTransaction`). If an audit log write fails, the primary document has already committed. |
| **2. Safe Timeout Recovery on In-Flight Submissions**:<br>Empirically proven in EXP-TX-02.4 & 06.1. If a client disconnects or times out while the server processes the submission, re-sending the same key cleanly returns the committed record without creating duplicate records or phantom state in MongoDB. | **Distributed Idempotency Cache / Lock with Expiry**:<br>Idempotency hashes are permanently persisted in the document collection itself with sparse unique indexes. There is no TTL-based distributed lock (e.g. Redis Redlock or in-memory lock table) holding in-flight keys. If two identical requests hit the server in the microsecond before either write completes, Mongo index collision throws E11000, which the error handler intercepts; however, a unified in-flight mutex would reduce database index strain. |
| **3. Optimistic Concurrency Control (OCC) on Competing State Updates**:<br>Empirically proven in EXP-TX-03.1 & 03.3. Under N=10 and N=8 simultaneous conflicting transitions, exactly 1 atomic update wins, and N-1 requests receive `409 Conflict`. `findOneAndUpdate` verifies both prior status AND `timeline.[len]: { $exists: false }`, mathematically preventing race condition overwrites and interleaved history. | **Automated Retry / Conflict Resolution Client Library**:<br>When a 409 Conflict is returned to clients, the API leaves conflict resolution entirely to client-side refresh. Implementing HTTP `ETag` / `If-Match` headers or WebSocket-driven live conflict broadcasts would provide smoother collaborative resolution for hospital triage teams. |
| **4. Strict State Machine Integrity & RBAC Guards**:<br>Empirically proven in EXP-TX-04 & 05. The system strictly rejects invalid transitions (e.g. from terminal states like `REJECTED`, `CANCELLED`, or `COMPLETED`), expired requests auto-transition to `EXPIRED`, and unauthorized roles attempting triage actions receive `403 Forbidden`. | **Configurable Workflow Engine / State Machine Versioning**:<br>The state machine transition graph is hardcoded as in-memory static objects (`transitions`, `BLOOD_TRANSITIONS`, `AMBULANCE_TRANSITIONS`). Dynamic workflows (e.g., inter-facility transfers, secondary triage triage stages) require code modifications rather than data-driven workflow configuration. |
| **5. Monotonic Read Consistency During Concurrent Writes**:<br>Empirically proven in EXP-TX-07.2. Across 40 concurrent reads during rapid state transitions, 0 split-brain reads occurred: document `status` was always 100% synchronized with the terminal entry of the `timeline` array. | **Read-After-Write Consistency across Secondary Replicas**:<br>In a multi-node MongoDB replica set with secondary reads, `readConcern: "majority"` and `writeConcern: { w: "majority" }` should be explicitly configured on critical state queries to prevent stale reads across read replicas. |
| **6. Complete Decoupling of Availability Telemetry and Admission Requests**:<br>Empirically proven in EXP-TX-08. Submitting 10 emergency requests, accepting 3, and completing 2 did NOT deduct from `AvailabilityObservation` quantity (remained 5). The system nowhere treats volatile point-in-time capacity reports as guaranteed reservations, avoiding false promises of care. | **Active Reservation / Bed Allocation Hold System with TTL**:<br>Because availability is purely observational telemetry, MedReach currently lacks a temporary "reservation hold" (e.g., a 15-minute bed lock while an ambulance is en route). Implementing a formal Reservation entity with automatic expiration would bridge the gap between triage acceptance and physical ward admission. |

---

## Reproducibility Guide

To reproduce these exact experimental results in any clean Linux environment:

1. **Start Disposable MongoDB on Port 27018**:
   ```bash
   mkdir -p /tmp/medreach-test-db
   mongod --port 27018 --dbpath /tmp/medreach-test-db --fork --logpath /tmp/medreach-test-db/mongod.log
   ```
2. **Launch Isolated Test Backend**:
   ```bash
   cd /home/anonymous/medreach
   MONGODB_URI="mongodb://127.0.0.1:27018/medreach_research_test" \
   MEDREACH_E2E_MONGO_URI="mongodb://127.0.0.1:27018/medreach_research_test" \
   EMAIL_ENABLED="false" AI_PROVIDER="rule_based" PORT=4100 TRUST_PROXY=1 NODE_ENV=test \
   node backend/src/server.js
   ```
3. **Execute Master Test Suite**:
   ```bash
   node research/experiments/transactional/run-all-tx-experiments.mjs
   ```
4. **Shutdown and Cleanup**:
   ```bash
   kill $(pgrep -f "mongod.*27018")
   rm -rf /tmp/medreach-test-db
   ```
