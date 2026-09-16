import { HospitalFieldClaim, HOSPITAL_CLAIM_FIELDS } from "../models/HospitalFieldClaim.js";
import { HospitalFieldConflict } from "../models/HospitalFieldConflict.js";
import { Hospital } from "../models/Hospital.js";
import { canonicalHospitalName } from "../_crawler/identity/hospitalIdentity.js";

const CONFIDENCE = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
const isPresent = (value) => Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0;

export function normalizeFieldValue(field, value) {
  if (!HOSPITAL_CLAIM_FIELDS.includes(field) || !isPresent(value)) return null;
  if (field === "specialties") {
    if (!Array.isArray(value)) return null;
    const unique = new Map();
    for (const item of value) {
      if (typeof item === "string" && item.trim() && !unique.has(item.trim().toLowerCase())) {
        unique.set(item.trim().toLowerCase(), item.trim());
      }
    }
    return unique.size ? [...unique.values()].sort((a, b) => a.localeCompare(b)) : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (field === "pincode" && !/^\d{6}$/.test(normalized)) return null;
  if (field === "website") {
    try { if (!["http:", "https:"].includes(new URL(normalized).protocol)) return null; }
    catch { return null; }
  }
  return normalized;
}

function signature(field, value) {
  if (field === "specialties") return JSON.stringify((value || []).map((x) => x.toLowerCase()).sort());
  if (field === "name") return canonicalHospitalName(value);
  if (["phone", "emergencyPhone"].includes(field)) return String(value).replace(/\D/g, "");
  if (field === "website") {
    try { const url = new URL(value); return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}`; } catch { return String(value).toLowerCase(); }
  }
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const sameHospitalField = (field, left, right) => signature(field, left) === signature(field, right);

export function resolveHospitalField(field, claims) {
  const usable = claims.filter((claim) => claim.verificationStatus !== "rejected" && isPresent(claim.value));
  const verified = usable.filter((claim) => claim.verificationStatus === "verified");
  const pool = verified.length ? verified : usable;
  const allValues = new Set(usable.map((claim) => signature(field, claim.value)));
  const poolValues = new Set(pool.map((claim) => signature(field, claim.value)));
  const conflict = allValues.size > 1;
  if (poolValues.size !== 1 || pool.length === 0) return { conflict, selectedClaim: null, value: null };
  if (conflict && verified.length === 0) return { conflict, selectedClaim: null, value: null };
  const selectedClaim = [...pool].sort((a, b) =>
    (CONFIDENCE[b.confidence] || 0) - (CONFIDENCE[a.confidence] || 0)
    || new Date(b.observedAt || 0) - new Date(a.observedAt || 0))[0];
  return { conflict, selectedClaim, value: selectedClaim.value };
}

export async function resolveStoredField(hospitalId, field, actor = null) {
  const claims = await HospitalFieldClaim.find({ hospital: hospitalId, field }).lean();
  const resolution = resolveHospitalField(field, claims);
  const key = { hospital: hospitalId, field };
  const existing = await HospitalFieldConflict.findOne(key);
  if (resolution.conflict || existing) {
    const conflict = existing || new HospitalFieldConflict(key);
    const status = resolution.conflict && resolution.selectedClaim?.verificationStatus !== "verified" ? "open" : "resolved";
    const nextIds = claims.map((claim) => String(claim._id)).sort();
    const oldIds = (conflict.claims || []).map(String).sort();
    const claimSignature = JSON.stringify(claims.map((claim) => [String(claim._id), signature(field, claim.value), claim.verificationStatus]).sort((a, b) => a[0].localeCompare(b[0])));
    if (!existing || conflict.status !== status || String(conflict.selectedClaim || "") !== String(resolution.selectedClaim?._id || "")
      || JSON.stringify(nextIds) !== JSON.stringify(oldIds) || conflict.claimSignature !== claimSignature) {
      conflict.status = status;
      conflict.claims = claims.map((claim) => claim._id);
      conflict.selectedClaim = status === "resolved" ? resolution.selectedClaim?._id || null : null;
      conflict.resolvedValue = status === "resolved" ? resolution.value : null;
      conflict.claimSignature = claimSignature;
      conflict.history.push({ status, selectedClaim: conflict.selectedClaim, value: conflict.resolvedValue, actor, at: new Date() });
      await conflict.save();
    }
  }
  // On an unresolved disagreement, keep the last public snapshot and expose
  // its conflict flag through the API. Never overwrite it with a new claimant.
  if (resolution.selectedClaim) {
    const patch = { [field]: resolution.value };
    if (field === "specialties") patch.departments = resolution.value;
    await Hospital.updateOne({ _id: hospitalId }, { $set: patch }, { runValidators: true });
  }
  return resolution;
}

export async function recordHospitalFieldClaims({ hospitalId, source, values, sourcePageUrl, fieldEvidence = {}, observedAt, parserVersion, confidence = "UNKNOWN", assertedBy = null, verificationStatus = "unverified" }) {
  if (!source?._id) throw new Error("hospital_field_source_required");
  for (const field of HOSPITAL_CLAIM_FIELDS) {
    const value = normalizeFieldValue(field, values?.[field]);
    if (value === null) continue;
    const key = { hospital: hospitalId, field, source: source._id };
    const previous = await HospitalFieldClaim.findOne(key).lean();
    const changed = previous && signature(field, previous.value) !== signature(field, value);
    const evidence = fieldEvidence[field];
    const page = evidence?.sourcePageUrl || sourcePageUrl || source.url || `medreach://source/${source._id}`;
    const pages = [...new Set([page, ...(evidence?.sourcePageUrls || [])])];
    const excerpt = typeof evidence?.evidenceText === "string" && evidence.evidenceText.trim()
      ? evidence.evidenceText.trim().slice(0, 300) : null;
    await HospitalFieldClaim.updateOne(key, { $set: {
      value, sourcePageUrl: page, sourcePageUrls: pages, observedAt: observedAt ? new Date(observedAt) : new Date(),
      evidenceText: excerpt || `${assertedBy ? "Hospital administrator assertion" : "Normalized source record; excerpt unavailable"}: ${field} = ${JSON.stringify(value)}`.slice(0, 300),
      evidenceKind: assertedBy ? "manual_assertion" : excerpt ? "source_excerpt" : sourcePageUrl ? "normalized_record" : "legacy_snapshot",
      parserVersion: parserVersion || (assertedBy ? "manual_assertion-v1" : "unknown_unrecorded"), confidence,
      ...(assertedBy ? { assertedBy } : {}),
      ...(verificationStatus === "verified" ? { verificationStatus: "verified", reviewedBy: assertedBy, reviewedAt: new Date() }
        : changed ? { verificationStatus: "unverified", reviewedBy: null, reviewedAt: null, reviewNote: null } : {}),
    } }, { upsert: true, runValidators: true });
    await resolveStoredField(hospitalId, field);
  }
}
