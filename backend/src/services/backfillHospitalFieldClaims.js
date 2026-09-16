import { Hospital } from "../models/Hospital.js";
import { DataSource } from "../models/DataSource.js";
import { CrawlResult } from "../models/CrawlResult.js";
import { HospitalFieldClaim, HOSPITAL_CLAIM_FIELDS } from "../models/HospitalFieldClaim.js";
import { normalizeFieldValue, sameHospitalField, resolveStoredField } from "./hospitalFieldFusion.js";

const LEGACY_NAME = "Legacy MedReach hospital field snapshot (source unrecorded)";
const keyOf = (hospital, field, source) => `${hospital}:${field}:${source}`;

// Backfill source-specific identity/contact/specialty claims from retained
// CrawlResults. A current hospital value that no source supports is labelled
// as an internal legacy snapshot, never attributed to an arbitrary website.
export async function backfillHospitalFieldClaims({ dryRun = true } = {}) {
  const [hospitals, sources, results, existing] = await Promise.all([
    Hospital.find().lean(), DataSource.find().lean(),
    CrawlResult.find({ valid: true, applied: true, hospital: { $ne: null } }).sort({ createdAt: 1 }).lean(),
    HospitalFieldClaim.find().lean(),
  ]);
  const sourceById = new Map(sources.map((source) => [String(source._id), source]));
  const candidates = new Map();
  for (const result of results) {
    const source = sourceById.get(String(result.source));
    if (!source) continue;
    const payload = result.payload || {};
    const listing = payload.directoryListing;
    const values = listing ? { ...listing, website: listing.officialWebsite }
      : { ...payload.hospital, specialties: payload.specialties };
    for (const field of HOSPITAL_CLAIM_FIELDS) {
      const value = normalizeFieldValue(field, values?.[field]);
      if (value === null) continue;
      const fieldEvidence = payload.fieldEvidence?.[field];
      const page = fieldEvidence?.sourcePageUrl || (listing ? source.url || `medreach://crawl-result/${result._id}`
        : payload.provenance?.sourcePageUrl || source.url || `medreach://crawl-result/${result._id}`);
      const excerpt = typeof fieldEvidence?.evidenceText === "string" && fieldEvidence.evidenceText.trim()
        ? fieldEvidence.evidenceText.trim().slice(0, 300) : null;
      candidates.set(keyOf(result.hospital, field, source._id), {
        hospital: result.hospital, field, source: source._id, value,
        sourcePageUrl: page,
        sourcePageUrls: [...new Set([page, ...(fieldEvidence?.sourcePageUrls || [])])],
        evidenceText: excerpt || `Historical normalized crawl record; excerpt unavailable: ${field} = ${JSON.stringify(value)}`.slice(0, 300),
        evidenceKind: excerpt ? "source_excerpt" : "normalized_record",
        confidence: result.confidence || "UNKNOWN",
        observedAt: payload.retrievedAt || result.createdAt,
        parserVersion: payload.provenance?.parserVersion || "unknown_historical",
        verificationStatus: "unverified",
      });
    }
  }
  let legacy = sources.find((source) => source.name === LEGACY_NAME && source.type === "manual_verification");
  const existingByKey = new Map(existing.map((claim) => [keyOf(claim.hospital, claim.field, claim.source), claim]));
  const missing = [];
  for (const hospital of hospitals) {
    for (const field of HOSPITAL_CLAIM_FIELDS) {
      const value = normalizeFieldValue(field, hospital[field]);
      if (value === null) continue;
      const known = [...candidates.values(), ...existing].filter((claim) =>
        String(claim.hospital) === String(hospital._id) && claim.field === field);
      if (known.some((claim) => sameHospitalField(field, claim.value, value))) continue;
      missing.push({ hospital, field, value });
    }
  }
  if (missing.length && !legacy && !dryRun) legacy = await DataSource.create({
    name: LEGACY_NAME, type: "manual_verification", accessMethod: "manual", enabled: false,
  });
  for (const { hospital, field, value } of missing) {
    const source = legacy?._id || "legacy_pending";
    candidates.set(keyOf(hospital._id, field, source), {
      hospital: hospital._id, field, source, value,
      sourcePageUrl: `medreach://hospital-field/${hospital._id}/${field}`,
      sourcePageUrls: [`medreach://hospital-field/${hospital._id}/${field}`],
      evidenceText: `Legacy stored hospital field: ${field} = ${JSON.stringify(value)}`.slice(0, 300),
      evidenceKind: "legacy_snapshot", confidence: "UNKNOWN",
      observedAt: hospital.updatedAt || hospital.createdAt || new Date(),
      parserVersion: "unknown_historical",
      verificationStatus: "unverified",
    });
  }
  const summary = { dryRun, candidates: candidates.size, created: 0, unchanged: 0, metadataRepaired: 0, legacySnapshots: missing.length, conflicts: 0 };
  for (const [key, candidate] of candidates) {
    const previous = existingByKey.get(key);
    if (previous) {
      if (!previous.parserVersion) {
        summary.metadataRepaired++;
        if (!dryRun) await HospitalFieldClaim.updateOne({ _id: previous._id },
          { $set: { parserVersion: candidate.parserVersion || "unknown_historical" } });
      } else summary.unchanged++;
      continue;
    }
    summary.created++;
    if (!dryRun) await HospitalFieldClaim.updateOne(
      { hospital: candidate.hospital, field: candidate.field, source: candidate.source },
      { $setOnInsert: candidate }, { upsert: true, runValidators: true }
    );
  }
  for (const previous of existing) {
    if (previous.parserVersion || candidates.has(keyOf(previous.hospital, previous.field, previous.source))) continue;
    summary.metadataRepaired++;
    if (!dryRun) await HospitalFieldClaim.updateOne({ _id: previous._id },
      { $set: { parserVersion: "unknown_historical" } });
  }
  if (!dryRun) {
    const affected = new Set([...candidates.values()].map((candidate) => `${candidate.hospital}:${candidate.field}`));
    for (const pair of affected) {
      const separator = pair.lastIndexOf(":");
      const result = await resolveStoredField(pair.slice(0, separator), pair.slice(separator + 1));
      if (result.conflict) summary.conflicts++;
    }
  }
  return summary;
}
