# Outstanding Approvals, Institutional Pre-Requisites & Blocked Experiment Register

**Document Identifier**: `research/outstanding-approvals.md`  
**Lead Auditor**: Independent QA Specialist & Research Coordinator  
**Date**: 2026-10-24  
**Target Repository**: `/home/anonymous/medreach`  
**Governing Standard**: `briefs2/_common2.md` and `briefs2/brief-qa.md`

---

## Executive Summary

While the computational, architectural, and simulated experimental phases of the MedReach research campaign are 100% complete and verified, deploying MedReach in a live clinical environment or evaluating real patient care requires specific institutional, ethical, regulatory, and technical approvals.

In strict adherence to scientific integrity and research ethics (Declaration of Helsinki, ICMJE standards, and the Indian Digital Personal Data Protection Act 2023), this document registers all outstanding pre-requisites, organizational permissions, and intentionally blocked investigations.

---

## 1. Institutional Governance & Ethics Approvals

| Institutional Entity | Required Approval / Clearance | Scope & Pre-Requisite | Current Status | Blocker & Operational Impact |
|:---|:---|:---|:---:|:---|
| **Institutional Ethics Committee (IEC) / Institutional Review Board (IRB)** | Formal Ethical Protocol Approval for Human Subject Trials | Required prior to recruiting human patients, healthcare workers, or emergency dispatch personnel into prospective routing or navigation trials. | **PENDING (Pre-Clinical)** | **Blocks EXP-CLINICAL**. No clinical endpoints (mortality, transfer time, morbidity) may be evaluated or claimed until an approved protocol and informed consent workflow are established. |
| **Municipal Corporation of Greater Mumbai (MCGM / BMC)** | Public Health Department Data Sharing Agreement (DSA) | Authorized direct read-only API access to the central MCGM Disaster Management Cell, Ward War Rooms, and municipal medical colleges (KEM, Sion, Nair, Cooper). | **OUTSTANDING** | **Blocks Live Ward Telemetry**. MedReach currently models provider updates using stochastic Poisson/Markov simulations. Real-world ward capacity feeds require municipal IT and health administration clearance. |
| **Maharashtra State Blood Transfusion Council (SBTC) / Food and Drug Administration (FDA)** | State Blood Component Stock Integration Memorandum | Machine-to-machine API gateway integration for live blood bank inventory and donation pledge confirmation across Mumbai blood storage centers. | **OUTSTANDING** | **Limits Blood Services to Directory / Manual Form**. Real-time component tracking currently relies on public directory listings and manual provider claims. |
| **National Health Authority (NHA) — Ayushman Bharat Digital Mission (ABDM)** | ABDM Sandbox Milestone M1/M2/M3 Certification | Direct synchronization with the Health Facility Registry (HFR) and Unified Health Interface (UHI) protocols. | **OUTSTANDING** | **Limits Statutory Registry Synchronization**. Statutory baseline records currently use audited static snapshot seeds rather than active ABDM FHIR webhooks. |

---

## 2. Technical and Infrastructure Pre-Requisites

| Resource / Capability | Required Authorization / Resource | Operational Impact & Rationale |
|:---|:---|:---|
| **Hospital Electronic Health Record (EHR) Gateways** | HL7 v2 / FHIR Interface Agreements with individual hospital IT departments. | Required to implement true two-way `ReservationHold` entities with 15-minute TTL locks on emergency beds. Without EHR integration, bed reservations remain observational discovery requests requiring telephone confirmation. |
| **Emergency Telecommunications Trunk (108 / 112 Dispatch Integration)** | Maharashtra Emergency Medical Services (MEMS) integration permit. | Required to route ambulance bookings into the centralized state computer-aided dispatch (CAD) console. Currently, ambulance fleet coordination operates as a direct contact directory. |
| **Commercial Map Routing Licenses** | Google Maps Distance Matrix / Mapbox Directions API enterprise key. | Prohibited during research execution by Rule 16 (`_common2.md`). Real-world dynamic transit routing under peak-hour monsoon traffic requires authorized commercial routing quotas. |
| **Transactional Email / SMS Gateway** | Production Twilio / SendGrid enterprise account with DLT (Distributed Ledger Technology) registration in India. | Prohibited during research execution by Rule 15 (`EMAIL_ENABLED=false`). Live SMS/email patient alerts and provider handover credentials require DLT-registered headers under TRAI regulations. |

---

## 3. Blocked and Omitted Experiment Register

The following potential experiments were considered during proposal drafting but were **formally blocked or not attempted** during research execution:

