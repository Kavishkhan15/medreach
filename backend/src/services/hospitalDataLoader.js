import { HospitalFacility } from "../models/HospitalFacility.js";
import { AvailabilityObservation } from "../models/AvailabilityObservation.js";
import { composeHospitalDataView } from "./hospitalDataView.js";
import { HospitalFieldConflict } from "../models/HospitalFieldConflict.js";
import { HospitalFieldClaim } from "../models/HospitalFieldClaim.js";
import { resolveHospitalField } from "./hospitalFieldFusion.js";
import { FacilitySourceClaim } from "../models/FacilitySourceClaim.js";
import { fuseFacilityClaims } from "./facilityClaimFusion.js";
import { freshnessLabel } from "./freshnessService.js";
import { DataSource } from "../models/DataSource.js";

const facilityFields = "hospital facility capability capabilityConflict confidence lastUpdated source";
const fieldClaimFields = "hospital field value source sourcePageUrl sourcePageUrls evidenceText evidenceKind observedAt parserVersion confidence verificationStatus";
const facilityClaimFields = "hospital facility capability source sourcePageUrl evidenceText evidenceKind observedAt parserVersion confidence verificationStatus";

// Keep both legacy retrieved-only rows and observed timestamps authoritative.
// Separate indexed sorts avoid computing and sorting effectiveAt across every
// historical row; each branch returns at most one row per hospital/facility.
async function latestHospitalObservations(ids, now) {
  const latestFor = (field, filter) => AvailabilityObservation.aggregate([
    { $match: { hospital: { $in: ids }, ...filter } },
    { $sort: { hospital: 1, facility: 1, [field]: -1, _id: -1 } },
    { $group: { _id: { hospital: "$hospital", facility: "$facility" }, item: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$item" } },
    { $project: { hospital: 1, facility: 1, observedAt: 1, retrievedAt: 1, verificationStatus: 1, status: 1, quantity: 1, confidence: 1, source: 1, verifiedBy: 1 } },
  ]);
  // Match the public composer's valid-time rules before taking the first row;
  // a future report must not displace an earlier legitimate observation.
  const branches = await Promise.all([
    latestFor("observedAt", { observedAt: { $gt: new Date(0), $lte: now } }),
    latestFor("retrievedAt", { observedAt: null, retrievedAt: { $gt: new Date(0), $lte: now } }),
  ]);
  const latest = new Map();
  for (const observation of branches.flat()) {
    const key = `${observation.hospital}:${observation.facility}`;
    const previous = latest.get(key);
    const timestamp = row => new Date(row.observedAt || row.retrievedAt || 0).getTime();
    if (!previous || timestamp(observation) > timestamp(previous)
      || (timestamp(observation) === timestamp(previous) && String(observation._id) > String(previous._id))) latest.set(key, observation);
  }
  return [...latest.values()];
}

const byHospital = rows => {
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.hospital);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
};

// Derived-status counts need current availability, not full provenance journals.
export async function withHospitalAvailability(hospitals) {
  if (!hospitals.length) return [];
  const ids = hospitals.map(hospital => hospital._id), now = new Date();
  const [facilities, observations] = await Promise.all([
    HospitalFacility.find({ hospital: { $in: ids } }).select(facilityFields).lean(),
    latestHospitalObservations(ids, now),
  ]);
  const facilitiesByHospital = byHospital(facilities), observationsByHospital = byHospital(observations);
  return hospitals.map(hospital => composeHospitalDataView(hospital, facilitiesByHospital.get(String(hospital._id)) || [], observationsByHospital.get(String(hospital._id)) || [], now));
}

// Batch-load the latest evidence for a page of hospitals. Two timestamp queries
// find the latest observation per hospital/facility, avoiding N+1 reads.
export async function withHospitalData(hospitals) {
  if (!hospitals.length) return [];
  const ids = hospitals.map((hospital) => hospital._id);
  const now = new Date();
  const [facilities, observations, fieldConflicts, fieldClaims, facilityClaims] = await Promise.all([
    HospitalFacility.find({ hospital: { $in: ids } }).select(facilityFields).lean(),
    latestHospitalObservations(ids, now),
    HospitalFieldConflict.aggregate([
      { $match: { hospital: { $in: ids } } },
      { $project: { hospital: 1, field: 1, status: 1, sourceCount: { $size: { $ifNull: ["$claims", []] } } } },
    ]),
    HospitalFieldClaim.find({ hospital: { $in: ids } })
      .select(fieldClaimFields).lean(),
    FacilitySourceClaim.find({ hospital: { $in: ids } })
      .select(facilityClaimFields).lean(),
  ]);
  // Resolve shared sources once for both claim families. Review/audit history is
  // deliberately excluded above; the public evidence contract stays unchanged.
  const sourceIds = [...new Set([...fieldClaims, ...facilityClaims].filter(claim => claim.source).map(claim => String(claim.source)))];
  const sources = sourceIds.length ? await DataSource.find({ _id: { $in: sourceIds } }).select("name type sourceKey url").lean() : [];
  const sourcesById = new Map(sources.map(source => [String(source._id), source]));
  for (const claim of [...fieldClaims, ...facilityClaims]) claim.source = sourcesById.get(String(claim.source)) || null;
  return composeHospitalEvidence(hospitals, { facilities, observations, fieldConflicts, fieldClaims, facilityClaims }, now);
}

// Both batched evidence reads and joined directory reads use the same public
// composer. The query strategy must never change the availability policy.
export function composeHospitalEvidence(hospitals, { facilities, observations, fieldConflicts, fieldClaims, facilityClaims }, now = new Date()) {
  const facilitiesByHospital = byHospital(facilities);
  const observationsByHospital = byHospital(observations);
  const conflictsByHospital = byHospital(fieldConflicts);
  const fieldClaimsByHospital = byHospital(fieldClaims);
  const facilityClaimsByHospital = byHospital(facilityClaims);
  return hospitals.map((hospital) => {
    const key = String(hospital._id);
    const hospitalClaims = fieldClaimsByHospital.get(key) || [];
    const fieldProvenance = {};
    const claimsByField = new Map();
    for (const claim of hospitalClaims) {
      if (!claimsByField.has(claim.field)) claimsByField.set(claim.field, []);
      claimsByField.get(claim.field).push(claim);
    }
    for (const [field, claims] of claimsByField) {
      const selected = resolveHospitalField(field, claims);
      const claim = selected.selectedClaim;
      fieldProvenance[field] = claim ? {
        source: claim.source ? { name: claim.source.name, type: claim.source.type,
          sourceKey: claim.source.sourceKey || null, url: claim.source.url || null } : null,
        sourcePageUrl: claim.sourcePageUrl,
        sourcePageUrls: claim.sourcePageUrls?.length ? claim.sourcePageUrls : [claim.sourcePageUrl],
        evidenceText: claim.evidenceText || null,
        evidenceKind: claim.evidenceKind,
        observedAt: claim.observedAt,
        parserVersion: claim.parserVersion,
        confidence: claim.confidence,
        verificationStatus: claim.verificationStatus,
        freshness: freshnessLabel(claim.observedAt, now.getTime()),
        conflict: selected.conflict,
      } : { source: null, confidence: "UNKNOWN", freshness: "UNKNOWN", conflict: selected.conflict };
    }
    const view = composeHospitalDataView(hospital, facilitiesByHospital.get(key) || [], observationsByHospital.get(key) || [], now);
    view.facilities = view.facilities.map((facility) => {
      const matching = (facilityClaimsByHospital.get(key) || []).filter((claim) => claim.facility === facility.facility);
      const selected = fuseFacilityClaims(matching).selectedClaim;
      return { ...facility, capabilityProvenance: selected ? {
        source: selected.source ? { name: selected.source.name, type: selected.source.type,
          url: selected.source.url || null } : null,
        sourcePageUrl: selected.sourcePageUrl, evidenceText: selected.evidenceText || null,
        evidenceKind: selected.evidenceKind, observedAt: selected.observedAt,
        parserVersion: selected.parserVersion, confidence: selected.confidence,
        verificationStatus: selected.verificationStatus,
      } : null };
    });
    return {
      ...view,
      fieldProvenance,
      fieldConflicts: (conflictsByHospital.get(key) || [])
        .map((conflict) => ({ field: conflict.field, status: conflict.status, sourceCount: conflict.sourceCount })),
    };
  });
}
