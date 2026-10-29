// Public hospital data contract. Static capability and current availability
// are independent signals. Only a verified, recent observation may produce a
// non-unknown current status; stored capability evidence never does.
import { freshnessLabel } from "./freshnessService.js";
export const CURRENT_AVAILABILITY_MAX_AGE_MS = 30 * 60 * 1000;

const CURRENT_STATUSES = new Set(["available", "limited", "unavailable"]);

export function composeHospitalDataView(hospital, facilities = [], observations = [], now = new Date()) {
  const hospitalId = String(hospital._id);
  const latest = new Map();
  for (const observation of observations) {
    if (String(observation.hospital) !== hospitalId) continue;
    const at = new Date(observation.observedAt || observation.retrievedAt || 0).getTime();
    if (!Number.isFinite(at) || at <= 0 || at > now.getTime()) continue;
    const previous = latest.get(observation.facility);
    if (!previous || at > previous.at) latest.set(observation.facility, { value: observation, at });
  }

  const names = new Set([
    ...facilities.filter((f) => String(f.hospital) === hospitalId).map((f) => f.facility),
    ...latest.keys(),
  ]);
  const facilityByName = new Map(
    facilities.filter((f) => String(f.hospital) === hospitalId).map((f) => [f.facility, f])
  );
  const resolvedFacilities = [...names].sort().map((name) => {
    const facility = facilityByName.get(name);
    const entry = latest.get(name);
    const observation = entry?.value;
    const current = observation?.verificationStatus === "verified"
      && CURRENT_STATUSES.has(observation.status)
      && now.getTime() - entry.at <= CURRENT_AVAILABILITY_MAX_AGE_MS;
    return {
      facility: name,
      capability: facility?.capability || "unknown",
      capabilityConflict: Boolean(facility?.capabilityConflict),
      capabilityConfidence: facility?.confidence || "UNKNOWN",
      capabilityFreshness: freshnessLabel(facility?.lastUpdated, now.getTime()),
      status: current ? observation.status : "unknown",
      count: current && Number.isSafeInteger(observation.quantity) && observation.quantity >= 0 ? observation.quantity : null,
      confidence: current ? observation.confidence || "UNKNOWN" : facility?.confidence || "UNKNOWN",
      capabilitySource: facility?.source ?? null,
      availabilitySource: current ? observation.source ?? null : null,
      availabilityMethod: current ? observation.verifiedBy ? "hospital_staff" : observation.source ? "data_source" : null : null,
      observedAt: current ? new Date(entry.at).toISOString() : null,
      lastObservedAt: entry ? new Date(entry.at).toISOString() : null,
    };
  });
  const emergency = resolvedFacilities.find((f) => f.facility === "Emergency Department")?.status;
  const emergencyStatus = emergency === "unavailable" ? "closed" : emergency || "unknown";
  const lastUpdated = latest.size
    ? new Date(Math.max(...[...latest.values()].map((x) => x.at))).toISOString()
    : null;
  return {
    ...hospital,
    facilities: resolvedFacilities,
    emergencyStatus,
    // Legacy zero was a default, not a measured bed count. There is no
    // hospital-wide live-bed observation in this data contract.
    bedsAvailable: null,
    lastUpdated,
  };
}
