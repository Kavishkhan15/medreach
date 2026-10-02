import { User } from "../models/User.js";
import { Notification } from "../models/Notification.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
import { AuditLog } from "../models/AuditLog.js";
import { notifyUserSafely } from "./notificationService.js";
import { sendEmailEvent } from "./emailService.js";

export async function auditRequestUpdate(request, previousStatus, actor) {
  try {
    await AuditLog.create({ user: actor?.id, action: "update", entityType: "EmergencyRequest", entityId: request._id,
      before: { status: previousStatus }, after: { status: request.status, timelineLength: request.timeline.length } });
  } catch {
    console.warn("[medreach] Request saved; audit logging unavailable.");
  }
}

// Status/timeline are the durable result. A secondary delivery failure must not
// hide that result or encourage a repeated transition.
export async function notifyRequestUpdate(request, hospital) {
  const eventKey = `emergency:${request._id}:${request.timeline.length}`;
  const type = request.isEmergency ? "Emergency" : "Hospital bed";
  const event = { eventKey, type: "emergency_request", title: `${type} request updated`,
    message: `${request.requestId}: ${request.status.replaceAll("_", " ")}. Open the request for the hospital response. No bed is reserved.`,
    relatedType: "EmergencyRequest", relatedId: request._id,
    emailTemplate: request.status === "ACCEPTED" ? "emergency_accepted" : request.status === "REJECTED" ? "emergency_rejected" : "emergency_updated",
    emailData: { reference: request.requestId, hospital: hospital?.name || "the hospital", status: request.status, isEmergency: request.isEmergency } };
  if (request.user) {
    await notifyUserSafely({ ...event, recipient: request.user });
  } else if (request.contactEmail) {
    try {
      await sendEmailEvent({ eventKey: `mail:${eventKey}`, to: request.contactEmail,
        template: event.emailTemplate, data: event.emailData });
    } catch {
      console.warn("[medreach] Request saved; guest status email unavailable.");
    }
  }
  const latest = request.timeline.at(-1);
  if (latest?.actorRole === "patient") {
    try {
      const staff = await User.find({ _id: { $in: hospital?.admins || [] }, accountStatus: "active",
        role: { $in: ["hospital_admin", "admin", "system_admin"] } }).select("_id").lean();
      for (const recipient of staff) {
        await notifyUserSafely({ ...event, recipient: recipient._id, eventKey: `${eventKey}:hospital:${recipient._id}`,
          title: request.status === "CANCELLED" ? "Patient cancelled request" : "Patient supplied information",
          emailTemplate: "bed_request_staff_updated" });
      }
    } catch {
      console.warn("[medreach] Request saved; staff update notification unavailable.");
    }
  }
}

// Only patient-facing delivery metadata is public to an authorized request
// viewer. Never expose staff email addresses, retry payloads, or SMTP errors.
export async function requestNotificationHistory(request) {
  const prefix = `emergency:${request._id}`;
  const events = [`${prefix}:created`, `${prefix}:expired`,
    ...request.timeline.map((_, index) => `${prefix}:${index + 1}`)];
  try {
    const [notifications, emails] = await Promise.all([
      request.user ? Notification.find({ recipient: request.user, eventKey: { $in: events } })
        .select("title createdAt readAt").sort({ createdAt: 1 }).lean() : [],
      EmailDelivery.find({ eventKey: { $in: [`mail:${prefix}:user_confirm`, ...events.map((key) => `mail:${key}`)] } })
        .select("subject status createdAt sentAt").sort({ createdAt: 1 }).lean(),
    ]);
    return { available: true, items: [
      ...notifications.map((item) => ({ id: String(item._id), channel: "in_app", title: item.title,
        status: item.readAt ? "read" : "recorded", at: item.createdAt })),
      ...emails.map((item) => ({ id: String(item._id), channel: "email", title: item.subject,
        status: item.status, at: item.createdAt, sentAt: item.sentAt })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at)) };
  } catch {
    return { available: false, items: [] };
  }
}
