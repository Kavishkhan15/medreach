import { Hospital } from "../models/Hospital.js";
import { DataSource } from "../models/DataSource.js";
import { FacilitySourceClaim } from "../models/FacilitySourceClaim.js";
import { HospitalFacility } from "../models/HospitalFacility.js";
import { AuditLog } from "../models/AuditLog.js";
import { canManageHospital } from "../services/hospitalAccess.js";
import { fuseFacilityClaims } from "../services/facilityClaimFusion.js";
import { syncFacilityConflict } from "../services/facilityConflictService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

async function assignedHospital(req, res) {
  const hospital = await Hospital.findById(req.params.id);
  if (!hospital) { res.status(404).json({ error: "Hospital not found" }); return null; }
  if (!canManageHospital(req.user, hospital)) { res.status(403).json({ error: "Not assigned to this hospital" }); return null; }
  return hospital;
}

export const listStaffFacilityClaims = asyncHandler(async (req, res) => {
  const hospital = await assignedHospital(req, res);
  if (!hospital) return;
  const data = await FacilitySourceClaim.find({ hospital: hospital._id })
    .populate("source", "name type url").sort({ observedAt: -1 }).limit(100).lean();
  res.json({ data });
});

export const submitStaffFacilityClaim = asyncHandler(async (req, res) => {
  const hospital = await assignedHospital(req, res);
  if (!hospital) return;
  const { facility, capability } = req.body;
  const evidenceText = typeof req.body.evidenceText === "string" ? req.body.evidenceText.trim() : "";
  const sourceName = `Hospital staff assertion: ${hospital._id}:${req.user.id}`;
  let source = await DataSource.findOne({ name: sourceName, type: "manual_verification", hospital: hospital._id });
  if (!source) source = await DataSource.create({ name: sourceName, type: "manual_verification",
    accessMethod: "manual", enabled: false, hospital: hospital._id,
    url: `medreach://hospital/${hospital._id}/staff/${req.user.id}` });
  const key = { hospital: hospital._id, facility, source: source._id };
  const before = await FacilitySourceClaim.findOne(key).lean();
  const observedAt = new Date();
  const claim = await FacilitySourceClaim.findOneAndUpdate(key, { $set: {
    capability, confidence: "MEDIUM", sourcePageUrl: source.url,
    evidenceText, evidenceKind: "normalized_record", parserVersion: "staff-manual-v1",
    observedAt, verificationStatus: "unverified", assertedBy: req.user.id,
    reviewedBy: null, reviewedAt: null, reviewNote: null,
  } }, { upsert: true, new: true, runValidators: true });
  try {
    await AuditLog.create({ user: req.user.id, action: before ? "update" : "create",
      entityType: "FacilitySourceClaim", entityId: claim._id,
      before: before || undefined, after: claim.toObject(), requestId: req.id });
  } catch (error) {
    if (before) await FacilitySourceClaim.replaceOne({ _id: claim._id }, before);
    else await FacilitySourceClaim.deleteOne({ _id: claim._id });
    throw error;
  }
  const claims = await FacilitySourceClaim.find({ hospital: hospital._id, facility }).lean();
  const resolution = fuseFacilityClaims(claims);
  await syncFacilityConflict({ hospital: hospital._id, facility, claims, resolution, actor: req.user.id });
  await HospitalFacility.findOneAndUpdate({ hospital: hospital._id, facility }, { $set: {
    capability: resolution.capability, capabilityConflict: resolution.conflict,
    source: resolution.selectedClaim?.source || null,
    confidence: resolution.selectedClaim?.confidence || "UNKNOWN",
  } }, { upsert: true, runValidators: true });
  res.status(before ? 200 : 201).json({ claim, resolution: { capability: resolution.capability, conflict: resolution.conflict } });
});
