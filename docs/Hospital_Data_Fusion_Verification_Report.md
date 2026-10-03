# Hospital Data Fusion & Verification — evidence report

## Current status note — 2026-10-03

This is a **historical evidence report from 2026-09-14**. The database counts,
conflict counts, backup path, skipped-suite counts and parity limitations below
belong to that audit; none was remeasured for this documentation update. The
latest executed backend/database, crawler, browser and build results belong in
[Release QA](release-qa.md), with [parity coverage](PARITY_VERIFICATION.md) and
[deployment requirements](deployment.md) maintained separately.

Later source inspection confirms an ownership-request/review implementation in
`backend/src/services/ownershipService.js` and an optional scheduler started by
`backend/src/server.js`. Accordingly, the original statement that ownership
onboarding is absent is historical, not a description of all current code.
Ownership requests still need evidence and authorized review; they do not prove
ownership automatically. Browser journey coverage now exists under `tests/e2e/`;
the original absence of browser parity assertions does not describe the current
release gate, and passing journeys still do not prove identical rendered markup.

Provenance and verification safeguards remain requirements: seeded/crawled
records do not automatically become verified, static capability does not prove
available beds, missing evidence is not reconstructed, and conflicts require
review. Optional Gemini refinement creates evidence-bound review candidates; its
approval alone does not change canonical claims. See [crawler](crawler.md).
No live provider, production deployment or new MongoDB dataset audit is claimed
by this status note. Historical counts must not be used as current statistics.

## Original evidence report — 2026-09-14

Date: 2026-09-14. Scope: existing hospital ingestion, claim fusion, review, public API, and the three CSS variants. No later MedReach module was started. All live API and MongoDB checks below used the local MedReach database; crawler tests used local mocks. No hospital website was contacted during this verification.

## 1. Identity matching

`crawler/src/identity/hospitalIdentity.js` and its runtime copy require an exact canonical name and a valid six-digit pincode. When either side has an address, both addresses must exist and match canonically. The function returns a match only when **exactly one** candidate qualifies; it never uses substring/fuzzy matching. The repository first prefers an already-linked source ID, then tries this unique cross-source match. Directory re-crawls first check an exact previous listing from the same directory (name, pincode, address). Incomplete or ambiguous identities stay separate for review. Directory-only listings become minimal, unverified hospital stubs with no invented facilities, specialties, or availability. Directory links are recorded in both `Hospital.sourceIds` and `CrawlResult`. Evidence: `backend/test/hospitalIdentity.test.js`, `crawler/tests/persistence.test.js`, `backend/test/facilityFusion.mongo.test.js`.

## 2. Field-level provenance

`FacilitySourceClaim` and `HospitalFieldClaim` store a DataSource reference, source page URL, evidence text and evidence kind, observation timestamp, parser version, confidence, and verification state. Hospital-field claims cover name, address, locality, pincode, phone, emergency phone, website, and specialties. New site crawls record the page that supplied a scalar field; specialty claims can retain multiple source-page URLs. A bounded excerpt is stored only when the parsed value occurs in the page text; otherwise evidence is explicitly marked `normalized_record`, not quoted as a source excerpt. Manual assertions use a separate manual-verification source and actor. The admin crawler page exposes the evidence and parser marker in all three variants. Evidence: `crawler/src/adapters/siteAdapter.js`, `backend/src/services/hospitalFieldFusion.js`, `backend/src/models/HospitalFieldClaim.js`, `crawler/tests/newSources.test.js`, MongoDB integration test.

Local DB check: 44 facility claims and 107 hospital-field claims; none lacks source, page/reference, timestamp, confidence, verification state, evidence text, or a parser marker. **Zero historical local claims contain a genuine source-page excerpt**: 44 facility claims and 77 field claims retain normalized evidence, and 30 field claims are explicitly labelled internal legacy snapshots. Of the field claims, 76 have `parserVersion: unknown_historical` because their original parser version was not retained. These labels disclose missing evidence; they do not reconstruct it.

## 3. Conflicts and canonical values

Claims remain one per hospital/field/source (or hospital/facility/source). Distinct active values create a persistent conflict with both claim IDs. Disagreeing unverified claims cannot replace the last canonical snapshot. Approving one claim selects its value while keeping the opposing claim and a visible resolved-conflict record. Rejecting a claim removes it from the active resolution pool. Claim `reviewHistory`, `AuditLog` before/after entries, and conflict `history` preserve decisions and later source changes. The local DB has 8 open hospital-field conflicts. Evidence: `backend/src/services/hospitalFieldFusion.js`, `backend/src/services/facilityClaimFusion.js`, `backend/src/models/HospitalFieldConflict.js`, `backend/test/facilityFusion.mongo.test.js` (approve, reject, reopen, audit-failure cases).

