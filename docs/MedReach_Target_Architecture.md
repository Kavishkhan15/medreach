# MedReach target architecture

**Status:** product direction and implementation plan, not a claim that every module below exists today. Updated 2026-09-14.

**First implemented slice:** facility capability now has a separate field and
per-source claims. Newly crawled facility claims retain a bounded source-text
excerpt, exact page URL, and parser version. Disagreements persist in a
`DataConflict` record with review history, and the crawler admin dashboard
shows them across all three variants. The public hospital/facility API uses
only recent, verified observations for current availability. Assigned hospital staff can
submit a verified, timestamped availability observation; unassigned staff are
denied. Identity-field fusion,
hospital-side ownership verification, backfilling old crawls, and the later
milestones below remain planned.

The first slice was verified with pure resolver/view tests, the backend and
crawler suites, all three production builds, and an isolated MongoDB/API test.
That integration test used two synthetic sources for one ICU: disagreement
produced `unknown` capability and `unknown` availability; system-admin review
selected a capability but kept the dispute visible; an unassigned hospital
admin was denied; an assigned admin's timestamped observation made only that
ICU's availability current. No external hospital site was contacted for this
test. Existing MongoDB records need a controlled backfill or recrawl before
they will have per-source claims.

MedReach's target is a research-driven emergency healthcare intelligence platform for Mumbai. It combines multi-source hospital data ingestion, field-level provenance and human verification, deterministic emergency matching, an explicit hospital-acknowledged bed-request workflow, and optional LLM-assisted information refinement. The same backend, data, behavior, content, and accessibility semantics serve three CSS-framework variants so security, accessibility, responsiveness, performance, and usability can be compared fairly.

## System boundaries

```text
Approved hospital sites / government directories / authorized feeds / hospital staff
                  ↓
Crawler and source adapters → normalized, evidence-backed claims
                  ↓                          ↑
           deterministic data fusion    Gemini candidate extraction
                  ↓                          │
       conflicts and verification queue ←───┘ (never auto-publishes)
                  ↓
    MongoDB: source claims + resolved hospital view + observations + audit
                  ↓
       Shared Express API and deterministic emergency matching
                  ↓
    Bootstrap / Tailwind / Skeleton (same behavior and semantics)
                  ↓
      Reproducible research measurements and user study
```

The emergency response branch provides guidance to call local emergency services and helps find and contact suitable hospitals. A bed request is a request for a hospital to review; it is **not** a reservation, ambulance dispatch, or guarantee of care until that hospital explicitly accepts it. Blood bank, ambulance, diagnostics, and careers are separate services with their own source, verification, and update rules. A listing of a service does not imply live availability.

## Current foundation and gaps

| Area | Present in repository | Needed for target |
| --- | --- | --- |
| Hospital discovery | Shared search/ranking, three frontends, hospital and observation models | Public API must return a resolved, provenance-aware view; ranking must distinguish capability from current availability. |
| Ingestion | Nine registered sources, site and directory adapters, validation, change detection, CrawlResult history, admin controls | Close the legacy redirect gap and other fetch limits; add claim-level fusion, conflict handling, and source-specific freshness. |
| Verification | Admin queue and hospital/admin roles | Hospital ownership proof, scoped staff permissions, field-level decisions and audit trail. |
| Emergency workflow | Emergency pages, category matching, contact/navigation | Request lifecycle, hospital acknowledgement, expiry, privacy rules, and explicit failure states. |
| Gemini | Existing optional assistant/provider code | Separate, opt-in **ingestion refinement** pipeline that creates cited suggestions for human review; no diagnosis or unsourced facts. |
| Services | Blood Bank, Ambulance, CT, MRI exist as facility labels | Service records, source/partner relationships, public directory pages, and verified current-status contracts where applicable. |
| Research | Security/performance scripts and user-study protocol | Repeatable accessibility/responsiveness/usability measurement, fixed datasets, and automated cross-variant parity checks. |

## Data contracts to implement first

