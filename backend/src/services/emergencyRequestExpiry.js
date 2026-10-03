import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { Hospital } from "../models/Hospital.js";
import { auditRequestUpdate, emailRequestUpdate } from "./bedRequestEmails.js";

const active = ["REQUESTED", "SENT", "UNDER_REVIEW", "INFORMATION_REQUESTED"];
export async function expireEmergencyRequests(now = new Date()) {
  const due = await EmergencyRequest.find({ status: { $in: active }, expiresAt: { $lte: now } }).select("_id status").limit(100).lean();
  let expired = 0;
  for (const row of due) {
    const request = await EmergencyRequest.findOneAndUpdate({ _id: row._id, status: { $in: active }, expiresAt: { $lte: now } },
      { $set: { status: "EXPIRED" }, $push: { timeline: { status: "EXPIRED", at: now, actorRole: "system" } } }, { new: true });
    if (!request) continue;
    expired++;
    await auditRequestUpdate(request, row.status);
    const hospital = await Hospital.findById(request.hospital);
    await emailRequestUpdate(request, hospital);
  }
  return { expired };
}

export function startEmergencyRequestExpiryWorker() {
  const timer = setInterval(() => expireEmergencyRequests().catch((error) =>
    console.error("[medreach] Request expiry check failed:", error.message)), 60000);
  timer.unref?.();
  return timer;
}
