import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { BloodRequest } from "../models/BloodRequest.js";
import { AmbulanceBooking } from "../models/AmbulanceBooking.js";
import { DiagnosticRequest } from "../models/DiagnosticRequest.js";
import { AuditLog } from "../models/AuditLog.js";
import { Hospital } from "../models/Hospital.js";
import { emailRequestUpdate } from "./bedRequestEmails.js";
import { sendEmailEvent } from "./emailService.js";

export const STATUS_EFFECTS_CAPACITY = 32;
const models = { EmergencyRequest, BloodRequest, AmbulanceBooking, DiagnosticRequest };
const ATTEMPT_LIMIT = 5;
export function requestStatusEffect({ previousStatus, status, actor, timelineLength, now = new Date() }) {
  return { _id: new mongoose.Types.ObjectId(), auditId: new mongoose.Types.ObjectId(),
    previousStatus, status, actor: actor?.id, timelineLength, recordedAt: now,
    attempts: 0, exhausted: false, retryAt: now };
}

// Each entry has its own lease. A deterministic audit ID and stable email key
// make replay safe after a crash between recording an effect and removing it.
export async function drainRequestStatusEffects(sourceType, sourceId, { effectId, now = new Date() } = {}) {
  const Model = models[sourceType];
  if (!Model) throw new Error("Unknown request source");
  const pending = { exhausted: { $ne: true }, attempts: { $lt: ATTEMPT_LIMIT },
    ...(effectId ? { _id: effectId } : {}),
    $and: [{ $or: [{ retryAt: { $exists: false } }, { retryAt: { $lte: now } }] },
      { $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] }] };
  const leaseToken = randomUUID();
  const source = await Model.findOneAndUpdate({ _id: sourceId, statusEffects: { $elemMatch: pending } }, {
    $set: { "statusEffects.$.leaseToken": leaseToken, "statusEffects.$.leaseUntil": new Date(now.getTime() + 60000) },
    $inc: { "statusEffects.$.attempts": 1 },
  }, { new: true }).select("+statusEffects");
  if (!source) return { processed: false };
  const effect = source.statusEffects.find(entry => entry.leaseToken === leaseToken);
  const owned = { _id: sourceId, statusEffects: { $elemMatch: { _id: effect._id, leaseToken } } };
  try {
    await AuditLog.updateOne({ _id: effect.auditId }, { $setOnInsert: {
      createdAt: effect.recordedAt, user: effect.actor, action: effect.previousStatus === "NONE" ? "create" : "update", entityType: sourceType, entityId: source._id,
      before: { status: effect.previousStatus },
      after: { status: effect.status, ...(effect.timelineLength ? { timelineLength: effect.timelineLength } : {}) },
    } }, { upsert: true });
    let notification = "not_available";
    if (sourceType === "EmergencyRequest") {
      const hospital = await Hospital.findById(source.hospital).select("name").lean();
      const snapshot = source.toObject();
      snapshot.status = effect.status;
      snapshot.timeline = snapshot.timeline.slice(0, effect.timelineLength);
      await emailRequestUpdate(snapshot, hospital, { strict: true });
    } else {
      const email = sourceType === "BloodRequest" ? source.contactEmail : source.requestSnapshot?.contactEmail;
      if (email) {
        const delivery = await sendEmailEvent({ eventKey: `request-status:${sourceType}:${source._id}:${effect.status}`,
          to: email, template: "provider_request_updated", data: { reference: source.reference, status: effect.status } });
        notification = delivery?.status || "uncertain";
        if (!delivery?._id) throw new Error("STATUS_OUTBOX_UNAVAILABLE");
      }
    }
    await Model.updateOne(owned, { $pull: { statusEffects: { _id: effect._id } } });
    return { processed: true, notification };
  } catch (error) {
    await Model.updateOne(owned, { $set: { "statusEffects.$.retryAt": new Date(now.getTime() + Math.min(300000, 1000 * 2 ** effect.attempts)),
      "statusEffects.$.exhausted": effect.attempts >= ATTEMPT_LIMIT,
      "statusEffects.$.errorCode": "STATUS_EFFECTS_UNAVAILABLE" },
    $unset: { "statusEffects.$.leaseToken": 1, "statusEffects.$.leaseUntil": 1 } });
    return { processed: false, notification: "uncertain" };
  }
}

export async function recoverRequestStatusEffects({ limit = 25, now = new Date() } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid recovery limit");
  const result = { processed: 0, pending: 0, exhausted: 0 };
  for (const [sourceType, Model] of Object.entries(models)) {
    // Exhausted entries remain on the source for operator inspection. Historical
    // requests without the journal are never replayed.
    const rows = await Model.find({ statusEffects: { $elemMatch: { exhausted: { $ne: true },
      attempts: { $lt: ATTEMPT_LIMIT }, retryAt: { $lte: now },
      $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] } } })
      .sort({ "statusEffects.retryAt": 1, _id: 1 }).limit(limit).select("_id").lean();
    for (const row of rows) {
      const outcome = await drainRequestStatusEffects(sourceType, row._id, { now });
      result[outcome.processed ? "processed" : "pending"]++;
    }
    // A process can die during its final leased attempt. Keep that record
    // visible as exhausted instead of leaving an unclaimable pending entry.
    const expired = await Model.find({ statusEffects: { $elemMatch: {
      exhausted: false, attempts: { $gte: ATTEMPT_LIMIT }, leaseUntil: { $lte: now },
    } } }).sort({ "statusEffects.retryAt": 1, _id: 1 }).limit(limit).select("_id").lean();
    const exhausted = await Model.updateMany({ _id: { $in: expired.map(row => row._id) } },
      { $set: { "statusEffects.$[entry].exhausted": true, "statusEffects.$[entry].errorCode": "STATUS_EFFECTS_LEASE_EXPIRED" } },
      { arrayFilters: [{ "entry.exhausted": false, "entry.attempts": { $gte: ATTEMPT_LIMIT }, "entry.leaseUntil": { $lte: now } }] });
    result.exhausted += exhausted.modifiedCount;
  }
  return result;
}
