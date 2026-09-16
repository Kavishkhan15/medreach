import { HospitalFacility } from "../models/HospitalFacility.js";
import { FacilitySourceClaim } from "../models/FacilitySourceClaim.js";
import { CrawlResult } from "../models/CrawlResult.js";
import { DataSource } from "../models/DataSource.js";
import { fuseFacilityClaims } from "./facilityClaimFusion.js";
import { syncFacilityConflict } from "./facilityConflictService.js";

const LEGACY_SOURCE = "Legacy MedReach facility snapshot (source unrecorded)";
const keyOf = (hospital, facility, source) => `${hospital}:${facility}:${source}`;
const validCapability = (value) => ["yes", "no", "unknown"].includes(value) ? value : "unknown";
const observedDate = (value, fallback) => Number.isFinite(new Date(value).getTime()) ? new Date(value) : new Date(fallback);

// Idempotent migration. CrawlResult supplies source-specific evidence when it
// exists. An old facility row without a source is explicitly labelled as an
// internal legacy snapshot; it is never attributed to an external website.
export async function backfillFacilityClaims({ dryRun = true } = {}) {
  const [sources, results, facilities, existing] = await Promise.all([
    DataSource.find().lean(),
    CrawlResult.find({ valid: true, applied: true, hospital: { $ne: null } }).sort({ createdAt: 1 }).lean(),
    HospitalFacility.find().lean(),
    FacilitySourceClaim.find().lean(),
  ]);
  const sourceById = new Map(sources.map((source) => [String(source._id), source]));
  const facilityByKey = new Map(facilities.map((facility) => [`${facility.hospital}:${facility.facility}`, facility]));
  const candidates = new Map();
  for (const result of results) {
    const payload = result.payload || {};
    if (!Array.isArray(payload.facilities)) continue; // directory identity has no facilities
    for (const item of payload.facilities) {
      if (!item?.facility || !["yes", "no", "unknown"].includes(item.capability)) continue;
      const key = keyOf(result.hospital, item.facility, result.source);
      const snapshot = facilityByKey.get(`${result.hospital}:${item.facility}`);
      const snapshotConfidence = String(snapshot?.source || "") === String(result.source)
        ? snapshot?.confidence : null;
      candidates.set(key, {
        hospital: result.hospital, facility: item.facility, source: result.source,
        capability: item.capability,
        confidence: result.confidence && result.confidence !== "UNKNOWN"
          ? result.confidence : snapshotConfidence || "UNKNOWN",
        sourcePageUrl: item.sourcePageUrl || payload.provenance?.sourcePageUrl
          || sourceById.get(String(result.source))?.url || `medreach://crawl-result/${result._id}`,
        evidenceText: String(item.evidenceText || `Historical normalized crawl record: ${item.facility} capability ${item.capability}; source excerpt unavailable.`).slice(0, 200),
        evidenceKind: item.evidenceText ? "source_excerpt" : "normalized_record",
        parserVersion: payload.provenance?.parserVersion || undefined,
        observedAt: observedDate(payload.retrievedAt, result.createdAt),
        verificationStatus: "unverified",
      });
    }
  }

  const existingByKey = new Map(existing.map((claim) => [keyOf(claim.hospital, claim.facility, claim.source), claim]));
  const hasKnownClaim = (facility) => [...candidates.values(), ...existing].some((claim) =>
    String(claim.hospital) === String(facility.hospital) && claim.facility === facility.facility);
  let legacySource = sources.find((source) => source.name === LEGACY_SOURCE && source.type === "manual_verification");
  const legacyNeeded = facilities.some((facility) => !facility.source && !hasKnownClaim(facility));
  if (legacyNeeded && !legacySource && !dryRun) {
    legacySource = await DataSource.create({ name: LEGACY_SOURCE, type: "manual_verification", accessMethod: "manual", enabled: false });
  }
  for (const facility of facilities) {
    if (!facility.source && hasKnownClaim(facility)) continue;
    const source = facility.source || legacySource?._id;
    if (!source && dryRun) {
      // Count this prospective claim without creating a source during preview.
      candidates.set(keyOf(facility.hospital, facility.facility, "legacy"), { legacyPending: true });
      continue;
    }
    const key = keyOf(facility.hospital, facility.facility, source);
    if (candidates.has(key)) continue;
    candidates.set(key, {
      hospital: facility.hospital, facility: facility.facility, source,
      capability: validCapability(facility.capability), confidence: facility.confidence || "UNKNOWN",
      sourcePageUrl: facility.source && sourceById.get(String(source))?.url
        || `medreach://hospital-facility/${facility._id}`,
      evidenceKind: "legacy_snapshot",
      observedAt: facility.lastUpdated || facility.updatedAt || facility.createdAt || new Date(),
      verificationStatus: "unverified",
    });
  }

  // Claims created by earlier releases may lack evidence metadata. Repair
  // those in place without changing capability or prior review decisions.
  for (const claim of existing) {
    const key = keyOf(claim.hospital, claim.facility, claim.source);
    if (candidates.has(key)) continue;
    candidates.set(key, {
      hospital: claim.hospital, facility: claim.facility, source: claim.source,
      capability: claim.capability, confidence: claim.confidence || "UNKNOWN",
      sourcePageUrl: sourceById.get(String(claim.source))?.url || `medreach://facility-claim/${claim._id}`,
      evidenceKind: "legacy_snapshot",
      observedAt: claim.observedAt || claim.createdAt || new Date(),
      verificationStatus: claim.verificationStatus || "unverified",
    });
  }

  const summary = { dryRun, candidates: candidates.size, created: 0, metadataRepaired: 0, unchanged: 0, facilitiesResolved: 0,
    legacySnapshots: [...candidates.values()].filter((candidate) => candidate.evidenceKind === "legacy_snapshot" || candidate.legacyPending).length,
    sourceBreakdown: {},
    legacySourceCreated: Boolean(legacyNeeded && !sources.some((s) => s.name === LEGACY_SOURCE)) && !dryRun };
  for (const [key, candidate] of candidates) {
    const sourceLabel = sourceById.get(String(candidate.source))?.sourceKey || (candidate.legacyPending || String(candidate.source) === String(legacySource?._id) ? "legacy_unattributed" : "other_source");
    summary.sourceBreakdown[sourceLabel] = (summary.sourceBreakdown[sourceLabel] || 0) + 1;
    const old = existingByKey.get(key);
    if (old) {
      const patch = {};
      if (!old.sourcePageUrl) patch.sourcePageUrl = candidate.sourcePageUrl;
      if (!old.evidenceText && candidate.evidenceText) patch.evidenceText = candidate.evidenceText.slice(0, 200);
      if (!old.observedAt) patch.observedAt = candidate.observedAt;
      if (!old.confidence) patch.confidence = candidate.confidence;
      if (!old.verificationStatus) patch.verificationStatus = "unverified";
      if (Object.keys(patch).length) {
        summary.metadataRepaired++;
        if (!dryRun) await FacilitySourceClaim.updateOne({ _id: old._id }, { $set: patch });
      } else summary.unchanged++;
    } else {
      summary.created++;
      if (!dryRun && !candidate.legacyPending) await FacilitySourceClaim.updateOne(
        { hospital: candidate.hospital, facility: candidate.facility, source: candidate.source },
        { $setOnInsert: candidate }, { upsert: true, runValidators: true }
      );
    }
  }

  // A migration must not alter live availability or overwrite verified claims.
  // Recompute only the capability snapshot, retaining all source claims.
  if (!dryRun) {
    for (const facility of facilities) {
      const claims = await FacilitySourceClaim.find({ hospital: facility.hospital, facility: facility.facility }).lean();
      const resolved = fuseFacilityClaims(claims);
      await syncFacilityConflict({ hospital: facility.hospital, facility: facility.facility, claims, resolution: resolved });
      await HospitalFacility.updateOne({ _id: facility._id }, { $set: {
        capability: resolved.capability, capabilityConflict: resolved.conflict,
        source: resolved.selectedClaim?.source || null,
        confidence: resolved.selectedClaim?.confidence || "UNKNOWN",
        status: "unknown", count: null,
      } });
      summary.facilitiesResolved++;
    }
  }
  return summary;
}
