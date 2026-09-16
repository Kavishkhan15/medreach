# MedReach implementation inventory

Status: Hospital Data Fusion & Verification milestone verified locally on 2026-09-14. This document separates running features from the target vision. It does not represent fixture data as live hospital data.

## Already working

| Area | Current implementation |
| --- | --- |
| Shared architecture | Express/Mongoose API, one MongoDB dataset, `packages/core` search/ranking/hooks, and matching Next.js route lists in Bootstrap, Tailwind, and Skeleton. |
| Hospital discovery | Public search/profile/map, deterministic emergency categories and ranking, saved hospitals, contact/navigation links. |
| Ingestion | Approved source registry; separate site and directory adapters; robots/redirect checks; parsing, validation, normalization, confidence/freshness, change detection, CrawlResult history. |
| Data quality | Facility capability separated from current availability; per-source facility and hospital-field claims; verified recent observations only for public current status. Legacy hospital-wide bed writes are retired. |
| Admin | Crawler overview, source/job controls, data quality, verification queue, facility and field claim review with evidence, audit log, and persistent conflict history. |
| Security baseline | Auth/RBAC, scoped hospital edits and observations, HTTP security middleware, crawler redirect regression tests. Global crawler controls and conflict evidence are system-admin only; hospital staff cannot create a hospital and self-assign ownership. |
| Research baseline | Three framework variants; bundle/security/performance scripts, SUS/NASA-TLX protocol. |

## Incomplete or fragile

| Area | Gap |
| --- | --- |
| Data fusion | Facility and identity/contact/specialty fields have distinct per-source claims and conflict review. Cross-source hospital identity uses unique exact canonical name, pincode, and compatible address; records with incomplete identity stay separate for review. |
| Evidence | Every claim has source, page/reference URL, timestamp, parser marker, confidence, verification state, and evidence text. New crawls retain bounded source excerpts when available and track the page that supplied a field. Historical records without excerpts are explicitly labelled as normalized crawl evidence or internal legacy snapshots; the original page URL is retained when known. Keyword excerpts still require human interpretation and can contain negation. |
| Conflicts | Facility and hospital-field disagreements retain both claims and durable review/resolution history, including after resolution. The admin view shows resolved as well as open conflicts. A separate merge/override decision remains future work. |
| Hospital ownership | Hospital staff can edit assigned hospitals, but assignment has no documented ownership-proof workflow. Staff hospital creation is denied until one exists. Manual field edits have per-hospital manual-verification claims and AuditLog entries. Cross-document atomic audit guarantees require MongoDB transactions on a replica set. |
| Scheduler | No automatic worker is started by `server.js`. The dashboard and API now explicitly report automatic scheduling as unavailable; manual Run/Run all still work. |
| Crawler hardening | The legacy `BaseAdapter` redirect path now checks the original host and approved path on every hop. DNS resolution pinning and streaming response-size enforcement remain open. |
| Experimental parity | Route lists, shared logic, and crawler admin actions match, but rendered markup is not literally identical. Evaluation CI is mostly a stub. |

## Missing target modules

Emergency request lifecycle and hospital acknowledgement; hospital portal and ownership verification; resource/provider records and discovery for blood banks, diagnostics and ambulances; careers; notifications; a routing-backed ETA; optional evidence-gated Gemini ingestion refinement; richer analytics; and expanded research/user-study instrumentation.

## Implementation order

1. Add a hospital ownership-proof workflow, scoped staff APIs, and transactional audit writes on a MongoDB replica set. Field-level source claims and conflict review are implemented; facility and hospital-field migrations were backed up, applied, and checked for idempotence locally.
2. Add the minimal emergency bed-request model, state machine, privacy controls, hospital acknowledgement, and tracking UI in all three variants. A request is never a reservation.
3. Add sourced service listings and careers with separate verification rules; show unknown availability where no current feed exists.
4. Add optional Gemini candidate extraction after deterministic validation and human review; provider failure must not block ingestion.
5. Expand operational analytics, map layers, automated evaluation, accessibility/security checks, and user-study tasks; run cross-variant parity checks at each slice.

## Verification baseline

At this milestone: backend 64 passed with 4 opt-in tests skipped in the ordinary suite; 4 isolated Mongo integration tests passed separately. Crawler 100 passed with 10 live-network tests skipped. Bootstrap, Tailwind and Skeleton production builds passed. A pre-migration facility backup is at `/tmp/medreach-fusion-backup-20260914`, and a field-claim backup is at `/tmp/medreach-field-fusion-backup-20260914`. The local database has 44 facility claims and 107 hospital-field claims across 18 hospitals. Thirty hospital fields without a supported historical source are labelled internal legacy snapshots; 76 historical claims have an explicit `unknown_historical` parser marker. Eight conflicting hospital fields remain open for admin review. Ten hospitals retain government-directory links and 59 historical directory listings remain. The public API returned consistent list/detail/facility views for all 18 hospitals, 87 selected field-provenance summaries, no public bed counts without observations, and matching CORS access for all three variant origins. The field migration's repeat dry-run planned zero new claims and zero metadata repairs. Full evidence and limitations: `docs/Hospital_Data_Fusion_Verification_Report.md`.
