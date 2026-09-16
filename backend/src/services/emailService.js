import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { EmailDelivery } from "../models/EmailDelivery.js";

const templates = {
  welcome: (d) => ["Welcome to MedReach", `Hello ${d.name || "there"}, your MedReach account is ready.`],
  verify_email: (d) => ["Verify your MedReach email", `Use this link to verify your email: ${d.url}`],
  password_reset: (d) => ["Reset your MedReach password", `Use this link to reset your password: ${d.url}`],
  password_changed: () => ["Your MedReach password changed", "Your password was changed and all other sessions were signed out. If this was not you, contact a system administrator immediately."],
  google_linked: () => ["Google sign-in linked", "Google sign-in was linked to your MedReach account. If this was not you, change your password and contact a system administrator."],
  google_unlinked: () => ["Google sign-in removed", "Google sign-in was removed from your MedReach account. Your password remains available for sign-in."],
  account_status: (d) => ["MedReach account security update", `Your MedReach account was ${d.status}. ${d.note || "Contact a system administrator if you have questions."}`],
  role_changed: (d) => ["MedReach access changed", `Your MedReach role is now ${d.role}. Sign in again to refresh your access.`],
  admin_security: (d) => ["MedReach security notification", `${d.message || "A security-sensitive account action occurred."}`],
  emergency_submitted: (d) => ["Emergency request submitted", `Request ${d.reference} was created for ${d.hospital}. ${d.connected ? "Connected hospital staff were notified." : "No hospital staff account is connected; call the hospital directly."} Hospital confirmation is pending. For an immediate emergency call 112.`],
  emergency_accepted: (d) => ["Emergency request response", `Request ${d.reference} was accepted by ${d.hospital}. Contact the hospital to confirm next steps; this is not a bed reservation.`],
  emergency_rejected: (d) => ["Emergency request response", `Request ${d.reference} was declined by ${d.hospital}. Please contact another provider or call 112 in an immediate emergency.`],
  emergency_updated: (d) => ["Emergency request updated", `Request ${d.reference} is now ${d.status}. Open MedReach for details.`],
  emergency_staff: (d) => ["New emergency request needs review", `${d.reference} for ${d.hospital} needs review in MedReach. This is not a confirmed bed reservation.`],
  job_application_received: (d) => ["New job application", `A new application for ${d.title} is ready for review in MedReach.`],
  job_applied: (d) => [d.demo ? "Demo application recorded" : "Application submitted", d.demo
    ? `Your simulation application for ${d.title} was recorded in MedReach. It was not delivered as a real job application.`
    : `Your application for ${d.title} was submitted. Open MedReach to track it.`],
  job_updated: (d) => ["Application status updated", `Your application for ${d.title} is now ${d.status}.`],
  ownership_requested: (d) => ["Hospital access request", `A hospital access request for ${d.hospital} awaits administrator review.`],
  ownership_updated: (d) => ["Hospital access request updated", `Your access request for ${d.hospital} is now ${d.status}.`],
};

let transporter;
let transportFactory = (options) => nodemailer.createTransport(options);
export function emailConfiguration() {
  return { enabled: env.emailEnabled, configured: Boolean(env.smtpHost && env.smtpFrom),
    mode: env.emailEnabled ? "smtp" : "disabled" };
}

export async function sendEmailEvent({ eventKey, to, template, data = {} }) {
  try {
    if (!eventKey || !to || !templates[template]) return { status: "failed", errorCode: "INVALID_EMAIL_EVENT" };
    const [subject, text] = templates[template](data);
    let delivery = await EmailDelivery.findOne({ eventKey });
    if (delivery?.status === "sent") return delivery;
    if (!delivery) delivery = await EmailDelivery.create({ eventKey, recipient: to, template, subject,
      status: env.emailEnabled ? "pending" : "disabled" });
    if (!env.emailEnabled) return delivery;
    if (!env.smtpHost || !env.smtpFrom) {
      delivery.status = "failed";
      delivery.errorCode = "SMTP_CONFIG_INCOMPLETE";
      delivery.lastError = "SMTP configuration incomplete";
      await delivery.save();
      return delivery;
    }
    transporter ||= transportFactory({ host: env.smtpHost, port: env.smtpPort, secure: env.smtpSecure,
      connectionTimeout: env.smtpConnectionTimeoutMs, greetingTimeout: env.smtpConnectionTimeoutMs,
      socketTimeout: env.smtpConnectionTimeoutMs,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined });
    delivery.attempts += 1;
    await transporter.sendMail({ from: { name: env.smtpFromName, address: env.smtpFrom }, to, subject, text });
    delivery.status = "sent";
    delivery.sentAt = new Date();
    delivery.lastError = undefined;
    delivery.errorCode = undefined;
    await delivery.save();
    return delivery;
  } catch (error) {
    // Persist only a bounded category. Provider messages can echo usernames or hosts.
    const code = String(error?.code || "SMTP_DELIVERY_FAILED").replace(/[^A-Z0-9_-]/gi, "_").slice(0, 80);
    try {
      const delivery = await EmailDelivery.findOne({ eventKey });
      if (delivery) {
        delivery.status = "failed";
        delivery.attempts += delivery.attempts ? 0 : 1;
        delivery.errorCode = code;
        delivery.lastError = code === "EAUTH" ? "SMTP authentication failed" :
          code.includes("TIME") ? "SMTP connection timed out" : "SMTP delivery failed";
        await delivery.save();
        return delivery;
      }
    } catch { /* email persistence must never break the calling workflow */ }
    return { status: "failed", errorCode: code };
  }
}

export function setEmailTransportFactoryForTests(factory) {
  transportFactory = factory || ((options) => nodemailer.createTransport(options));
  transporter = undefined;
}
