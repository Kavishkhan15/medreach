// PersistenceService — the ONLY place crawler results become DB writes. It is
// given a `repo` (data-access object) so unit tests run with an in-memory fake
// and no live MongoDB. Enforces:
//   - change detection (skip writes when nothing changed)
//   - parser-anomaly protection (never overwrite good data with a broken parse)
//   - capability stored on HospitalFacility; availability ALWAYS as an
//     append-only AvailabilityObservation (status "unknown" from static sites)
//   - full provenance on every observation
//
// repo contract (all async):
//   findHospitalBySourceId(sourceId) -> hospital|null
//   getPreviousRecord(hospitalId)    -> normalizedRecord|null
//   upsertHospital(record)           -> hospital (has _id)
//   saveFacilityCapability(hospitalId, facility, {capability, source, confidence, at})
//   addObservation(observation)      -> observation
//   savePreviousRecord(hospitalId, record)
//   flagAnomaly(sourceId, info)

import { detectChange } from "../changeDetection/compare.js";
import { confidenceLevel } from "../confidence/confidence.js";

export class PersistenceService {
  constructor(repo, opts = {}) {
    this.repo = repo;
    this.opts = opts;
  }

  // Apply a normalized record. In dryRun, computes the plan but writes nothing.
  async apply(record, { source, dryRun = false } = {}) {
    const result = {
      sourceId: source?.sourceId ?? record?.provenance?.sourceId ?? null,
      classification: "NO_CHANGE",
      anomaly: false,
      recordsCreated: 0, recordsUpdated: 0, recordsSkipped: 0, recordsRejected: 0,
      observationsAdded: 0,
      changedFields: [],
      dryRun,
    };

    if (!record || !record.hospital?.name) {
      result.classification = "INVALID";
      result.recordsRejected = 1;
      return result;
    }

    const existing = await this.repo.findHospitalBySourceId(result.sourceId);
    const previous = existing ? await this.repo.getPreviousRecord(existing._id) : null;
    const { classification, changedFields, anomaly } = detectChange(previous, record);
    result.classification = anomaly ? "PARSING_ANOMALY" : classification;
    result.anomaly = anomaly;
    result.changedFields = changedFields;

    if (anomaly) {
      // Protect the DB: keep previous trusted data, flag for admin review.
      if (!dryRun) await this.repo.flagAnomaly(result.sourceId, { previousFields: changedFields, at: new Date().toISOString() });
      result.recordsSkipped = 1;
      return result;
    }
    if (classification === "NO_CHANGE") {
      result.recordsSkipped = 1;
      return result;
    }

    if (dryRun) {
      result.recordsUpdated = existing ? 1 : 0;
      result.recordsCreated = existing ? 0 : 1;
      return result;
    }

    // Persist hospital identity (capability-level, mutable).
    const hospital = await this.repo.upsertHospital(record);
    if (existing) result.recordsUpdated = 1; else result.recordsCreated = 1;

    const conf = confidenceLevel({
      sourceType: source?.sourceType || "hospital_site",
      timestamp: record.retrievedAt,
      verified: false,
      parseQuality: record.facilities.length ? 1 : 0.5,
    });

    // Facility CAPABILITY (latest known) + append-only AVAILABILITY observation.
    for (const f of record.facilities) {
      await this.repo.saveFacilityCapability(hospital._id, f.facility, {
        capability: f.capability, source: result.sourceId, confidence: conf, at: record.retrievedAt,
      });
      await this.repo.addObservation({
        hospitalId: hospital._id,
        facility: f.facility,
        status: "unknown", // availability NEVER inferred from static pages
        quantity: null, // never fabricate bed counts
        sourceId: result.sourceId,
        sourceUrl: record.provenance.sourcePageUrl,
        observedAt: record.retrievedAt,
        retrievedAt: record.retrievedAt,
        confidence: conf,
        verificationStatus: "unverified",
      });
      result.observationsAdded++;
    }

    await this.repo.savePreviousRecord(hospital._id, record);
    return result;
  }
}
