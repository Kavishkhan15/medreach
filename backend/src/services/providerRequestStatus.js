import { asyncHandler } from "../utils/asyncHandler.js";
import { BloodRequest } from "../models/BloodRequest.js";
import { AmbulanceBooking } from "../models/AmbulanceBooking.js";
import { canManageResource } from "./providerAccess.js";
import { sendEmailEvent } from "./emailService.js";
import { writeAudit } from "../utils/audit.js";

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
  const updated = await Model.findOneAndUpdate({ _id: row._id, status: row.status }, { $set: { status } }, { new: true, runValidators: true });
  if (!updated) return res.status(409).json({ error: "Another administrator updated this request. Refresh before retrying." });
  try { await writeAudit({ user: req.user.id, action: "update", entityType: Model.modelName, entityId: row._id, before: { status: row.status }, after: { status } }); }
  catch { console.warn("[medreach] Request status saved; audit confirmation unavailable."); }
  const email = kind === "blood" ? row.contactEmail : row.requestSnapshot?.contactEmail;
  let notification = "not_available";
  if (email) {
    try { notification = (await sendEmailEvent({ eventKey: `request-status:${Model.modelName}:${row._id}:${status}`, to: email,
      template: "provider_request_updated", data: { reference: row.reference, status } }))?.status || "uncertain"; }
    catch { notification = "uncertain"; }
  }
  res.json({ ok: true, data: updated, notification, message: "Request status saved. Contact the provider to confirm care or transport arrangements." });
});
