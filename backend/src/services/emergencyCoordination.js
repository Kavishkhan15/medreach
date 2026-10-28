import { filterEmergencyCoverage } from "./emergencyCoverage.js";
import { organizationIsAvailable } from "./providerLifecycle.js";
import mongoose from "mongoose";
import { createHash, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { EmergencyCoordination } from "../models/EmergencyCoordination.js";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { BloodRequest } from "../models/BloodRequest.js";
import { AmbulanceBooking } from "../models/AmbulanceBooking.js";
import { User } from "../models/User.js";
import { ProviderMembership } from "../models/ProviderMembership.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { AuditLog } from "../models/AuditLog.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
import { notificationRecipients, requestRouting } from "./requestNotifications.js";
import { sendEmailEvent } from "./emailService.js";

const sources = {
  bed: { Model: EmergencyRequest, type: "EmergencyRequest", query: { isEmergency: true, status: { $in: ["REQUESTED", "SENT", "UNDER_REVIEW", "INFORMATION_REQUESTED"] } } },
  blood: { Model: BloodRequest, type: "BloodRequest", query: { type: "REQUEST", isUrgent: true, status: "REQUESTED" } },
  ambulance: { Model: AmbulanceBooking, type: "AmbulanceBooking", query: { isEmergency: true, status: { $in: ["RECORDED", "UNDER_REVIEW"] } } },
};
const waiting = ["awaiting_acknowledgement", "escalated"];
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const timeout = () => Number.isSafeInteger(env.emergencyAckTimeoutMs) && env.emergencyAckTimeoutMs >= 60000 ? env.emergencyAckTimeoutMs : 300000;
const eventKey = (id, kind, step) => `emergency-coordination:${id}:${kind}:${step}`;
const journalEvent = (id, kind, step, now, recipients = [], actor) => ({ key: eventKey(id, kind, step), kind, step, at: now, recipients, actor, auditRecorded: false, deliveryRecorded: kind !== "escalated", attempts: 0 });
const idFor = key => new mongoose.Types.ObjectId(createHash("sha256").update(key).digest("hex").slice(0, 24));

function validateSource(sourceType, sourceId) {
  if (!Object.hasOwn(sources, sourceType) || !mongoose.isValidObjectId(sourceId)) throw fail(400, "INVALID_EMERGENCY_SOURCE", "Invalid emergency request reference");
  return sources[sourceType];
}
async function sourceRecord(sourceType, sourceId) {
  const source = validateSource(sourceType, sourceId);
  return source.Model.findById(sourceId).lean();
}
function isOpen(record, sourceType, now) {
  if (!record || record.coordinationVersion !== 1) return false;
  const routing = requestRouting(record, sources[sourceType].type);
  if (!routing.isEmergency) return false;
  if (sourceType === "bed") return sources.bed.query.status.$in.includes(record.status) && record.expiresAt > now;
  if (sourceType === "blood") return record.type === "REQUEST" && record.status === "REQUESTED";
  return sources.ambulance.query.status.$in.includes(record.status);
}
async function providerOrganizationExists(kind, organization) {
  if (!organization || !await organizationIsAvailable(kind, organization)) return false;
  const query = { _id: organization, approvalStatus: { $nin: ["pending", "rejected"] } };
  return Boolean(await (kind === "hospital" ? Hospital : ResourceProvider).exists(kind === "hospital" ? query : { ...query, kind, active: true }));
}
async function currentActor(actor, routing) {
  if (!actor?.id || !mongoose.isValidObjectId(actor.id)) throw fail(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  const user = await User.findOne({ _id: actor.id, accountStatus: "active" }).select("role").lean();
  if (user?.role === "system_admin") return user;
  if (user?.role !== "provider_admin" || !await providerOrganizationExists(routing.kind, routing.organizationId)
    || !await ProviderMembership.exists({ user: user._id, organization: routing.organizationId, kind: routing.kind, active: true, $or: [{ accessLevel: "admin" }, { accessLevel: { $exists: false } }] })) {
    throw fail(403, "EMERGENCY_SCOPE_DENIED", "You do not have access to this organisation's emergency coordination");
  }
  return user;
}
async function ensureCoordination(record, sourceType, now) {
  if (!isOpen(record, sourceType, now)) return null;
  const routing = requestRouting(record, sources[sourceType].type);
  const id = new mongoose.Types.ObjectId();
  let row;
  try {
    row = await EmergencyCoordination.findOneAndUpdate({ sourceType, source: record._id }, { $setOnInsert: {
      _id: id, kind: routing.kind, organization: routing.organizationId, reference: routing.reference,
      status: "awaiting_acknowledgement", version: 1, escalationCount: 0,
      nextEscalationAt: new Date(record.createdAt.getTime() + timeout()),
      events: [journalEvent(id, "created", 0, now)],
    } }, { upsert: true, new: true }).lean();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    row = await EmergencyCoordination.findOne({ sourceType, source: record._id }).lean();
    if (!row) throw error;
  }
  // The source marker is written only after a durable unique coordination row exists.
  await sources[sourceType].Model.updateOne({ _id: record._id, coordinationVersion: 1 }, { $set: { coordinationRecordedAt: now } });
  return row;
}
export async function readEmergencyCoordination({ sourceType, sourceId, actor }) {
  const record = await sourceRecord(sourceType, sourceId);
  if (!record) throw fail(404, "EMERGENCY_NOT_FOUND", "Emergency request not found");
  const routing = requestRouting(record, sources[sourceType].type);
  await currentActor(actor, routing);
  const row = await EmergencyCoordination.findOne({ sourceType, source: record._id });
  if (!row) throw fail(404, "COORDINATION_NOT_RECORDED", "Emergency acknowledgement tracking has not been recorded");
  return row;
}
export async function acknowledgeEmergency({ sourceType, sourceId, actor, expectedVersion }) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw fail(400, "INVALID_VERSION", "A non-negative expectedVersion is required");
  const record = await sourceRecord(sourceType, sourceId);
  if (!record) throw fail(404, "EMERGENCY_NOT_FOUND", "Emergency request not found");
  const routing = requestRouting(record, sources[sourceType].type);
  const user = await currentActor(actor, routing);
  const now = new Date();
  if (!isOpen(record, sourceType, now)) throw fail(409, "EMERGENCY_NOT_AWAITING_RESPONSE", "The emergency request no longer awaits a response");
  const current = await EmergencyCoordination.findOne({ sourceType, source: record._id }).lean();
  if (!current) throw fail(404, "COORDINATION_NOT_RECORDED", "Emergency acknowledgement tracking has not been recorded");
  const row = await EmergencyCoordination.findOneAndUpdate({ _id: current._id, version: expectedVersion,
    status: { $in: [...waiting, "exhausted"] } }, {
    $set: { status: "acknowledged", acknowledgedAt: now, acknowledgedBy: user._id, manualAttention: false },
    $unset: { nextEscalationAt: 1, attentionReason: 1 }, $inc: { version: 1 },
    $push: { events: journalEvent(current._id, "acknowledged", expectedVersion + 1, now, [], user._id) },
  }, { new: true });
  if (!row) throw fail(409, "EMERGENCY_VERSION_CONFLICT", "Emergency coordination changed. Refresh before acknowledging again");
  // Acknowledgement does not accept a request, reserve a bed, or establish that care was delivered.
  // Audit intent is already committed with this state change and recovers independently.
  try { await materializeJournal(row._id); } catch { /* durable journal is recovered by the worker */ }
  return row;
}
export async function isCoordinationDeliveryEligible(id, to, recipientUser) {
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(recipientUser) || typeof to !== "string") return false;
  if (!(await filterEmergencyCoverage([{user:recipientUser}])).length) return false;
  const row = await EmergencyCoordination.findById(id).lean();
  if (!row || ![...waiting, "exhausted"].includes(row.status)) return false;
  const record = await sourceRecord(row.sourceType, row.source);
  if (!isOpen(record, row.sourceType, new Date())) return false;
  const routing = requestRouting(record, sources[row.sourceType].type);
  // Never trust persisted organisation/channel fields after a source assignment changes.
  if (routing.kind !== row.kind || String(routing.organizationId || "") !== String(row.organization || "")) return false;
  const user = await User.findOne({ _id: recipientUser, accountStatus: "active", notificationsEnabled: true,
    notificationEmailVerifiedAt: { $type: "date" }, notificationEmail: to.toLowerCase().trim() }).select("role").lean();
  if (user?.role === "system_admin") return true;
  return Boolean(user?.role === "provider_admin" && await providerOrganizationExists(routing.kind, routing.organizationId)
    && await ProviderMembership.exists({ user: user._id, organization: routing.organizationId, kind: routing.kind, active: true, $or: [{ accessLevel: "admin" }, { accessLevel: { $exists: false } }] }));
}
async function eligibleRecipients(record, sourceType) {
  const routing = requestRouting(record, sources[sourceType].type);
  const candidates = await notificationRecipients(routing.kind, routing.organizationId, true);
  const result = [];
  for (const { user, channel } of candidates) {
    if (user.role !== "system_admin" && user.role !== "provider_admin") continue;
    if (user.role === "provider_admin" && !await providerOrganizationExists(routing.kind, routing.organizationId)) continue;
    result.push({ user: user._id, email: user.notificationEmail, channel: channel === "system" ? "admin" : "provider" });
  }
  return filterEmergencyCoverage(result);
}
async function materializeJournal(id, now = new Date()) {
  const row = await EmergencyCoordination.findById(id).select("+events").lean();
  if (!row) return;
  for (const candidate of row.events) {
    if (candidate.auditRecorded && candidate.deliveryRecorded) continue;
    if (candidate.exhaustedAt) continue;
    if (candidate.attempts >= 5 && (!candidate.leaseUntil || candidate.leaseUntil <= now)) {
      await EmergencyCoordination.updateOne({ _id: row._id, events: { $elemMatch: { key: candidate.key, attempts: { $gte: 5 },
        $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] } } }, {
        $set: { "events.$.exhaustedAt": now, "events.$.errorCode": "COORDINATION_JOURNAL_EXHAUSTED",
          manualAttention: true, attentionReason: "delivery_preparation_failed" },
        $unset: { "events.$.leaseToken": 1, "events.$.leaseUntil": 1 },
      });
      continue;
    }
    const leaseToken = randomUUID();
    const claimed = await EmergencyCoordination.findOneAndUpdate({ _id: row._id, events: { $elemMatch: {
      key: candidate.key, exhaustedAt: { $exists: false }, $and: [
        { $or: [{ auditRecorded: false }, { deliveryRecorded: false }] },
        { $or: [{ attempts: { $exists: false } }, { attempts: { $lt: 5 } }] },
        { $or: [{ retryAt: { $exists: false } }, { retryAt: { $lte: now } }] },
        { $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
      ],
    } } }, { $set: { "events.$.leaseToken": leaseToken, "events.$.leaseUntil": new Date(now.getTime() + 60000) },
      $inc: { "events.$.attempts": 1 } }, { new: true }).select("+events").lean();
    if (!claimed) continue;
    const event = claimed.events.find(item => item.key === candidate.key);
    const owned = { _id: row._id, events: { $elemMatch: { key: event.key, leaseToken } } };
    try {
      if (!event.auditRecorded) {
        await AuditLog.updateOne({ _id: idFor(event.key) }, { $setOnInsert: {
          user: event.actor, action: "update", entityType: "EmergencyCoordination", entityId: row._id,
          after: { event: event.kind, sourceType: row.sourceType, step: event.step, at: event.at },
        } }, { upsert: true });
        await EmergencyCoordination.updateOne(owned, { $set: { "events.$.auditRecorded": true } });
      }
      if (!event.deliveryRecorded) {
        for (const recipient of event.recipients) {
          if (!await isCoordinationDeliveryEligible(row._id, recipient.email, recipient.user)) continue;
          const key = `${event.key}:${createHash("sha256").update(recipient.email).digest("hex")}`;
          const delivery = await sendEmailEvent({ eventKey: key, to: recipient.email,
            recipientUser: recipient.user, recipientContactPolicy: "notification",
            template: recipient.channel === "admin" ? "system_emergency" : "provider_request",
            data: { reference: row.reference, organization: "the assigned healthcare organisation" },
            source: { model: "EmergencyCoordination", id: row._id, channel: recipient.channel } });
          if (!delivery?._id && !await EmailDelivery.exists({ eventKey: key })) throw fail(503, "ESCALATION_OUTBOX_UNAVAILABLE", "Escalation notification could not be recorded");
        }
        await EmergencyCoordination.updateOne(owned, { $set: { "events.$.deliveryRecorded": true } });
      }
      await EmergencyCoordination.updateOne(owned, { $unset: { "events.$.leaseToken": 1, "events.$.leaseUntil": 1,
        "events.$.retryAt": 1, "events.$.errorCode": 1 } });
    } catch (error) {
      const exhausted = event.attempts >= 5;
      await EmergencyCoordination.updateOne(owned, { $set: {
        "events.$.errorCode": "COORDINATION_JOURNAL_UNAVAILABLE",
        ...(exhausted ? { "events.$.exhaustedAt": now, manualAttention: true, attentionReason: "delivery_preparation_failed" }
          : { "events.$.retryAt": new Date(now.getTime() + Math.min(300000, 1000 * 2 ** event.attempts)) }),
      }, $unset: { "events.$.leaseToken": 1, "events.$.leaseUntil": 1 } });
      throw error;
    }
  }
  if (row.events.some(event => event.exhaustedAt)) await EmergencyCoordination.updateOne({ _id: row._id },
    { $set: { manualAttention: true, attentionReason: "delivery_preparation_failed" } });
}
async function reconcileRow(row, now) {
  const record = await sourceRecord(row.sourceType, row.source);
  if (!isOpen(record, row.sourceType, now)) {
    await EmergencyCoordination.updateOne({ _id: row._id, version: row.version, status: { $in: [...waiting, "exhausted"] } }, {
      $set: { status: "resolved", resolvedAt: now, manualAttention: false }, $unset: { nextEscalationAt: 1, attentionReason: 1 },
      $inc: { version: 1 }, $push: { events: journalEvent(row._id, "resolved", row.version + 1, now) },
    });
  } else if (waiting.includes(row.status) && row.nextEscalationAt <= now) {
    const recipients = await eligibleRecipients(record, row.sourceType);
    const count = row.escalationCount + 1;
    const exhausted = count >= 3;
    const values = { status: exhausted ? "exhausted" : "escalated", escalationCount: count,
      manualAttention: exhausted || !recipients.length };
    if (exhausted || !recipients.length) values.attentionReason = exhausted ? "escalation_exhausted" : "no_eligible_recipients";
    const event = journalEvent(row._id, "escalated", count, now, recipients);
    await EmergencyCoordination.updateOne({ _id: row._id, version: row.version, status: { $in: waiting }, nextEscalationAt: { $lte: now } }, {
      $set: { ...values, ...(!exhausted ? { nextEscalationAt: new Date(now.getTime() + timeout()) } : {}) },
      ...(exhausted ? { $unset: { nextEscalationAt: 1 } } : recipients.length ? { $unset: { attentionReason: 1 } } : {}),
      $inc: { version: 1 }, $push: { events: event },
    });
  }
  await materializeJournal(row._id, now);
}
export async function reconcileEmergencyCoordination({ limit = 25, now = new Date() } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw fail(400, "INVALID_RECONCILIATION_OPTIONS", "Invalid emergency reconciliation options");
  const result = { recorded: 0, checked: 0, failed: 0 };
  for (const [sourceType, { Model, query }] of Object.entries(sources)) {
    const rows = await Model.find({ ...query, coordinationVersion: 1, coordinationRecordedAt: { $exists: false },
      ...(sourceType === "bed" ? { expiresAt: { $gt: now } } : {}) }).sort({ createdAt: 1, _id: 1 }).limit(limit).lean();
    for (const record of rows) {
      try { if (await ensureCoordination(record, sourceType, now)) result.recorded++; }
      catch { result.failed++; }
    }
  }
  const rows = await EmergencyCoordination.find({ $or: [
    { status: { $in: [...waiting, "exhausted"] } },
    { events: { $elemMatch: { auditRecorded: false, exhaustedAt: { $exists: false } } } },
    { events: { $elemMatch: { deliveryRecorded: false, exhaustedAt: { $exists: false } } } },
  ] }).sort({ recoveryCheckedAt: 1, _id: 1 }).limit(limit).lean();
  for (const row of rows) {
    // Moving the fairness cursor before processing prevents one broken source starving other rows.
    await EmergencyCoordination.updateOne({ _id: row._id }, { $set: { recoveryCheckedAt: now } });
    try { await reconcileRow(row, now); result.checked++; }
    catch { result.failed++; }
  }
  if (result.failed) throw Object.assign(new Error("Emergency coordination recovery incomplete"), { code: "EMERGENCY_COORDINATION_INCOMPLETE", result });
  return result;
}
