import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { EmailDelivery } from "../models/EmailDelivery.js";

const templates = {
  welcome: (d) => ["Welcome to MedReach", `Hello ${d.name || "there"}, your MedReach account is ready.`],
  verify_email: (d) => ["Verify your MedReach email", `Use this link to verify your email: ${d.url}`],
  password_reset: (d) => ["Reset your MedReach password", `Use this link to reset your password: ${d.url}`],
  emergency_submitted: (d) => ["Emergency request submitted", `Request ${d.reference} was created for ${d.hospital}. ${d.connected ? "Connected hospital staff were notified." : "No hospital staff account is connected; call the hospital directly."} Hospital confirmation is pending. For an immediate emergency call 112.`],
  emergency_accepted: (d) => ["Emergency request response", `Request ${d.reference} was accepted by ${d.hospital}. Contact the hospital to confirm next steps; this is not a bed reservation.`],
  emergency_rejected: (d) => ["Emergency request response", `Request ${d.reference} was declined by ${d.hospital}. Please contact another provider or call 112 in an immediate emergency.`],
  emergency_updated: (d) => ["Emergency request updated", `Request ${d.reference} is now ${d.status}. Open MedReach for details.`],
  job_applied: (d) => [d.demo ? "Demo application recorded" : "Application submitted", d.demo
    ? `Your simulation application for ${d.title} was recorded in MedReach. It was not delivered as a real job application.`
    : `Your application for ${d.title} was submitted. Open MedReach to track it.`],
  job_updated: (d) => ["Application status updated", `Your application for ${d.title} is now ${d.status}.`],
  ownership_requested: (d) => ["Hospital access request", `A hospital access request for ${d.hospital} awaits administrator review.`],
  ownership_updated: (d) => ["Hospital access request updated", `Your access request for ${d.hospital} is now ${d.status}.`],
};

let transporter;
export function emailConfiguration() {
  return { enabled: env.emailEnabled, configured: Boolean(env.smtpHost && env.smtpFrom), mode: env.emailEnabled ? "smtp" : "disabled" };
}

export async function sendEmailEvent({ eventKey, to, template, data = {} }) {
  if (!eventKey || !to || !templates[template]) throw new Error("invalid_email_event");
  const [subject, text] = templates[template](data);
  let delivery = await EmailDelivery.findOne({ eventKey });
  if (delivery?.status === "sent") return delivery;
  if (!delivery) delivery = await EmailDelivery.create({ eventKey, recipient: to, template, subject,
    status: env.emailEnabled ? "pending" : "disabled" });
  if (!env.emailEnabled) return delivery;
  if (!env.smtpHost || !env.smtpFrom) {
    delivery.status = "failed";
    delivery.lastError = "SMTP configuration incomplete";
    await delivery.save();
    return delivery;
  }
  try {
    transporter ||= nodemailer.createTransport({ host: env.smtpHost, port: env.smtpPort, secure: env.smtpSecure,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined });
    delivery.attempts += 1;
    await transporter.sendMail({ from: { name: env.smtpFromName, address: env.smtpFrom }, to, subject, text });
    delivery.status = "sent";
    delivery.sentAt = new Date();
    delivery.lastError = undefined;
  } catch (error) {
    delivery.status = "failed";
    delivery.lastError = String(error.code || error.message || "SMTP delivery failed").slice(0, 240);
  }
  await delivery.save();
  return delivery;
}
