import { asyncHandler } from "../utils/asyncHandler.js";
import { BloodRequest } from "../models/BloodRequest.js";
import { AmbulanceBooking } from "../models/AmbulanceBooking.js";
import { canManageResource } from "./providerAccess.js";
import { requestStatusEffect, drainRequestStatusEffects, STATUS_EFFECTS_CAPACITY } from "./requestStatusEffects.js";

export const BLOOD_TRANSITIONS = { REQUESTED: ["CONFIRMED", "REJECTED", "CANCELLED"], CONFIRMED: ["COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [], REJECTED: [] };
export const AMBULANCE_TRANSITIONS = { RECORDED: ["UNDER_REVIEW", "CONFIRMED", "REJECTED", "CANCELLED"], UNDER_REVIEW: ["CONFIRMED", "REJECTED", "CANCELLED"], CONFIRMED: ["DISPATCHED", "CANCELLED"], DISPATCHED: ["COMPLETED"], CANCELLED: [], COMPLETED: [], REJECTED: [] };
export const updateProviderRequestStatus = (kind) => asyncHandler(async (req, res) => {
  const Model = kind === "blood" ? BloodRequest : AmbulanceBooking;
  const row = await Model.findById(req.params.id);
  if (!row) return res.status(404).json({ error: "Request not found" });
  if (!canManageResource(req.user, { _id: row.provider })) return res.status(403).json({ error: "Assigned provider access required" });
  const transitions = kind === "blood" ? BLOOD_TRANSITIONS : AMBULANCE_TRANSITIONS;
  const status = req.body.status;
  if (status === row.status) return res.json({ ok: true, data: row, message: "Status already recorded." });
  if (!transitions[row.status]?.includes(status)) return res.status(409).json({ error: "This status transition is unavailable. Refresh the request before retrying." });
  const effect = requestStatusEffect({ previousStatus: row.status, status, actor: req.user });
  const updated = await Model.findOneAndUpdate({ _id: row._id, status: row.status,
    [`statusEffects.${STATUS_EFFECTS_CAPACITY - 1}`]: { $exists: false } },
    { $set: { status }, $push: { statusEffects: effect } }, { new: true, runValidators: true });
  if (!updated) return res.status(409).json({ error: "Another administrator updated this request. Refresh before retrying." });
  let notification = "uncertain";
  try { notification = (await drainRequestStatusEffects(Model.modelName, row._id, { effectId: effect._id })).notification || "uncertain"; }
  catch { console.warn("[medreach] Request status saved; durable effects await recovery."); }
  res.json({ ok: true, data: updated, notification, message: "Request status saved. Contact the provider to confirm care or transport arrangements." });
});
