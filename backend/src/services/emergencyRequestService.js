import { randomBytes } from "node:crypto";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { Hospital } from "../models/Hospital.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { canManageHospital } from "./hospitalAccess.js";
import { notifyUserSafely } from "./notificationService.js";
import { generateTrackingToken, hashTrackingToken, trackingTokenForIdempotency, verifyTrackingToken } from "../utils/trackingToken.js";

import { sendEmailEvent, SYSTEM_NOTIFICATION_EMAIL } from "./emailService.js";
import { auditRequestUpdate, notifyRequestUpdate } from "./bedRequestNotifications.js";
import { IDEMPOTENCY_REPLAY_ERROR } from "../middleware/idempotency.js";

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
  if (!hospital) return { error: "Hospital not found", status: 404 };
  const userId = actor?.id || null;
  const isEmergency = data.isEmergency !== false;
  const trackingToken = userId ? undefined : (trackingTokenForIdempotency(data.idempotencyKeyHash) || generateTrackingToken());
  let request;
  try {
    request = await EmergencyRequest.create({
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
    });
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
    connectedStaff = await User.find({ _id: { $in: hospital.admins || [] },
      accountStatus: "active", role: { $in: ["hospital_admin", "admin", "system_admin"] } }).select("_id").lean();
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

  // 1. User confirmation email - strictly to provided email or authenticated user email
  if (userRecipient) {
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
  }

  // 2. In-app notification for authenticated users
  if (userId) {
    await notifyUserSafely({
      recipient: userId,
      eventKey: `emergency:${request._id}:created`,
      type: "emergency_request",
      title: isEmergency ? "Emergency request submitted" : "Hospital bed request submitted",
      message: hasHospitalStaff
        ? `${request.requestId} is available to connected hospital staff. No bed is reserved.`
        : `${request.requestId} was recorded, but this hospital is not connected to MedReach staff. Call the hospital directly. No bed is reserved.`,
      relatedType: "EmergencyRequest",
      relatedId: request._id,
    });
  }

  // 3. MedReach admin notification to medreachforyou@gmail.com
  try {
    await sendEmailEvent({
      eventKey: `mail:emergency:${request._id}:admin_system`,
      to: SYSTEM_NOTIFICATION_EMAIL,
      template: "bed_request_admin_notification",
      data: {
        reference: request.requestId,
        hospital: hospital.name,
        isEmergency: request.isEmergency,
        emergencyType: request.emergencyType,
        requiredFacility: request.requiredFacility,
        contactPhone: request.contactPhone,
        contactEmail: userRecipient || "Not provided",
        ambulanceRequired: request.ambulanceRequired,
        ambulancePickupAddress: request.ambulancePickupAddress,
        patientAgeGroup: request.patientAgeGroup,
        patientReference: request.patientReference,
        patientSummary: request.patientSummary,
        locality: request.locality,
      },
    });
  } catch (err) {
    console.warn("Failed to dispatch emergency request admin notification email:", err.message);
  }

  for (const { _id: adminId } of connectedStaff) {
    await notifyUserSafely({ recipient: adminId, eventKey: `emergency:${request._id}:hospital:${adminId}`,
      type: "emergency_request", title: isEmergency ? "New emergency request" : "New hospital bed request", message: `${request.requestId} needs review.`,
      relatedType: "EmergencyRequest", relatedId: request._id,
      emailTemplate: "emergency_staff", emailData: { reference: request.requestId, hospital: hospital.name } });
  }
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
  const set = { status };
  if (!expired && isStaff) {
    set.respondedAt = now;
    if (hospitalResponse) set.hospitalResponse = hospitalResponse;
  }
  // Compare both state and history length: concurrent staff/patient actions
  // cannot overwrite each other's response or revive an expired request.
  const updated = await EmergencyRequest.findOneAndUpdate({ _id: request._id, status: previousStatus,
    [`timeline.${request.timeline.length}`]: { $exists: false },
    ...(!expired && active.includes(previousStatus) ? { expiresAt: { $gt: now } } : {}) },
    { $set: set, $push: { timeline: step } }, { new: true, runValidators: true });
  if (!updated) return { error: "Request changed. Refresh its status before trying again.", status: 409 };
  await auditRequestUpdate(updated, previousStatus, actor);
  await notifyRequestUpdate(updated, hospital);
  return expired ? { error: "Request expired", status: 409 } : { request: updated };
}

export async function listVisibleEmergencyRequests(actor) {
  if (["admin", "system_admin"].includes(actor.role)) return EmergencyRequest.find().select("-patientSummary").populate("hospital", "name slug").sort({ createdAt: -1 }).limit(100).lean();
  if (actor.role === "hospital_admin") {
    const ids = await Hospital.find({ admins: actor.id }).distinct("_id");
    return EmergencyRequest.find({ hospital: { $in: ids } }).populate("hospital", "name slug").sort({ createdAt: -1 }).limit(100).lean();
  }
  return EmergencyRequest.find({ user: actor.id }).populate("hospital", "name slug").sort({ createdAt: -1 }).limit(100).lean();
}