## 4. Availability safety

`HospitalFacility.capability` is independent of `AvailabilityObservation.status` and `quantity`. Static crawler observations are forced to `unknown`, `null`, and `unverified` even if an adapter supplies a number. The public view only exposes a non-unknown current status/count from the latest **verified** observation no more than 30 minutes old; future-dated, stale, unknown, and unverified observations cannot assert current availability. The legacy hospital-wide `bedsAvailable` field is always `null` in the public view; the legacy `/beds` writer now returns HTTP 410 without writing. No facility count is promoted to a hospital-wide bed count. Evidence: `backend/src/repos/crawlerMongoRepo.js`, `backend/src/services/hospitalDataView.js`, `backend/src/controllers/hospitalController.js`, `backend/test/hospitalDataView.test.js`, MongoDB integration test.

## 5. Permissions and auditing

`hospital_admin` management requires the user ID in that hospital's `admins` array. Hospital staff cannot change the identity name, review global claims, or manage the global source registry. System/legacy admins can review claims and control approved crawler sources. Successful hospital edits, verification decisions, claim approvals/rejections, availability observations, source changes, crawler run intents, and deletes write audit records. Claim approval/rejection and availability observation writes fail closed if audit storage fails. Evidence: `backend/src/services/hospitalAccess.js`, `backend/src/routes/admin.js`, `backend/src/routes/sources.js`, `backend/src/controllers/availabilityController.js`, `backend/src/controllers/crawlerController.js`, MongoDB integration test.

The local MongoDB is standalone, so multi-document state and audit writes are **not crash-atomic**. Compensating rollbacks cover tested audit-write failures, but a process crash between writes remains a limitation. Hospital-admin assignment has no ownership-proof onboarding workflow yet.

## 6. Public API

List, detail, and facilities endpoints use one `withHospitalData` composition path. The public hospital view includes resolved facilities, safe current availability, field-conflict summaries, and a `fieldProvenance` summary for selected fields (source, page(s), evidence kind, parser marker, timestamp, confidence, verification state, freshness). An unresolved field reports an open conflict and does not attribute the retained snapshot to an unselected claimant. Facility capability includes separate confidence and freshness labels. A future timestamp has freshness `UNKNOWN`.

Local API check: all 18 hospital list/detail/facility views agreed, 87 selected field-provenance summaries had required metadata, 8 open conflict summaries were visible, and zero unsupported availability/bed counts were exposed. The three frontend origins (`:3000`, `:3001`, `:3002`) received matching CORS authorization.

## 7. Frontend parity

All variants use the same backend data and shared `packages/core` API/hook behavior. Bootstrap's copied core API and hook files match byte-for-byte. Route lists match; the three crawler pages have the same hospital-field evidence/review controls and conflict/history views. The crawler runtime copies in `crawler/src` and `backend/src/_crawler` match for the changed adapter, normalizer, persistence, directory persistence, and orchestrator files. `cmp` checks passed. Presentation and rendered markup are not byte-identical; there is no automated browser-level parity assertion yet.

## 8. Tests and builds

| Check | Result | Skips |
| --- | --- | --- |
| Full backend (`npm run backend:test`) | 64 passed, 0 failed | 4 opt-in isolated-Mongo tests skipped in the ordinary suite |
| Isolated MongoDB (`MEDREACH_TEST_MONGO_URI=... node --test backend/test/facilityFusion.mongo.test.js`) | 4 passed, 0 failed | 0 |
| Full crawler (`npm run crawler:test`) | 100 passed, 0 failed | 10 live-network tests intentionally opt-in with `MEDREACH_LIVE=1` |
| Production builds (`npm run build:variants`) | Bootstrap, Tailwind, Skeleton passed | 0 |
| Parity/diff checks | Route/core/runtime copies and `git diff --check` passed | 0 |

The migration ran after a local backup at `/tmp/medreach-field-fusion-backup-20260914`. Its repeat dry-run planned zero new claims and zero metadata repairs. Existing 10 directory-linked hospitals and 59 directory listing records remained.

## 9. Remaining limitations

Historical source-page excerpts and 76 historical parser versions cannot be recovered from stored normalized records. The UI labels those gaps rather than fabricating evidence. Eight field conflicts still need human decisions. Claims from multi-page specialty extraction retain page URLs but not an independent quote for every specialty item. The standalone MongoDB deployment cannot guarantee crash-atomic audit/state updates. Hospital ownership proof and a distinct manual merge/override operation are future work. No claim is made that external hospital availability is live unless a recent verified observation exists. No next milestone is included in this report.
