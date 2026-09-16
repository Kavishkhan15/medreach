import { HospitalFacility } from "../models/HospitalFacility.js";
import { AvailabilityObservation } from "../models/AvailabilityObservation.js";
import { composeHospitalDataView } from "./hospitalDataView.js";
import { HospitalFieldConflict } from "../models/HospitalFieldConflict.js";
import { HospitalFieldClaim } from "../models/HospitalFieldClaim.js";
import { resolveHospitalField } from "./hospitalFieldFusion.js";
import { FacilitySourceClaim } from "../models/FacilitySourceClaim.js";
import { fuseFacilityClaims } from "./facilityClaimFusion.js";
import { freshnessLabel } from "./freshnessService.js";

// Batch-load the latest evidence for a page of hospitals. A single aggregation
// finds one latest observation per hospital/facility, avoiding N+1 reads.
export async function withHospitalData(hospitals) {
  if (!hospitals.length) return [];
  const ids = hospitals.map((hospital) => hospital._id);
  const [facilities, observations, fieldConflicts, fieldClaims, facilityClaims] = await Promise.all([
    HospitalFacility.find({ hospital: { $in: ids } }).lean(),
    AvailabilityObservation.aggregate([
      { $match: { hospital: { $in: ids } } },
      { $addFields: { effectiveAt: { $ifNull: ["$observedAt", "$retrievedAt"] } } },
      { $sort: { effectiveAt: -1, _id: -1 } },
      { $group: { _id: { hospital: "$hospital", facility: "$facility" }, item: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$item" } },
    ]),
    HospitalFieldConflict.find({ hospital: { $in: ids } }).lean(),
    HospitalFieldClaim.find({ hospital: { $in: ids } })
      .populate("source", "name type sourceKey url").lean(),
    FacilitySourceClaim.find({ hospital: { $in: ids } })
      .populate("source", "name type sourceKey url").lean(),
  ]);
  return hospitals.map((hospital) => {
    const hospitalClaims = fieldClaims.filter((claim) => String(claim.hospital) === String(hospital._id));
    const fieldProvenance = {};
    for (const field of new Set(hospitalClaims.map((claim) => claim.field))) {
      const selected = resolveHospitalField(field, hospitalClaims.filter((claim) => claim.field === field));
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
        freshness: freshnessLabel(claim.observedAt),
        conflict: selected.conflict,
      } : { source: null, confidence: "UNKNOWN", freshness: "UNKNOWN", conflict: selected.conflict };
    }
    const view = composeHospitalDataView(hospital, facilities, observations);
    view.facilities = view.facilities.map((facility) => {
      const matching = facilityClaims.filter((claim) => String(claim.hospital) === String(hospital._id) && claim.facility === facility.facility);
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
      fieldConflicts: fieldConflicts.filter((conflict) => String(conflict.hospital) === String(hospital._id))
        .map((conflict) => ({ field: conflict.field, status: conflict.status, sourceCount: conflict.claims.length })),
    };
  });
}
