import { organizationIsAvailable } from "./providerLifecycle.js";
import { routeRequestSafely, assignedProviderUsers } from "./requestNotifications.js";
import { randomBytes } from "node:crypto";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { Hospital } from "../models/Hospital.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { canManageHospital } from "./hospitalAccess.js";
import { sendUserEmailSafely } from "./userEmailService.js";
import { runEmailBatch } from "./emailBatch.js";
import { generateTrackingToken, hashTrackingToken, trackingTokenForIdempotency, verifyTrackingToken } from "../utils/trackingToken.js";

import { sendEmailEvent } from "./emailService.js";
import { requestStatusEffect, drainRequestStatusEffects, STATUS_EFFECTS_CAPACITY } from "./requestStatusEffects.js";
import { IDEMPOTENCY_REPLAY_ERROR } from "../middleware/idempotency.js";
import { createRequestWithInventory, updateRequestWithInventory, bedResourceKey } from "./capacityRequestFlows.js";

const transitions = {
  REQUESTED: ["SENT", "UNDER_REVIEW", "REJECTED", "CANCELLED", "EXPIRED"],
  SENT: ["UNDER_REVIEW", "REJECTED", "CANCELLED", "EXPIRED"],
  UNDER_REVIEW: ["INFORMATION_REQUESTED", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"],
  INFORMATION_REQUESTED: ["UNDER_REVIEW", "REJECTED", "CANCELLED", "EXPIRED"],
  ACCEPTED: ["COMPLETED", "CANCELLED"],
  REJECTED: [], EXPIRED: [], CANCELLED: [], COMPLETED: [],
};

export async function createEmergencyRequest(data, actor) {
  async function replay() {
    if (!data.idempotencyKeyHash) return null;
    const previous = await EmergencyRequest.findOne({ idempotencyKeyHash: data.idempotencyKeyHash })
      .select("+trackingTokenHash");
    if (!previous) return null;
    if (previous.user && String(previous.user) === String(actor?.id)) {
      return { request: previous, status: 200 };
    }
    const token = trackingTokenForIdempotency(data.idempotencyKeyHash);
    if (!previous.user && verifyTrackingToken(token, previous.trackingTokenHash)) {
      return { request: previous, trackingToken: token, status: 200 };
    }
    return { error: IDEMPOTENCY_REPLAY_ERROR, status: 409 };
  }
  const previous = await replay();
  if (previous) return previous;
  const hospital = await Hospital.findById(data.hospitalId);
  if (!hospital || !await organizationIsAvailable("hospital", hospital._id) || ["pending", "rejected"].includes(hospital.approvalStatus)) return { error: "Hospital not found", status: 404 };
  const userId = actor?.id || null;
  const isEmergency = data.isEmergency !== false;
  const trackingToken = userId ? undefined : (trackingTokenForIdempotency(data.idempotencyKeyHash) || generateTrackingToken());
  let request;
  try {
    request = await createRequestWithInventory(EmergencyRequest, {
    coordinationVersion: 1,
    notificationVersion: 1,
    requestId: `MR-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`,
    user: userId,
    trackingTokenHash: trackingToken ? hashTrackingToken(trackingToken) : undefined,
    idempotencyKeyHash: data.idempotencyKeyHash,
    hospital: hospital._id,
    emergencyType: data.emergencyType,
    requiredFacility: data.requiredFacility,
    patientAgeGroup: data.patientAgeGroup || "unknown",
    patientReference: data.patientReference,
    patientSummary: data.patientSummary,
    contactPhone: data.contactPhone,
    contactEmail: data.contactEmail || actor?.email || undefined,
    isEmergency,
    ambulanceRequired: Boolean(data.ambulanceRequired),
    ambulancePickupAddress: data.ambulanceRequired ? (data.ambulancePickupAddress?.trim() || "") : undefined,
    locality: data.locality,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    timeline: [{ status: "REQUESTED", actor: userId, actorRole: "patient", note: userId ? undefined : "Guest emergency request" }],
    }, isEmergency ? null : { kind: "hospital", organizationId: hospital._id, resourceKey: bedResourceKey(data.requiredFacility), quantity: 1, actorId: actor?.id });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await replay();
      if (existing) return existing;
    }
    throw error;
  }
  let connectedStaff = [];
  let hasHospitalStaff = false;
  try {
    connectedStaff = await assignedProviderUsers("hospital", hospital._id);
    hasHospitalStaff = connectedStaff.length > 0;
    if (hasHospitalStaff) {
      request.status = "SENT";
      request.timeline.push({ status: "SENT", at: new Date(), actorRole: "system" });
      await request.save();
    }
  } catch (error) {
    console.warn("Emergency request recorded but staff routing status could not be updated:", error.message);
    connectedStaff = [];
    hasHospitalStaff = false;
    request.status = "REQUESTED";
    request.timeline = request.timeline.slice(0, 1);
  }
  try {
    await AuditLog.create({ user: userId || undefined, action: "create", entityType: "EmergencyRequest",
      entityId: request._id, after: { status: request.status, hospital: hospital._id, requestId: request.requestId,
        hospitalStaffConnected: hasHospitalStaff, guest: !userId } });
  } catch (error) {
    console.warn("Emergency request recorded but audit logging failed:", error.message);
  }

  const userRecipient = (data.contactEmail?.trim() || actor?.email || "").toLowerCase();
  const emails = [];

  // 1. User confirmation email - strictly to provided email or authenticated user email
  if (userRecipient) {
    emails.push(async () => {
      try {
        await sendEmailEvent({
          eventKey: `mail:emergency:${request._id}:user_confirm`,
          to: userRecipient,
          template: "emergency_submitted",
          data: { reference: request.requestId, hospital: hospital.name, connected: hasHospitalStaff, isEmergency },
        });
      } catch (err) {
        console.warn("Failed to dispatch emergency request user confirmation email:", err.message);
      }
    });
  }

  await routeRequestSafely(request, "EmergencyRequest", emails);
  return { request, trackingToken };
}

