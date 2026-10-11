import nodemailer from "nodemailer";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
import { RequestNotification } from "../models/RequestNotification.js";
import { AuditLog } from "../models/AuditLog.js";
import { AmbulanceBooking } from "../models/AmbulanceBooking.js";

const careerTracking = (d) => d.reference
  ? `\nApplication reference: ${d.reference}\nTrack application: ${env.publicAppUrl}/track?type=career&reference=${encodeURIComponent(d.reference)}`
  : "";

const templates = {
  notification_email: (d) => ["Verify your MedReach notification address", `Confirm this address to receive MedReach notifications: ${d.url}`],
  provider_activation: (d) => ["Activate your MedReach provider account", `Set your personal password and activate your organisation access: ${d.url}`],
  provider_request: (d) => ["Provider request needs review", `Request ${d.reference} for ${d.organization} needs review. Open ${env.publicAppUrl}/provider. This message does not confirm availability or acceptance.`],
  system_emergency: (d) => ["MedReach emergency needs review", `Emergency ${d.reference} for ${d.organization || "an unassigned provider"} was recorded. Open ${env.publicAppUrl}/admin/operations. For immediate emergency assistance call 112. This is not a dispatch confirmation.`],
  welcome: (d) => ["Welcome to MedReach", `Hello ${d.name || "there"}, your MedReach account is ready.`],
  verify_email: (d) => ["Verify your MedReach email", `Use this link to verify your email: ${d.url}`],
  password_reset: (d) => ["Reset your MedReach password", `Use this link to reset your password: ${d.url}`],
  password_changed: () => ["Your MedReach password changed", "Your password was changed and all other sessions were signed out. If this was not you, contact a system administrator immediately."],
  account_status: (d) => ["MedReach account security update", `Your MedReach account was ${d.status}. ${d.note || "Contact a system administrator if you have questions."}`],
  role_changed: (d) => ["MedReach access changed", `Your MedReach role is now ${d.role}. Sign in again to refresh your access.`],
  admin_security: (d) => ["MedReach security notification", `${d.message || "A security-sensitive account action occurred."}`],
  emergency_submitted: (d) => [d.isEmergency === false ? "Hospital bed request submitted" : "Emergency request submitted", `Request ${d.reference} was created for ${d.hospital}. ${d.connected ? "Connected hospital staff can review it in MedReach." : "No hospital staff account is connected; call the hospital directly."} Hospital confirmation is pending. For an immediate emergency call 112.`],
  emergency_accepted: (d) => [d.isEmergency === false ? "Hospital bed request response" : "Emergency request response", `Request ${d.reference} was accepted by ${d.hospital}. Contact the hospital to confirm next steps; this is not a bed reservation.`],
  emergency_rejected: (d) => [d.isEmergency === false ? "Hospital bed request response" : "Emergency request response", `Request ${d.reference} was declined by ${d.hospital}. Please contact another provider or call 112 in an immediate emergency.`],
  emergency_updated: (d) => [d.isEmergency === false ? "Hospital bed request updated" : "Emergency request updated", `Request ${d.reference} is now ${d.status}. Open MedReach for details.`],
  emergency_staff: (d) => ["Hospital bed request needs review", `${d.reference} for ${d.hospital} needs review in MedReach. This is not a confirmed bed reservation.`],
  bed_request_staff_updated: (d) => ["Patient updated a hospital bed request", `Request ${d.reference} for ${d.hospital} is now ${d.status}. Open MedReach to review the patient's update. This is not a confirmed bed reservation.`],
  job_application_received: (d) => ["New job application", `A new application for ${d.title} is ready for review in MedReach.`],
  job_applied: (d) => [d.demo ? "Demo application recorded" : "Application submitted", (d.demo
    ? `Your simulation application for ${d.title} was recorded in MedReach. It was not delivered as a real job application.`
    : `Your application for ${d.title} was submitted. Open MedReach to track it.`) + careerTracking(d)],
  job_updated: (d) => ["Application status updated", `Your application for ${d.title} is now ${d.status}.`],
  ownership_requested: (d) => ["Hospital access request", `A hospital access request for ${d.hospital} awaits administrator review.`],
  ownership_updated: (d) => ["Hospital access request updated", `Your access request for ${d.hospital} is now ${d.status}.`],
  blood_request_confirmation: (d) => [
    d.type === "DONATION" ? "MedReach Blood Donation Pledge Confirmed" : "MedReach Blood Request Received",
    d.type === "DONATION"
      ? `Dear ${d.name || "Donor"},\n\nYour pledge to donate blood (${d.bloodGroup}) at ${d.bloodBankName} was recorded by MedReach.\nYour Reference ID: ${d.reference}\nPreferred Date: ${d.preferredDate || "As scheduled"}\n\nContact the blood bank directly to confirm eligibility and an appointment.\n\nWarm regards,\nMedReach Health Network`
      : `Dear ${d.name || "Requester"},\n\nYour blood request for ${d.units || 1} unit(s) of ${d.bloodGroup} at ${d.bloodBankName} was recorded by MedReach.\nYour Reference ID: ${d.reference}\nUrgency: ${d.urgency || "URGENT"}\nHospital: ${d.hospitalName || "Not specified"}\n\nThe request is available for MedReach administrator review. Contact the blood bank directly to confirm inventory and fulfillment.\n\nWarm regards,\nMedReach Emergency Response`,
  ],
  bed_request_admin_notification: (d) => [
    `New Bed Request: ${d.reference} - ${d.hospital}`,
    `A new ${d.isEmergency ? "emergency" : "routine"} bed request has been submitted on MedReach.\n\n` +
    `Reference ID: ${d.reference}\n` +
    `Hospital: ${d.hospital}\n` +
    `Type: ${d.isEmergency ? "Emergency Bed Request" : "Standard Hospital Bed Request"}\n` +
    `Emergency / Care Category: ${d.emergencyType || "General"}\n` +
    `Facility Required: ${d.requiredFacility || "Emergency Department"}\n` +
    `Contact Phone: ${d.contactPhone || "N/A"}\n` +
    `Contact Email: ${d.contactEmail || "Not provided"}\n` +
    `Ambulance Required: ${d.ambulanceRequired ? `Yes (Pickup: ${d.ambulancePickupAddress || "Not specified"})` : "No"}\n` +
    `Patient Reference: ${d.patientReference || "N/A"}\n` +
    `Patient Age Group: ${d.patientAgeGroup || "N/A"}\n` +
    `Patient Summary: ${d.patientSummary || "None"}\n` +
    `Locality: ${d.locality || "N/A"}\n\n` +
    `Please review in MedReach administrator panel.`,
  ],
  blood_request_admin_notification: (d) => [
    `New Blood ${d.type === "DONATION" ? "Donation Pledge" : "Requisition"}: ${d.reference} (${d.bloodGroup})`,
    `A new blood ${d.type === "DONATION" ? "donation pledge" : "request"} has been received on MedReach.\n\n` +
    `Reference ID: ${d.reference}\n` +
    `Type: ${d.type === "DONATION" ? "Blood Donation Pledge" : "Blood Requisition"}\n` +
    `Blood Group: ${d.bloodGroup}\n` +
    `Units: ${d.units || 1}\n` +
    `Blood Bank: ${d.bloodBankName}\n` +
    `Urgency: ${d.urgency || "Normal"}\n` +
    `Patient / Donor Name: ${d.name}\n` +
    `Contact Phone: ${d.contactPhone}\n` +
    `Contact Email: ${d.contactEmail || "Not provided"}\n` +
    `Hospital: ${d.hospitalName || "Not specified"}\n` +
    `Preferred Date: ${d.preferredDate || "N/A"}\n` +
    `Notes: ${d.notes || "None"}\n\n` +
    `Please review in MedReach administrator panel.`,
  ],
  ambulance_booking_confirmation: (d) => [
    `MedReach Ambulance Booking Confirmation: ${d.reference}`,
    `Dear ${d.patientName || "User"},\n\n` +
    `Your ambulance booking request has been received.\n\n` +
    `Reference ID: ${d.reference}\n` +
    `Ambulance Provider: ${d.providerName}\n` +
    `Provider Contact: ${d.providerPhone || "Available via MedReach directory"}\n` +
    `Patient Name: ${d.patientName}\n` +
    `Patient Age: ${d.patientAge}\n` +
    `Ambulance Required: ${d.ambulanceRequired ? "Yes" : "No"}\n` +
    `Pickup Address: ${d.pickupAddress || "Not specified"}\n` +
    `Notes: ${d.notes || "None"}\n\n` +
    `For acute life-threatening emergencies, dial 108 or 112 immediately.\n\n` +
    `Warm regards,\nMedReach Emergency Response`,
  ],
  ambulance_booking_admin_notification: (d) => [
    `New Ambulance Booking: ${d.reference} - ${d.providerName}`,
    `A new ambulance booking request has been submitted on MedReach.\n\n` +
    `Reference ID: ${d.reference}\n` +
    `Ambulance Provider: ${d.providerName}\n` +
    `Provider Phone: ${d.providerPhone || "N/A"}\n` +
    `Patient Name: ${d.patientName}\n` +
    `Patient Age: ${d.patientAge}\n` +
    `Ambulance Required: ${d.ambulanceRequired ? "Yes" : "No"}\n` +
    `Pickup Address: ${d.pickupAddress || "Not specified"}\n` +
    `Contact Phone: ${d.contactPhone || "Not provided"}\n` +
    `Contact Email: ${d.contactEmail || "Not provided"}\n` +
    `Notes: ${d.notes || "None"}\n\n` +
    `Please review in MedReach administrator panel.`,
  ],
  ambulance_booking_provider_notification: (d) => [
    `New Ambulance Booking Request: ${d.reference}`,
    `A new ambulance booking request has been recorded for ${d.providerName}.\n\n` +
    `Reference ID: ${d.reference}\n` +
    `Patient Name: ${d.patientName}\n` +
    `Patient Age: ${d.patientAge}\n` +
    `Pickup Address: ${d.pickupAddress || "Not specified"}\n` +
    `Contact Phone: ${d.contactPhone || "Not provided"}\n` +
    `Contact Email: ${d.contactEmail || "Not provided"}\n` +
    `Notes: ${d.notes || "None"}\n\n` +
    `Please contact the requester directly to confirm availability and next steps. This message does not confirm dispatch.`,
  ],
  org_applied: (d) => [
    "Application submitted",
    `Your application to ${d.organizationName} was submitted. Open MedReach to track it.` + careerTracking(d)
  ],
  org_application_received: (d) => [
    "New organization application",
    `A new application for ${d.organizationName} is ready for review in MedReach.`
  ],
  org_application_updated: (d) => [
    "Application status updated",
    `Your application to ${d.organizationName} is now ${d.status}.`
  ],
};

