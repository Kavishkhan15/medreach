import { Hospital } from "../models/Hospital.js";
import { HospitalFacility } from "../models/HospitalFacility.js";
import { FacilitySourceClaim } from "../models/FacilitySourceClaim.js";
import { DataConflict } from "../models/DataConflict.js";
import { AuditLog } from "../models/AuditLog.js";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hashIp } from "../utils/audit.js";
import { applyReview, VALID_DECISIONS } from "../services/verificationService.js";
import { fuseFacilityClaims } from "../services/facilityClaimFusion.js";
import { syncFacilityConflict } from "../services/facilityConflictService.js";
import { canManageHospital } from "../services/hospitalAccess.js";
import { HospitalFieldClaim } from "../models/HospitalFieldClaim.js";
import { HospitalFieldConflict } from "../models/HospitalFieldConflict.js";
import { resolveStoredField } from "../services/hospitalFieldFusion.js";

// GET /api/admin/overview — dashboard cards.
export const overview = asyncHandler(async (_req, res) => {
  const [hospitals, verified, verificationQueue] = await Promise.all([
    Hospital.countDocuments(),
    Hospital.countDocuments({ verificationStatus: "verified" }),
    Hospital.countDocuments({ verificationStatus: { $ne: "verified" }, approvalStatus: { $ne: "rejected" } }),
  ]);
  res.json({ hospitals, verified, verificationQueue });
});

// POST /api/admin/hospitals/:id/verify — approve/reject/override/mark_stale (audited).
export const verifyHospital = asyncHandler(async (req, res) => {
  const { decision } = req.body;
  if (!VALID_DECISIONS.includes(decision)) return res.status(400).json({ error: "Invalid decision" });
  const hospital = await Hospital.findById(req.params.id);
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  if (!canManageHospital(req.user, hospital)) return res.status(403).json({ error: "Not assigned to this hospital" });

  const review = applyReview({
    decision, before: hospital, userId: req.user.id, entityType: "Hospital",
    entityId: hospital._id, ipHash: hashIp(req.ip), requestId: req.id,
  });
  const before = hospital.toObject();
  Object.assign(hospital, review.updates);
  await hospital.save();
  try {
    await AuditLog.create(review.audit);
  } catch (error) {
    await Hospital.replaceOne({ _id: hospital._id }, before);
    throw error;
  }
  res.json({ hospital });
});

// GET /api/admin/audit — recent audit log (admin only).
export const listAudit = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const data = await AuditLog.find().populate("user", "name role").sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ data });
});

// Field-level facility evidence. Source disagreement is preserved for review.
export const listFacilityClaims = asyncHandler(async (req, res) => {
  const status = req.query.status || "all";
  if (!["unverified", "verified", "rejected", "all"].includes(status)) {
    return res.status(400).json({ error: "Invalid claim status" });
  }
  const filter = status === "all" ? {} : { verificationStatus: status };
  const data = await FacilitySourceClaim.find(filter)
    .populate("hospital", "name slug")
    .populate("source", "name sourceKey type")
    .sort({ updatedAt: -1 }).limit(100).lean();
  res.json({ data });
});

// Conflict center: both source observations and the decision history are
// returned together. This is system-admin only because evidence can include
// untrusted source text and reviewer identity.
export const listDataConflicts = asyncHandler(async (req, res) => {
  const status = req.query.status || "open";
  if (!["open", "resolved", "all"].includes(status)) return res.status(400).json({ error: "Invalid conflict status" });
  const data = await DataConflict.find(status === "all" ? {} : { status })
    .populate("hospital", "name slug")
    .populate({ path: "claims", populate: { path: "source", select: "name sourceKey type" } })
    .sort({ updatedAt: -1 }).limit(100).lean();
  res.json({ data });
});