### 3.1 EXP-CLINICAL: Live Patient Triage and Diversion Outcomes
- **Formal Status**: **BLOCKED**
- **Justification & Blocker**:
  - Prohibited by international research ethics and Rule 31-32 of `_common2.md` ("Never fabricate numbers... No human-participant data may be invented. No clinical-outcome claims").
  - MedReach is an informational discovery testbed, not an approved medical device or certified emergency dispatch service. Conducting an unauthorized clinical trial in live casualty wards without IRB oversight would violate the Declaration of Helsinki and Indian ICMR biomedical research guidelines.
  - *Resolution*: The manuscripts evaluate system behavior, algorithmic age decay, and database concurrency exclusively, explicitly disclaiming clinical outcome claims.

### 3.2 EXP-MAPS-LIVE: Live Traffic Routing Under Metropolitan Congestion
- **Formal Status**: **BLOCKED**
- **Justification & Blocker**:
  - Prohibited by Rule 16 of `_common2.md` ("Never call external Maps or paid APIs").
  - Automated batch querying of proprietary routing APIs during Monte Carlo simulations would generate financial charges, introduce uncontrollable external network latency, and violate isolation constraints.
  - *Resolution*: Spatial analysis uses deterministic great-circle Haversine distance across the 114 verified hospital coordinates (`location.coordinates`), documenting geodesic transit bands.

### 3.3 EXP-SMTP-LIVE: Production Email & Provider Invitation Delivery
- **Formal Status**: **BLOCKED**
- **Justification & Blocker**:
  - Prohibited by Rule 15 of `_common2.md` ("Always set EMAIL_ENABLED=false and AI_PROVIDER=rule_based. Never send email").
  - Firing live email dispatches during test iterations risks sending unsolicited messages to real facility contact addresses or triggering spam blacklists.
  - *Resolution*: Authentication and provider onboarding flows were verified in local integration suites using mocked transport interfaces.

### 3.4 EXP-VERCEL-LOAD: Public CDN Edge Stress Testing
- **Formal Status**: **BLOCKED**
- **Justification & Blocker**:
  - Prohibited by Rule 19 of `_common2.md` ("NO load, stress, spike or soak traffic against the three public Vercel deployments or the shared Railway API").
  - High-concurrency load testing against public Vercel edge URLs violates terms of service, risks triggering automated DDoS mitigations, and exhausts shared hosting tiers.
  - *Resolution*: Public endpoints were audited strictly via polite, low-rate read-only GET requests (600 ms pacing) to evaluate headers and HTML shells. All load, stress, spike, and soak workloads were executed on an isolated local backend (`http://127.0.0.1:4200`) backed by a disposable MongoDB instance (`127.0.0.1:27018`).

### 3.5 EXP-SPA: Dynamic Road Network Catchment Simulation
- **Formal Status**: **NOT ATTEMPTED**
- **Justification & Blocker**:
  - Analytical spatial accessibility across Mumbai's administrative corridors (Island City, Western Suburbs, Eastern Suburbs, Extended Metropolitan) was completed analytically in dossier Section 08 and Section 16.
  - Dynamic simulation of road network travel times under fluctuating monsoon flooding was omitted because local OpenStreetMap routing engines (e.g. OSRM) with Mumbai elevation matrices were outside the scope of the 2026-10-24 execution package.

---

## 4. Road Map for Post-Approval Clinical Transition

Once institutional approvals and EHR integrations are secured by the platform owner, the research package provides a structured transition path:
1. **Phase 1 (Post-IRB Observational Pilot)**: Deploy MedReach in 2–3 pilot municipal casualty departments as a read-only provider dashboard, collecting authentic observation timestamps to calibrate the theoretical Poisson/Markov transition rates.
2. **Phase 2 (Platt Scaling & Calibration)**: Apply empirical accuracy feedback to calibrate the heuristic confidence metric (`HIGH`, `MEDIUM`, `LOW`) into true Bayesian posterior probabilities using isotonic regression.
3. **Phase 3 (Two-Way FHIR Gateways)**: Implement automated HL7 FHIR adapters to synchronize live electronic bed management boards directly into append-only `AvailabilityObservation` collections, eliminating manual shift-entry latency.
4. **Phase 4 (Active TTL Reservation Engine)**: Implement distributed multi-document MongoDB transactions and Redis mutex locks to support 15-minute `ReservationHold` locks during patient transit.

---

*Signed,*  
**Independent QA Specialist & Research Coordinator**  
MedReach Final Research Execution Gate
