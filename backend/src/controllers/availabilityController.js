import mongoose from "mongoose";
import { Hospital } from "../models/Hospital.js";
import { AvailabilityObservation } from "../models/AvailabilityObservation.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { withHospitalData } from "../services/hospitalDataLoader.js";
import { canManageHospital } from "../services/hospitalAccess.js";
import { AuditLog } from "../models/AuditLog.js";
import { hashIp } from "../utils/audit.js";

// GET /api/hospitals/:id/facilities — current facility statuses for a hospital.
export const listFacilities = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Hospital not found" });
  const hospital = await Hospital.findOne({ _id: req.params.id, archivedAt: null, approvalStatus: { $nin: ["pending", "rejected"] } }).lean();
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  const [view] = await withHospitalData([hospital]);
  res.json({ data: view.facilities });
});

// GET /api/hospitals/:id/availability — safe current view + history count.
export const getAvailability = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Hospital not found" });
  const hospital = await Hospital.findOne({ _id: req.params.id, archivedAt: null, approvalStatus: { $nin: ["pending", "rejected"] } }).lean();
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  const [[view], observations] = await Promise.all([
    withHospitalData([hospital]),
    AvailabilityObservation.countDocuments({ hospital: hospital._id }),
  ]);
  res.json({ latest: view.facilities, observations });
});

// POST /api/hospitals/:id/availability — record a NEW observation (append-only).
export const recordObservation = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findById(req.params.id);
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  if (!canManageHospital(req.user, hospital)) return res.status(403).json({ error: "Not assigned to this hospital" });
  const { facility, status, quantity } = req.body;
  const observedAt = req.body.observedAt ? new Date(req.body.observedAt) : new Date();
  if (observedAt.getTime() > Date.now() + 60000 || observedAt.getTime() < Date.now() - 30 * 60000) {
    return res.status(400).json({ error: "Current availability must be observed within the last 30 minutes" });
  }
  if (!["available", "limited"].includes(status) && quantity !== undefined) {
    return res.status(400).json({ error: "Quantity is only valid for available or limited status" });
  }
  const obs = await AvailabilityObservation.create({
    hospital: hospital._id, facility, status,
    quantity: ["available", "limited"].includes(status) ? quantity ?? null : null,
    observedAt, retrievedAt: new Date(),
    verificationStatus: "verified", verifiedBy: req.user.id,
  });
  try {
    await AuditLog.create({ user: req.user.id, action: "create", entityType: "AvailabilityObservation",
      entityId: obs._id, after: obs.toObject(), ipHash: hashIp(req.ip), requestId: req.id });
  } catch (error) {
    await AvailabilityObservation.deleteOne({ _id: obs._id });
    throw error;
  }
  res.status(201).json({ observation: obs });
});