export const reviewFacilityClaim = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid claim id" });
  const { decision, note } = req.body;
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Invalid decision" });
  const claim = await FacilitySourceClaim.findById(req.params.id);
  if (!claim) return res.status(404).json({ error: "Claim not found" });
  const before = claim.toObject();
  claim.verificationStatus = decision === "approve" ? "verified" : "rejected";
  claim.reviewedBy = req.user.id;
  claim.reviewedAt = new Date();
  claim.reviewNote = typeof note === "string" ? note.slice(0, 500) : undefined;
  claim.reviewHistory.push({
    decision, fromStatus: before.verificationStatus,
    toStatus: claim.verificationStatus, actor: req.user.id,
    at: claim.reviewedAt, note: claim.reviewNote,
  });
  await claim.save();

  // Claim decisions are safety-relevant. Unlike general dashboard telemetry,
  // a successful review must have a durable before/after audit row.
  try {
    await AuditLog.create({
      user: req.user.id, action: decision === "approve" ? "verify" : "reject",
      entityType: "FacilitySourceClaim", entityId: claim._id,
      before, after: claim.toObject(), ipHash: hashIp(req.ip), requestId: req.id,
    });
  } catch (error) {
    // Standalone MongoDB does not support multi-document transactions. Restore
    // the prior claim rather than return success for an unaudited decision.
    await FacilitySourceClaim.replaceOne({ _id: claim._id }, before);
    throw error;
  }

  const claims = await FacilitySourceClaim.find({ hospital: claim.hospital, facility: claim.facility }).lean();
  const resolved = fuseFacilityClaims(claims);
  await syncFacilityConflict({ hospital: claim.hospital, facility: claim.facility, claims, resolution: resolved, actor: req.user.id });
  await HospitalFacility.findOneAndUpdate(
    { hospital: claim.hospital, facility: claim.facility },
    {
      capability: resolved.capability,
      capabilityConflict: resolved.conflict,
      source: resolved.selectedClaim?.source || null,
      confidence: resolved.selectedClaim?.confidence || "UNKNOWN",
    },
    { upsert: true, runValidators: true }
  );
  res.json({ claim, resolution: { capability: resolved.capability, conflict: resolved.conflict } });
});

export const listHospitalFieldClaims = asyncHandler(async (_req, res) => {
  const data = await HospitalFieldClaim.find()
    .populate("hospital", "name slug").populate("source", "name sourceKey type")
    .sort({ updatedAt: -1 }).limit(200).lean();
  res.json({ data });
});

export const listHospitalFieldConflicts = asyncHandler(async (_req, res) => {
  const data = await HospitalFieldConflict.find()
    .populate("hospital", "name slug")
    .populate({ path: "claims", populate: { path: "source", select: "name sourceKey type" } })
    .sort({ updatedAt: -1 }).limit(200).lean();
  res.json({ data });
});

export const reviewHospitalFieldClaim = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid claim id" });
  const { decision, note } = req.body;
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Invalid decision" });
  const claim = await HospitalFieldClaim.findById(req.params.id);
  if (!claim) return res.status(404).json({ error: "Claim not found" });
  const before = claim.toObject();
  claim.verificationStatus = decision === "approve" ? "verified" : "rejected";
  claim.reviewedBy = req.user.id;
  claim.reviewedAt = new Date();
  claim.reviewNote = typeof note === "string" ? note.slice(0, 500) : undefined;
  claim.reviewHistory.push({ decision, fromStatus: before.verificationStatus,
    toStatus: claim.verificationStatus, actor: req.user.id, at: claim.reviewedAt, note: claim.reviewNote });
  await claim.save();
  try {
    await AuditLog.create({ user: req.user.id, action: decision === "approve" ? "verify" : "reject",
      entityType: "HospitalFieldClaim", entityId: claim._id, before, after: claim.toObject(),
      ipHash: hashIp(req.ip), requestId: req.id });
  } catch (error) {
    await HospitalFieldClaim.replaceOne({ _id: claim._id }, before);
    throw error;
  }
  const resolution = await resolveStoredField(claim.hospital, claim.field, req.user.id);
  res.json({ claim, resolution });
});
