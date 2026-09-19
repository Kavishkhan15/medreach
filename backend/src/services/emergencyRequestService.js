import { randomBytes } from "node:crypto";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { Hospital } from "../models/Hospital.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { canManageHospital } from "./hospitalAccess.js";
import { notifyUser } from "./notificationService.js";

import { sendEmailEvent } from "./emailService.js";

const transitions = {
  REQUESTED: ["SENT", "UNDER_REVIEW", "REJECTED", "CANCELLED", "EXPIRED"],
  SENT: ["UNDER_REVIEW", "REJECTED", "CANCELLED", "EXPIRED"],
  UNDER_REVIEW: ["INFORMATION_REQUESTED", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"],
  INFORMATION_REQUESTED: ["UNDER_REVIEW", "REJECTED", "CANCELLED", "EXPIRED"],
  ACCEPTED: ["COMPLETED", "CANCELLED"],
  REJECTED: [], EXPIRED: [], CANCELLED: [], COMPLETED: [],
};

export async function createEmergencyRequest(data, actor) {
  const hospital = await Hospital.findById(data.hospitalId);
  if (!hospital) return { error: "Hospital not found", status: 404 };
  const userId = actor?.id || null;
  const isEmergency = data.isEmergency !== false;
  const request = await EmergencyRequest.create({
    requestId: `MR-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`,
    user: userId,
    hospital: hospital._id,
    emergencyType: data.emergencyType,
    requiredFacility: data.requiredFacility,
    patientAgeGroup: data.patientAgeGroup || "unknown",
    patientReference: data.patientReference,
    patientSummary: data.patientSummary,
    contactPhone: data.contactPhone,
    contactEmail: data.contactEmail || actor?.email || undefined,
    isEmergency,
    locality: data.locality,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    timeline: [{ status: "REQUESTED", actor: userId, note: userId ? undefined : "Guest emergency request" }],
  });
  const connectedStaff = await User.find({ _id: { $in: hospital.admins || [] },
    accountStatus: "active", role: { $in: ["hospital_admin", "admin", "system_admin"] } }).select("_id").lean();
  const hasHospitalStaff = connectedStaff.length > 0;
  if (hasHospitalStaff) {
    request.status = "SENT";
    request.timeline.push({ status: "SENT", at: new Date() });
    await request.save();
  }
  await AuditLog.create({ user: userId || undefined, action: "create", entityType: "EmergencyRequest",
    entityId: request._id, after: { status: request.status, hospital: hospital._id, requestId: request.requestId,
      hospitalStaffConnected: hasHospitalStaff, guest: !userId } });

  if (userId) {
    await notifyUser({ recipient: userId, eventKey: `emergency:${request._id}:created`, type: "emergency_request",
      title: "Emergency request submitted", message: hasHospitalStaff
        ? `${request.requestId} was sent to connected hospital staff. No bed is reserved.`
        : `${request.requestId} was recorded, but this hospital is not connected to MedReach staff. Call the hospital directly. No bed is reserved.`,
      relatedType: "EmergencyRequest", relatedId: request._id,
      emailTemplate: "emergency_submitted", emailData: { reference: request.requestId, hospital: hospital.name, connected: hasHospitalStaff } });
  } else if (data.contactEmail) {
    await sendEmailEvent({
      eventKey: `mail:emergency:${request._id}:created`,
      to: data.contactEmail,
      template: "emergency_submitted",
      data: { reference: request.requestId, hospital: hospital.name, connected: hasHospitalStaff }
    });
  }

  for (const { _id: adminId } of connectedStaff) {
    await notifyUser({ recipient: adminId, eventKey: `emergency:${request._id}:hospital:${adminId}`,
      type: "emergency_request", title: "New emergency request", message: `${request.requestId} needs review.`,
      relatedType: "EmergencyRequest", relatedId: request._id,
      emailTemplate: "emergency_staff", emailData: { reference: request.requestId, hospital: hospital.name } });
  }
  return { request };
}

export async function changeEmergencyRequest({ requestId, actor, nextStatus, note = "", hospitalResponse = "" }) {
  const request = await EmergencyRequest.findById(requestId);
  if (!request) return { error: "Request not found", status: 404 };
  const hospital = await Hospital.findById(request.hospital);
  const isStaff = actor ? canManageHospital(actor, hospital) : false;
  const isOwner = (request.user && actor) ? String(request.user) === String(actor.id) : (!request.user && nextStatus === "CANCELLED");
  if (!isOwner && !isStaff) return { error: "Access denied", status: 403 };
  if (request.expiresAt < new Date() && !["ACCEPTED", "REJECTED", "CANCELLED", "COMPLETED"].includes(request.status)) {
    request.status = "EXPIRED";
    request.timeline.push({ status: "EXPIRED", at: new Date() });
    await request.save();
    return { error: "Request expired", status: 409 };
  }
  if (!transitions[request.status]?.includes(nextStatus)) return { error: "Invalid status transition", status: 409 };
  if (isOwner && !isStaff && nextStatus !== "CANCELLED") return { error: "Only hospital staff can respond", status: 403 };
  if (nextStatus === "CANCELLED" && !isOwner && !isStaff) return { error: "Access denied", status: 403 };
  const previousStatus = request.status;
  request.status = nextStatus;
  if (hospitalResponse && isStaff) request.hospitalResponse = hospitalResponse;
  if (isStaff) request.respondedAt = new Date();
  request.timeline.push({ status: nextStatus, actor: actor?.id || undefined, note });
  await request.save();
  await AuditLog.create({ user: actor?.id || undefined, action: "update", entityType: "EmergencyRequest", entityId: request._id,
    before: { status: previousStatus }, after: { status: nextStatus } });

  if (request.user) {
    await notifyUser({ recipient: request.user, eventKey: `emergency:${request._id}:${request.timeline.length}`,
      type: "emergency_request", title: "Emergency request updated",
      message: `${request.requestId}: ${nextStatus.replaceAll("_", " ")}. This is not a confirmed bed reservation.`,
      relatedType: "EmergencyRequest", relatedId: request._id,
      emailTemplate: nextStatus === "ACCEPTED" ? "emergency_accepted" : nextStatus === "REJECTED" ? "emergency_rejected" : "emergency_updated",
      emailData: { reference: request.requestId, hospital: hospital.name, status: nextStatus } });
  } else if (request.contactEmail) {
    await sendEmailEvent({
      eventKey: `mail:emergency:${request._id}:${request.timeline.length}`,
      to: request.contactEmail,
      template: nextStatus === "ACCEPTED" ? "emergency_accepted" : nextStatus === "REJECTED" ? "emergency_rejected" : "emergency_updated",
      data: { reference: request.requestId, hospital: hospital.name, status: nextStatus }
    });
  }
  return { request };
}

export async function listVisibleEmergencyRequests(actor) {
  if (["admin", "system_admin"].includes(actor.role)) return EmergencyRequest.find().select("-patientSummary").populate("hospital", "name slug").sort({ createdAt: -1 }).limit(100).lean();
  if (actor.role === "hospital_admin") {
    const ids = await Hospital.find({ admins: actor.id }).distinct("_id");
    return EmergencyRequest.find({ hospital: { $in: ids } }).populate("hospital", "name slug").sort({ createdAt: -1 }).limit(100).lean();
  }
  return EmergencyRequest.find({ user: actor.id }).populate("hospital", "name slug").sort({ createdAt: -1 }).limit(100).lean();
}
