import { Hospital } from "../models/Hospital.js";
import { HospitalFacility } from "../models/HospitalFacility.js";
import { FacilitySourceClaim } from "../models/FacilitySourceClaim.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { DataSource } from "../models/DataSource.js";
import { fuseFacilityClaims } from "./facilityClaimFusion.js";

const groups = [
  { kind: "blood_bank", label: "Blood Bank", facilities: ["Blood Bank"] },
  { kind: "diagnostic", label: "Diagnostics", facilities: ["CT", "MRI"] },
  { kind: "ambulance", label: "Ambulance", facilities: ["Ambulance"] },
];

export async function syncHospitalResources(hospitalId = null) {
  const hospitals = await Hospital.find(hospitalId ? { _id: hospitalId } : {}).lean();
  let updated = 0;
  for (const hospital of hospitals) {
    const [facilities, claims] = await Promise.all([
      HospitalFacility.find({ hospital: hospital._id, facility: { $in: ["Blood Bank", "CT", "MRI", "Ambulance"] } }).lean(),
      FacilitySourceClaim.find({ hospital: hospital._id, facility: { $in: ["Blood Bank", "CT", "MRI", "Ambulance"] } })
        .populate({ path: "source", model: DataSource, select: "name url" }).lean(),
    ]);
    for (const group of groups) {
      const supported = facilities.filter((facility) => group.facilities.includes(facility.facility)
        && facility.capability === "yes" && !facility.capabilityConflict);
      const key = { hospital: hospital._id, kind: group.kind, derivedFromCapability: group.label };
      if (!supported.length) {
        await ResourceProvider.updateOne(key, { $set: { active: false } });
        continue;
      }
      const evidence = supported.map((facility) => {
        const selected = fuseFacilityClaims(claims.filter((claim) => claim.facility === facility.facility)).selectedClaim;
        return selected ? { service: facility.facility, sourceName: selected.source?.name || "Source unavailable",
          sourcePageUrl: selected.sourcePageUrl, evidenceText: selected.evidenceText,
          observedAt: selected.observedAt, confidence: selected.confidence,
          verificationStatus: selected.verificationStatus } : null;
      }).filter(Boolean);
      // A capability without a corresponding source claim is not enough to
      // publish a source-backed resource listing.
      if (!evidence.length) continue;
      const best = evidence.find((entry) => entry.verificationStatus === "verified") || evidence[0];
      await ResourceProvider.findOneAndUpdate(key, { $set: {
        active: true, name: `${hospital.name} — ${group.label}`, address: hospital.address,
        locality: hospital.locality, city: hospital.city || "Mumbai", phone: hospital.phone || hospital.emergencyPhone,
        website: hospital.website, location: hospital.location?.coordinates?.some((n) => n !== 0) ? hospital.location : undefined,
        services: supported.map((facility) => facility.facility), serviceEvidence: evidence,
        sourceName: best.sourceName, sourceUrl: best.sourcePageUrl, observedAt: best.observedAt,
        confidence: best.confidence, verificationStatus: best.verificationStatus,
        demo: false,
      } }, { upsert: true, new: true, runValidators: true });
      updated++;
    }
  }
  return { hospitals: hospitals.length, updated };
}
