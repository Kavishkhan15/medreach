import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { Hospital } from "../models/Hospital.js";
import { AuditLog } from "../models/AuditLog.js";
import { sendUserEmail } from "./userEmailService.js";
import { sendEmailEvent } from "./emailService.js";

const active = ["REQUESTED", "SENT", "UNDER_REVIEW", "INFORMATION_REQUESTED"];
const maxEffectAttempts = 6;
let timer = null;
let running = null;

async function recordExpiryEffects(request) {
  const effects = request.expiryEffects;
  // The audit identity and email key were fixed atomically with EXPIRED.
  // Replaying after a crash cannot append another timeline or audit entry.
  await AuditLog.updateOne({ _id: effects.auditId }, { $setOnInsert: {
    action: "update", entityType: "EmergencyRequest", entityId: request._id,
    before: { status: effects.previousStatus }, after: { status: "EXPIRED", timelineLength: effects.timelineLength },
    createdAt: effects.recordedAt,
  } }, { upsert: true, runValidators: true });
  const eventKey = `emergency:${request._id}:${effects.timelineLength}`;
  const hospital = await Hospital.findById(request.hospital).select("name").lean();
  const event = { eventKey, emailTemplate: "emergency_updated", emailData: {
    reference: request.requestId, hospital: hospital?.name || "the hospital", status: "EXPIRED", isEmergency: request.isEmergency,
  } };
  let delivery;
  if (request.user) delivery = await sendUserEmail({ ...event, recipient: request.user });
  else if (request.contactEmail) delivery = await sendEmailEvent({ eventKey: `mail:${eventKey}`, to: request.contactEmail, template: event.emailTemplate, data: event.emailData });
  if (delivery && !delivery._id) throw Object.assign(new Error("Expiry notification intent could not be confirmed"), { code: "EXPIRY_EMAIL_INTENT_UNCONFIRMED" });
}

export async function reconcileEmergencyExpiryEffects({ limit = 100, now = new Date(), assertLease = async () => {} } = {}) {
  const batchLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 100));
  await assertLease();
  await EmergencyRequest.updateMany({ status: "EXPIRED", "expiryEffects.status": "pending", "expiryEffects.attempts": { $gte: maxEffectAttempts },
    $or: [{ "expiryEffects.leaseUntil": { $exists: false } }, { "expiryEffects.leaseUntil": { $lte: now } }] },
  { $set: { "expiryEffects.status": "exhausted", "expiryEffects.errorCode": "EXPIRY_EFFECTS_RETRY_EXHAUSTED" },
    $unset: { "expiryEffects.leaseToken": 1, "expiryEffects.leaseUntil": 1 } });
  const due = await EmergencyRequest.find({ status: "EXPIRED", "expiryEffects.status": "pending", "expiryEffects.attempts": { $lt: maxEffectAttempts },
    $and: [
      { $or: [{ "expiryEffects.retryAt": { $exists: false } }, { "expiryEffects.retryAt": { $lte: now } }] },
      { $or: [{ "expiryEffects.leaseUntil": { $exists: false } }, { "expiryEffects.leaseUntil": { $lte: now } }] },
    ] }).select("_id").sort({ "expiryEffects.recordedAt": 1, _id: 1 }).limit(batchLimit).lean();
  let completed = 0, failed = 0;
  for (const row of due) {
    await assertLease();
    const leaseToken = randomUUID();
    const claimed = await EmergencyRequest.findOneAndUpdate({ _id: row._id, status: "EXPIRED", "expiryEffects.status": "pending",
      "expiryEffects.attempts": { $lt: maxEffectAttempts }, $and: [
        { $or: [{ "expiryEffects.retryAt": { $exists: false } }, { "expiryEffects.retryAt": { $lte: now } }] },
        { $or: [{ "expiryEffects.leaseUntil": { $exists: false } }, { "expiryEffects.leaseUntil": { $lte: now } }] },
      ] }, { $set: { "expiryEffects.leaseToken": leaseToken, "expiryEffects.leaseUntil": new Date(now.getTime() + 120000), "expiryEffects.lastAttemptAt": now },
      $inc: { "expiryEffects.attempts": 1 } }, { new: true }).select("+expiryEffects");
    if (!claimed) continue;
    const ownership = { _id: claimed._id, "expiryEffects.status": "pending", "expiryEffects.leaseToken": leaseToken };
    try {
      await assertLease(); await recordExpiryEffects(claimed);
      const result = await EmergencyRequest.updateOne(ownership, { $set: { "expiryEffects.status": "complete", "expiryEffects.completedAt": now },
        $unset: { "expiryEffects.leaseToken": 1, "expiryEffects.leaseUntil": 1, "expiryEffects.errorCode": 1, "expiryEffects.retryAt": 1 } });
      completed += result.modifiedCount;
    } catch (error) {
      failed++;
      const exhausted = claimed.expiryEffects.attempts >= maxEffectAttempts;
      await EmergencyRequest.updateOne(ownership, { $set: { "expiryEffects.status": exhausted ? "exhausted" : "pending",
        "expiryEffects.errorCode": /^[A-Z0-9_]{1,80}$/.test(error?.code || "") ? error.code : "EXPIRY_EFFECTS_FAILED",
        "expiryEffects.retryAt": new Date(now.getTime() + Math.min(300000, 1000 * 2 ** (claimed.expiryEffects.attempts - 1))) },
        $unset: { "expiryEffects.leaseToken": 1, "expiryEffects.leaseUntil": 1 } });
    }
  }
  return { completed, failed };
}

export async function expireEmergencyRequests(now = new Date(), { assertLease = async () => {}, beforeEffects } = {}) {
  const due = await EmergencyRequest.find({ status: { $in: active }, expiresAt: { $lte: now } }).select("_id status timeline").limit(100).lean();
  let expired = 0;
  for (const row of due) {
    await assertLease();
    const request = await EmergencyRequest.findOneAndUpdate({ _id: row._id, status: row.status, expiresAt: { $lte: now },
      $expr: { $eq: [{ $size: { $ifNull: ["$timeline", []] } }, row.timeline?.length || 0] } },
    { $set: { status: "EXPIRED", expiryEffects: { status: "pending", auditId: new mongoose.Types.ObjectId(), previousStatus: row.status,
      timelineLength: (row.timeline?.length || 0) + 1, recordedAt: now, attempts: 0 } },
      $push: { timeline: { status: "EXPIRED", at: now, actorRole: "system" } } }, { new: true });
    if (request) expired++;
  }
  // The transition survives even if the process crashes before these effects.
  if (beforeEffects) await beforeEffects();
  await reconcileEmergencyExpiryEffects({ now, assertLease });
  return { expired };
}

// Compatibility exports for existing development/tests. Production starts the
// dedicated expiry entrypoint, whose scheduling and retry state live in MongoDB.
export function startEmergencyRequestExpiryWorker() {
  if (timer) return timer;
  timer = setInterval(() => {
    if (running) return;
    running = expireEmergencyRequests().catch(() => console.error("[medreach] Request expiry check failed."))
      .finally(() => { running = null; });
  }, 60000);
  timer.unref?.();
  return timer;
}
export function stopEmergencyRequestExpiryWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  return running || Promise.resolve();
}
