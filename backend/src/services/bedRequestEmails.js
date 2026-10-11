import { notificationRecipients } from "./requestNotifications.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
import { AuditLog } from "../models/AuditLog.js";
import { sendUserEmailSafely } from "./userEmailService.js";
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
export async function emailRequestUpdate(request, hospital) {
  const eventKey = `emergency:${request._id}:${request.timeline.length}`;
  const event = { eventKey,
    emailTemplate: request.status === "ACCEPTED" ? "emergency_accepted" : request.status === "REJECTED" ? "emergency_rejected" : "emergency_updated",
    emailData: { reference: request.requestId, hospital: hospital?.name || "the hospital", status: request.status, isEmergency: request.isEmergency } };
  if (request.user) {
    await sendUserEmailSafely({ ...event, recipient: request.user });
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
      const staff = await notificationRecipients("hospital", hospital?._id, false);
      for (const { user } of staff) {
        await sendEmailEvent({ eventKey: `mail:${eventKey}:hospital:${user._id}`, to: user.notificationEmail,
          template: "bed_request_staff_updated", data: event.emailData });
      }
    } catch {
      console.warn("[medreach] Request saved; staff update email unavailable.");
    }
  }
}

// Only patient-facing delivery metadata is public to an authorized request
// viewer. Never expose staff email addresses, retry payloads, or SMTP errors.
export async function requestEmailHistory(request) {
  const prefix = `emergency:${request._id}`;
  const events = [`${prefix}:created`, `${prefix}:expired`,
    ...request.timeline.map((_, index) => `${prefix}:${index + 1}`)];
  try {
    const emails = await EmailDelivery.find({ eventKey: { $in: [`mail:${prefix}:user_confirm`, ...events.map((key) => `mail:${key}`)] } })
      .select("subject status createdAt sentAt").sort({ createdAt: 1 }).lean();
    return { available: true, items: emails.map((item) => ({ id: String(item._id), channel: "email", title: item.subject,
      status: item.status, at: item.createdAt, sentAt: item.sentAt })) };
  } catch {
    return { available: false, items: [] };
  }
}
