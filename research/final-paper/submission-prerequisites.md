# Submission Prerequisites and Governance Roadmap

**Manuscript Title**: Freshness-Aware, Provenance-Tracked Healthcare Resource Discovery in Fragmented Urban Ecosystems: System Design, Staleness Dynamics, and Transactional Evaluation  
**Target Repository**: `/home/anonymous/medreach`  
**Consolidated Directory**: `/home/anonymous/medreach/research/final-paper/`  
**Date**: October 2026  
**Status**: Pre-Submission Governance & Readiness Protocol  

---

## 1. Purpose and Policy Statement

This document details the mandatory institutional, regulatory, technical, and ethical prerequisites that must be satisfied before the MedReach research manuscript is submitted to any peer-reviewed scientific journal or conference proceeding.

> [!IMPORTANT]
> **Venue Suitability & Indexing Disclaimer**:
> In strict accordance with the project owner's instructions and scientific integrity standards, **no claims regarding journal quartile (e.g., Q1/Q2), Scopus/Web of Science indexing status, impact factors, or guaranteed acceptance are made here**. Determination of target journal quartile, scope alignment, and indexing suitability requires a separate evidence-based assessment and editorial consensus, conducted independently of this technical consolidation.

---

## 2. Mandatory Pre-Submission Prerequisites

### A. Institutional Ethics Committee (IEC) / IRB Review
1. **Current Research Demarcation**:
   - The current empirical findings are derived strictly from **laboratory bench benchmarks, synthetic discrete-event simulations, static code/AST audits, and read-only inspections of public web portals**.
   - **Zero human participants** were enrolled, surveyed, or intervened upon.
   - **Zero live patient identifiable health information (PHI)** was collected, stored, or processed.
2. **Prerequisites for Real-World Extension / Prospective Clinical Trials**:
   - Prior to any real-world pilot, field deployment, clinical trial, or patient-facing deployment in Mumbai:
     - Formal protocol submission to an accredited Institutional Ethics Committee (IEC) registered with the Central Drugs Standard Control Organisation (CDSCO) / National Bioethics Committee in India.
     - Obtaining explicit IEC clearance adhering to the Indian Council of Medical Research (ICMR) *National Ethical Guidelines for Biomedical and Health Research Involving Human Participants* (2017).
     - Formulation of patient informed consent workflows, emergency escalation protocols, and harm-minimization contingencies.

### B. Provider & Government Data-Sharing Agreements
1. **Absence of Live Institutional Integrations**:
   - The current MedReach evaluation does not possess active, live, programmatic API hooks into the Municipal Corporation of Greater Mumbai (MCGM / BMC) hospital admission systems, the National Health Mission (NHM) HMIS servers, or private tertiary electronic health record (EHR) databases.
2. **Required Institutional Agreements**:
   - Formal Memorandum of Understanding (MoU) with municipal authorities (MCGM Public Health Department / Disaster Management Cell) for bidirectional emergency data feeds.
   - Data-sharing and Service Level Agreements (SLAs) with participating municipal medical colleges (e.g., KEM, Sion, Nair, Cooper) and private hospital networks establishing update cadences, authoritative points of contact, and liability boundaries.
   - Standardized Business Associate Agreements (BAAs) or Data Processor Agreements (DPAs) in compliance with the Digital Personal Data Protection (DPDP) Act 2023.

### C. Prospective Real-World Validation
1. **Limitations of Synthetic Benchmarks**:
   - The empirical AoI results (EXP-AOI) and provenance fusion metrics (EXP-PROV) reflect mathematical queueing models and synthetic noise distributions. While parameterized on published literature, they cannot substitute for prospective field measurements.
2. **Field Validation Requirements**:
   - Observational shadow testing in casualty departments comparing reported availability counts against physical ward census over a minimum 30-day period.
   - Measuring actual clinician update burden, adherence to the 30-minute reporting cadence, and false-positive reporting rates during acute trauma surges.
   - Empirical evaluation of ambulance transit delays and diversion rates under MedReach navigation assistance versus standard dispatch protocols.

### D. Open-Science Artifact Availability & Long-Term Archiving
1. **Code and Data Package**:
   - Preparation of a persistent, versioned Digital Object Identifier (DOI) via Zenodo or Figshare containing:
     - Exact frozen Git commit of the codebase and test suites.
     - Simulation raw output datasets (`raw_metrics.json`, `complete_suite_results.json`, `raw_calibration_trials.json`).
     - Automated Docker build file (`Dockerfile`) encapsulating Node.js v24, Python 3.11, MongoDB 8.0, and TeX Live 2026 for 1-click reproduction.
2. **Anonymization and Secret Scrubbing Verification**:
   - Verification that no API keys, internal credentials, SMTP credentials, or local environment paths are embedded within public repositories or artifacts.

---

## 3. Technical Enhancements Required Prior to Full Enterprise Deployment

As established in the paper's two-column architectural analysis (Table VI), the following technical capabilities must be implemented before the platform transitions from an empirical research prototype to production clinical infrastructure:

1. **Atomic Multi-Document Distributed Transactions (Sagas)**:
   - Transition cross-collection workflows (such as simultaneous `EmergencyRequest` status updates, `AuditLog` writes, and notification dispatches) from single-document `findOneAndUpdate` operations to MongoDB session-backed multi-document transactions (`session.withTransaction`).
2. **In-Flight Mutex / Distributed Lock**:
   - Deploy an in-memory or Redis-backed distributed lock (Redlock) with TTL expiration for active idempotency keys to eliminate database index collision overhead under extreme burst traffic.
3. **Active Bed-Reservation Hold System (TTL Locks)**:
   - Implement an active, expiring `ReservationHold` entity (e.g., 15-minute bed lock) bridging the operational gap between triage acceptance and physical ward intake.
4. **Statistical Calibration of Heuristic Confidence Scores**:
   - Apply Platt scaling or isotonic regression to the fusion engine's heuristic confidence metrics to ensure output values represent mathematically calibrated probabilities.
5. **Replica-Majority Consistency**:
   - Explicitly configure `readConcern: "majority"` and `writeConcern: { w: "majority" }` on all clinical mutation endpoints across multi-region replica sets.

---

## 4. Pre-Submission Verification Checklist

- [x] Abstract, Introduction, Results, and Conclusion tell ONE consistent, unified story.
- [x] All 5 experimental suites (AoI, Provenance, Edge Caching, Transactional, Load) fully integrated.
- [x] All numeric claims traced and verified against repository CSVs/JSONs (see `claim-evidence-audit.md`).
- [x] Negative findings prominently reported (datapath staleness verdict NOT SUPPORTED; uncalibrated heuristic confidence).
- [x] Zero fabricated numbers, clinical outcomes, participants, or provider integrations.
- [x] Three-framework comparison excluded (secondary study cleanly archived in `research/archive/paper-output2-technical-study/`).
- [x] Full IEEE section set maintained.
- [x] LaTeX source (`main.tex`) compiles cleanly in Docker with 0 errors, 0 undefined citations, and 0 missing files.
- [x] Verified bibliography (`references.bib`) containing only cited entries from verified corpus.
- [x] Submission prerequisites document complete with ethical, institutional, and technical roadmap.
