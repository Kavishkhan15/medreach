import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { AuditLog } from "../models/AuditLog.js";
import { notifyUser } from "./notificationService.js";

const active = ["REQUESTED", "SENT", "UNDER_REVIEW", "INFORMATION_REQUESTED"];
export async function expireEmergencyRequests(now = new Date()) {
  const due = await EmergencyRequest.find({ status: { $in: active }, expiresAt: { $lte: now } }).select("_id").limit(100).lean();
  let expired = 0;
  for (const row of due) {
    const request = await EmergencyRequest.findOneAndUpdate({ _id: row._id, status: { $in: active }, expiresAt: { $lte: now } },
      { $set: { status: "EXPIRED" }, $push: { timeline: { status: "EXPIRED", at: now } } }, { new: true });
    if (!request) continue;
    expired++;
    await AuditLog.create({ action: "update", entityType: "EmergencyRequest", entityId: request._id,
      after: { status: "EXPIRED", requestId: request.requestId } });
    await notifyUser({ recipient: request.user, eventKey: `emergency:${request._id}:expired`, type: "emergency_request",
      title: "Emergency request expired", message: `${request.requestId} expired without a confirmed hospital response. Call the hospital directly or 112 for immediate danger.`,
      relatedType: "EmergencyRequest", relatedId: request._id,
      emailTemplate: "emergency_updated", emailData: { reference: request.requestId, status: "EXPIRED" } });
  }
  return { expired };
}

export function startEmergencyRequestExpiryWorker() {
  const timer = setInterval(() => expireEmergencyRequests().catch((error) =>
    console.error("[medreach] Request expiry check failed:", error.message)), 60000);
  timer.unref?.();
  return timer;
}