1. **Source claim:** `hospitalId`, `field`, typed `value`, `sourceId`, exact `sourceUrl`, evidence excerpt/hash, collection method, observed/retrieved timestamps, confidence inputs, verification status, and parser version. Keep conflicting claims rather than overwriting them.
2. **Resolved field:** selected claim ID, resolution rule, effective timestamp, freshness, confidence, and conflict flag. An administrator can resolve a conflict with an audited reason; source priority alone must not silently convert an old claim into a current one.
3. **Facility capability:** `yes | no | unknown`, backed by a source claim. **Current availability:** `available | limited | unavailable | unknown`, with `asOf`, source, and optional quantity. A static page saying “42 ICU beds” is capacity evidence only; it cannot set available beds to 42.
4. **Emergency request:** hospital ID, request category, minimal contact details, status, expiry, hospital acknowledgement/decision timestamps, and audit events. Do not store diagnosis or detailed medical history in the first version. The API and UI must show pending, declined, expired, and unavailable states honestly.
5. **Service listing:** service type, provider, geography, contact or booking link, source evidence, verification, freshness, and an explicit availability basis. Careers are not emergency services and use a distinct workflow.

## Implementation milestones and acceptance gates

### 0. Make existing data safe to compose

- Keep the current site/directory pipeline. The legacy `BaseAdapter` redirect path now rejects unapproved hosts/paths; review DNS resolution, streaming size limits, and robots failure handling before expanding source volume.
- Separate facility capability from availability in the schema and API. Remove or clearly label legacy defaults that imply an emergency department is open or beds are available when no observation exists.
- Ensure the hospital finder receives facilities, latest observations, provenance, and freshness from the shared API. A static-site crawl must render availability as **unknown** in all three variants.
- Gate: local mock tests, MongoDB integration checks, backend suite, crawler suite, three builds, and a cross-variant fixture assertion.

### 1. Provenance-aware data fusion and hospital verification

- Persist source claims independently of the resolved hospital record. Match identities using explicit identifiers and reviewed candidate matches; avoid unreviewed fuzzy merges.
- Define field-specific resolution rules and a conflict queue. Add a hospital-admin claim/verification flow scoped to hospitals they control, with audit events.
- Gate: two disagreeing sources remain visible; rejecting a claim leaves the prior resolved value intact; directory-only identity never fabricates a facility.

### 2. Emergency response and bed-request workflow

- Keep deterministic, explainable matching and contact/navigation. Add `BedRequest` with a short expiry, clear state transitions, idempotent submission, hospital acknowledgement, and cancellation.
- Add user and hospital-side screens to the shared behavior layer, then implement all three CSS variants together.
- Gate: no request is shown as accepted before a hospital decision; expired requests cannot be accepted; unauthorized staff cannot see or act on another hospital's requests.

### 3. Optional Gemini-assisted information refinement

- Use Gemini only to propose structured claims from already-fetched, approved source content. Require source-page citation, schema validation, provenance, confidence, and human review before publication. Keep deterministic parsing as the baseline and log model/prompt versions for research.
- Gemini never invents contact details, current beds, diagnosis, dispatch status, or hospital acceptance. Provider failure leaves deterministic ingestion and the public API usable.
- Gate: malformed/uncited model output is rejected; provider failure cannot change an approved hospital field; no model-specific behavior differs by CSS variant.

### 4. Services

- Add careers, blood-bank, ambulance, and diagnostics as separate service domains with source-specific update cadence and verification. Start with directories/contact links; enable current inventory or dispatch status only from an authorized, timestamped feed or verified partner action.
- Gate: missing availability remains unknown; stale partner status is withdrawn or clearly marked; service actions are auditable.

### 5. Research engine and experiment validity

- Use one backend/database snapshot, one API, one shared client logic layer, and equivalent content, interactions, DOM semantics, security headers, and accessibility labels. Only framework styling should be varied intentionally.
- Add parity checks for route set, action set, accessible names, task flows, and data snapshots. Record the exact framework versions and build hashes for each run.
- Measure security, accessibility, responsiveness, performance, and usability with preregistered metrics and the existing consent/SUS/NASA-TLX study artifacts. Keep experimental results separate from production health claims.
- Gate: automated parity and build checks pass before any comparative measurement; deviations are documented rather than silently included.

## Delivery rule

Each milestone extends the existing monorepo: shared business logic in `packages/core`, API and persistence in `backend`, approved-source ingestion in `crawler`, framework-specific presentation in all three variants, and measurement in `evaluation`/`user-study`. A milestone is complete only when its data contract, tests, API, dashboard, and three frontend paths agree. This document records the target; it does not mark unbuilt features as shipped.
