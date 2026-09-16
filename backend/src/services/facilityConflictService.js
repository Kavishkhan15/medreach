import { DataConflict } from "../models/DataConflict.js";

// Keep one durable conflict per hospital/facility. A verified claim may select
// a value, but every disagreeing source claim remains linked and inspectable.
export async function syncFacilityConflict({ hospital, facility, claims, resolution, actor = null }) {
  const key = { hospital, kind: "facility_capability", facility };
  const existing = await DataConflict.findOne(key);
  if (!resolution.conflict && !existing) return null;

  const selected = resolution.selectedClaim?.verificationStatus === "verified"
    ? resolution.selectedClaim : null;
  const status = resolution.conflict && !selected ? "open" : "resolved";
  const value = status === "resolved" ? resolution.capability : "unknown";
  const method = selected ? "verified_claim" : status === "resolved" ? "sources_agree" : null;
  const conflict = existing || new DataConflict(key);
  const previousClaimIds = new Set((conflict.claims || []).map(String));
  const nextClaimIds = claims.map((claim) => String(claim._id)).sort();
  const claimsChanged = nextClaimIds.length !== previousClaimIds.size
    || nextClaimIds.some((id) => !previousClaimIds.has(id));
  const changed = !existing || conflict.status !== status
    || conflict.resolvedValue !== value
    || String(conflict.selectedClaim || "") !== String(selected?._id || "")
    || claimsChanged;
  if (!changed) return conflict;

  conflict.status = status;
  conflict.claims = claims.map((claim) => claim._id);
  conflict.resolvedValue = value;
  conflict.selectedClaim = selected?._id || null;
  conflict.resolutionMethod = method;
  conflict.history.push({ status, value, method, actor, at: new Date() });
  await conflict.save();
  return conflict;
}