export async function changeEmergencyRequest({ requestId, actor, trackingToken, nextStatus, expectedStatus, expectedTimelineLength, note = "", hospitalResponse = "" }) {
  const request = await EmergencyRequest.findById(requestId).select("+trackingTokenHash");
  if (!request) return { error: "Request not found", status: 404 };
  const hospital = await Hospital.findById(request.hospital);
  const isStaff = actor ? canManageHospital(actor, hospital) : false;
  const isOwner = Boolean(request.user && actor && String(request.user) === String(actor.id))
    || Boolean(!request.user && verifyTrackingToken(trackingToken, request.trackingTokenHash));
  if (!isOwner && !isStaff) return { error: "Access denied", status: 403 };
  if (isStaff && nextStatus === "INFORMATION_REQUESTED" && !hospitalResponse.trim() && !note.trim()) {
    return { error: "Explain what information the patient should provide", status: 400 };
  }
  const patientReply = isOwner && !isStaff && nextStatus === "UNDER_REVIEW";
  if (!isStaff && nextStatus !== "CANCELLED" && !patientReply) return { error: "Only hospital staff can respond", status: 403 };
  if (!isStaff && hospitalResponse) return { error: "Only hospital staff can send a hospital response", status: 403 };
  if (patientReply && !note.trim()) return { error: "Please provide the requested information", status: 400 };

  // A lost response can be retried without duplicating the timeline, audit or
  // notifications. Authorization is checked before looking for this replay.
  const latest = request.timeline.at(-1);
  const actorRole = isStaff ? "hospital_staff" : "patient";
  if (request.status === nextStatus && latest?.actorRole === actorRole
    && String(latest.actor || "") === String(actor?.id || "")
    && (latest.note || "") === note && (latest.hospitalResponse || "") === hospitalResponse) {
    return { request };
  }
  if ((expectedStatus && request.status !== expectedStatus)
    || (expectedTimelineLength !== undefined && request.timeline.length !== expectedTimelineLength)) {
    return { error: "Request changed. Refresh its status before trying again.", status: 409 };
  }
  if (patientReply && request.status !== "INFORMATION_REQUESTED") return { error: "The hospital has not requested more information", status: 409 };
  const active = ["REQUESTED", "SENT", "UNDER_REVIEW", "INFORMATION_REQUESTED"];
  const previousStatus = request.status;
  const now = new Date();
  const expired = active.includes(previousStatus) && request.expiresAt <= now;
  if (!expired && !transitions[previousStatus]?.includes(nextStatus)) return { error: "Invalid status transition", status: 409 };
  const status = expired ? "EXPIRED" : nextStatus;
  const step = expired ? { status, at: now, actorRole: "system" }
    : { status, at: now, actor: actor?.id, actorRole, note, hospitalResponse: isStaff ? hospitalResponse : undefined };
  const effect = requestStatusEffect({ previousStatus, status, actor, timelineLength: request.timeline.length + 1, now });
  const set = { status };
  if (!expired && isStaff) {
    set.respondedAt = now;
    if (hospitalResponse) set.hospitalResponse = hospitalResponse;
  }
  // Compare both state and history length: concurrent staff/patient actions
  // cannot overwrite each other's response or revive an expired request.
  const updated = await updateRequestWithInventory({ Model: EmergencyRequest, row: request, status, actorId: actor?.id, filter: { _id: request._id, status: previousStatus,
    [`timeline.${request.timeline.length}`]: { $exists: false },
    [`statusEffects.${STATUS_EFFECTS_CAPACITY - 1}`]: { $exists: false },
    ...(!expired && active.includes(previousStatus) ? { expiresAt: { $gt: now } } : {}) },
    update: { $set: set, $push: { timeline: step, statusEffects: effect } } });
  if (!updated) return { error: "Request changed. Refresh its status before trying again.", status: 409 };
  try { await drainRequestStatusEffects("EmergencyRequest", updated._id, { effectId: effect._id }); }
  catch { console.warn("[medreach] Request saved; durable status effects await recovery."); }
  return expired ? { error: "Request expired", status: 409 } : { request: updated };
}

export async function listVisibleEmergencyRequests(actor) {
  if (["system_admin"].includes(actor.role)) return EmergencyRequest.find().select("-patientSummary").populate("hospital", "name slug").sort({ createdAt: -1 }).limit(100).lean();
  if (["provider_admin", "hospital_admin"].includes(actor.role)) {
    const ids = actor.role === "hospital_admin" ? await Hospital.find({ admins: actor.id }).distinct("_id") : actor.hospitalIds || [];
    return EmergencyRequest.find({ hospital: { $in: ids } }).populate("hospital", "name slug").sort({ createdAt: -1 }).limit(100).lean();
  }
  return EmergencyRequest.find({ user: actor.id }).populate("hospital", "name slug").sort({ createdAt: -1 }).limit(100).lean();
}