export const SYSTEM_NOTIFICATION_EMAIL = env.systemEmail || "medreachforyou@gmail.com";

let transporter;
let transportFactory = (options) => nodemailer.createTransport(options);
const NON_REPLAYABLE_TEMPLATES = new Set(["verify_email", "password_reset", "provider_activation", "notification_email"]);
const leaseDurationMs = 60_000;

function envelopeKey() {
  return createHash("sha256").update(env.jwtSecret).digest();
}

function encryptEnvelope(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", envelopeKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({ iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"),
    data: encrypted.toString("base64url") });
}

function decryptEnvelope(value) {
  const parsed = JSON.parse(value);
  const decipher = createDecipheriv("aes-256-gcm", envelopeKey(), Buffer.from(parsed.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64url")),
    decipher.final(),
  ]).toString("utf8"));
}

function getTransporter() {
  transporter ||= transportFactory({ host: env.smtpHost, port: env.smtpPort, secure: env.smtpSecure,
    connectionTimeout: env.smtpConnectionTimeoutMs, greetingTimeout: env.smtpConnectionTimeoutMs,
    socketTimeout: env.smtpConnectionTimeoutMs,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined });
  return transporter;
}

async function claimDelivery(id, actorId) {
  const now = new Date();
  const expired = await EmailDelivery.findOneAndUpdate({ _id: id, status: "pending", attempts: { $gt: 0 },
    $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
    { $set: { status: "uncertain", errorCode: "DELIVERY_OUTCOME_UNKNOWN", lastError: "Check the recipient inbox before sending again" },
      $unset: { leaseToken: 1, leaseUntil: 1 } }, { new: true });
  if (expired) return null;
  const leaseToken = randomUUID();
  const delivery = await EmailDelivery.findOneAndUpdate({
    _id: id,
    status: { $in: ["pending", "failed"] },
    $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
  }, {
    $set: { status: "pending", leaseToken, leaseUntil: new Date(now.getTime() + leaseDurationMs),
      lastAttemptAt: now, ...(actorId ? { retriedBy: actorId, retriedAt: now } : {}) },
    $inc: { attempts: 1 },
  }, { new: true }).select("+leaseToken +retryEnvelope");
  return delivery ? { delivery, leaseToken } : null;
}

async function finishDelivery({ delivery, leaseToken, message }) {
  let accepted = false;
  try {
    await getTransporter().sendMail({ from: { name: env.smtpFromName, address: env.smtpFrom },
      to: message.to, subject: message.subject, text: message.text });
    accepted = true;
    const result = await EmailDelivery.findOneAndUpdate({ _id: delivery._id, leaseToken }, {
      $set: { status: "sent", sentAt: new Date() },
      $unset: { lastError: 1, errorCode: 1, leaseToken: 1, leaseUntil: 1 },
    }, { new: true });
    return result || { _id: delivery._id, status: "uncertain", errorCode: "DELIVERY_OUTCOME_UNKNOWN" };
  } catch (error) {
    const code = String(error?.code || "SMTP_DELIVERY_FAILED").replace(/[^A-Z0-9_-]/gi, "_").slice(0, 80);
    const uncertain = accepted || (error?.command === "DATA" && ["ETIMEDOUT", "ECONNRESET", "ESOCKET"].includes(code));
    try { const result = await EmailDelivery.findOneAndUpdate({ _id: delivery._id, leaseToken }, {
      $set: { status: uncertain ? "uncertain" : "failed", errorCode: uncertain ? "DELIVERY_OUTCOME_UNKNOWN" : code,
        ...(uncertain ? { lastError: "Delivery may have completed. Check the recipient inbox before sending again" } : {
        lastError: code === "EAUTH" ? "SMTP authentication failed" :
          code.includes("TIME") ? "SMTP connection timed out" : "SMTP delivery failed" }) },
      $unset: { leaseToken: 1, leaseUntil: 1 },
    }, { new: true });
      return result || { _id: delivery._id, status: "uncertain", errorCode: "DELIVERY_OUTCOME_UNKNOWN" };
    } catch {
      return { _id: delivery._id, status: "uncertain", errorCode: "DELIVERY_OUTCOME_UNKNOWN" };
    }
  }
}

export function emailConfiguration() {
  const isGoogle =
    (env.smtpHost && env.smtpHost.includes("gmail")) ||
    ["google", "gmail"].includes((env.emailProvider || "").toLowerCase());
  const configured = Boolean(env.smtpHost && env.smtpFrom
    && (!isGoogle || (env.smtpUser && env.smtpPassword)));
  return {
    enabled: env.emailEnabled,
    configured,
    provider: isGoogle ? "google" : (Boolean(env.smtpHost && env.smtpFrom) ? "smtp" : "none"),
    mode: env.emailEnabled ? (isGoogle ? "google" : "smtp") : "disabled",
  };
}

export async function sendEmailEvent({ eventKey, to, template, data = {}, source }) {
  try {
    if (!eventKey || !to || !templates[template]) return { status: "failed", errorCode: "INVALID_EMAIL_EVENT" };
    const [subject, text] = templates[template](data);
    const retryable = !NON_REPLAYABLE_TEMPLATES.has(template);
    const retryEnvelope = retryable ? encryptEnvelope({ to, subject, text }) : undefined;
    let delivery = await EmailDelivery.findOne({ eventKey });
    if (["sent", "uncertain"].includes(delivery?.status)) return delivery;
    if (!delivery) {
      try {
        delivery = await EmailDelivery.create({ eventKey, recipient: to, template, subject,
          status: env.emailEnabled ? "pending" : "disabled", retryable, retryEnvelope,
          ...(source?.model && source?.id && source?.channel ? {
            sourceModel: source.model,
            sourceId: source.id,
            sourceChannel: source.channel,
          } : {}) });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        delivery = await EmailDelivery.findOne({ eventKey });
      }
    }
    if (!env.emailEnabled || delivery.status === "disabled") return delivery;
    if (!emailConfiguration().configured) {
      delivery.status = "failed";
      delivery.errorCode = "SMTP_CONFIG_INCOMPLETE";
      delivery.lastError = "SMTP configuration incomplete";
      await delivery.save();
      return delivery;
    }
    const claim = await claimDelivery(delivery._id);
    if (!claim) return EmailDelivery.findById(delivery._id);
    return finishDelivery({ ...claim, message: { to, subject, text } });
  } catch (error) {
    // Persist only a bounded category. Provider messages can echo usernames or hosts.
    const code = String(error?.code || "SMTP_DELIVERY_FAILED").replace(/[^A-Z0-9_-]/gi, "_").slice(0, 80);
    try {
      const delivery = await EmailDelivery.findOne({ eventKey });
      if (delivery && !["sent", "uncertain"].includes(delivery.status) && !delivery.leaseUntil && !(delivery.status === "pending" && delivery.attempts > 0)) {
        delivery.status = "failed";
        delivery.attempts += delivery.attempts ? 0 : 1;
        delivery.errorCode = code;
        delivery.lastError = code === "EAUTH" ? "SMTP authentication failed" :
          code.includes("TIME") ? "SMTP connection timed out" : "SMTP delivery failed";
        await delivery.save();
        return delivery;
      }
    } catch { /* email persistence must never break the calling workflow */ }
    return { status: "uncertain", errorCode: "DELIVERY_OUTCOME_UNKNOWN" };
  }
}

export async function retryEmailDelivery({ deliveryId, actorId }) {
  const existing = await EmailDelivery.findById(deliveryId).select("+retryEnvelope");
  if (!existing) return { error: "Email delivery not found", status: 404 };
  if (existing.status === "sent") return { error: "Email was already sent", status: 409 };
  if (existing.status === "uncertain") return { error: "Delivery may have completed. Check the recipient inbox before preparing another message", status: 409 };
  if (!existing.retryable || !existing.retryEnvelope) {
    return { error: "This email cannot be retried; use the account recovery action instead", status: 409 };
  }
  if (!env.emailEnabled || !emailConfiguration().configured) {
    return { error: "Email delivery is not configured", status: 409 };
  }
  if (existing.sourceModel === "RequestNotification") {
    const intent = await RequestNotification.findById(existing.sourceId);
    const Model = (await import("mongoose")).default.model(intent?.sourceType || "EmergencyRequest");
    const record = intent && await Model.findById(intent.source);
    const { notificationRecipients, requestRouting } = await import("./requestNotifications.js");
    const routing = record && requestRouting(record, intent.sourceType);
    const recipients = routing ? await notificationRecipients(routing.kind, routing.organizationId, routing.isEmergency) : [];
    if (!intent || !recipients.some(({ user }) => String(user._id) === String(intent.recipient) && user.notificationEmail === intent.email)) return { error: "Recipient no longer has the required notification access", code: "RECIPIENT_NO_LONGER_ELIGIBLE", status: 409 };
  }
  const claim = await claimDelivery(existing._id, actorId);
  if (!claim) return { error: "Email delivery is already being processed", status: 409 };
  let message;
  try {
    message = decryptEnvelope(existing.retryEnvelope);
  } catch {
    await EmailDelivery.updateOne({ _id: existing._id, leaseToken: claim.leaseToken }, {
      $set: { status: "failed", errorCode: "RETRY_ENVELOPE_INVALID", lastError: "Stored retry content is unavailable" },
      $unset: { leaseToken: 1, leaseUntil: 1 },
    });
    return { error: "Stored retry content is unavailable", status: 409 };
  }
  const delivery = await finishDelivery({ ...claim, message });
  if (delivery?.sourceModel === "RequestNotification") {
    const intent = await RequestNotification.findById(delivery.sourceId);
    if (intent) {
      intent.status = delivery.status; await intent.save();
      if (intent.sourceType === "AmbulanceBooking") {
        const booking = await AmbulanceBooking.findById(intent.source);
        if (booking) { const { refreshAmbulanceDeliveryState } = await import("./ambulanceDeliveryState.js"); await refreshAmbulanceDeliveryState(booking); await booking.save(); }
      }
    }
  }
  if (delivery?.sourceModel === "AmbulanceBooking"
    && ["user", "admin", "provider"].includes(delivery.sourceChannel)) {
    const prefix = `delivery.${delivery.sourceChannel}`;
    await AmbulanceBooking.updateOne({ _id: delivery.sourceId }, {
      $set: {
        [`${prefix}.status`]: delivery.status,
        [`${prefix}.attempted`]: true,
        [`${prefix}.attemptedAt`]: delivery.lastAttemptAt || new Date(),
        [`${prefix}.emailDelivery`]: delivery._id,
        ...(delivery.status === "sent" ? { [`${prefix}.sentAt`]: delivery.sentAt || new Date() } : {}),
        ...(delivery.errorCode ? { [`${prefix}.errorCode`]: delivery.errorCode } : {}),
      },
      ...(delivery.status === "sent" ? { $unset: { [`${prefix}.errorCode`]: 1 } } : {}),
    });
  }
  await AuditLog.create({ user: actorId, action: "update", entityType: "EmailDelivery",
    entityId: existing._id, before: { status: existing.status },
    after: { status: delivery.status, operation: "retry" } });
  return { delivery };
}

export function setEmailTransportFactoryForTests(factory) {
  transportFactory = factory || ((options) => nodemailer.createTransport(options));
  transporter = undefined;
}
