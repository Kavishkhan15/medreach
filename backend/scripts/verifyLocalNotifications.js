// Explicit local SMTP check. All outgoing mail is confined to the approved inbox.
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import nodemailer from "nodemailer";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { RequestNotification } from "../src/models/RequestNotification.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { AuthToken } from "../src/models/AuthToken.js";
import { signSessionToken } from "../test/helpers/session.js";
import { notificationRecipients } from "../src/services/requestNotifications.js";
import { issueProviderActivation } from "../src/services/providerInvitation.js";
import { issueAuthToken } from "../src/services/authTokenService.js";
import { configureNotificationContact } from "../src/services/notificationContacts.js";
import { setEmailTransportFactoryForTests, emailConfiguration } from "../src/services/emailService.js";

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const recipient = process.argv.includes("--recipient") ? arg("--recipient") : "";
const uri = process.argv.includes("--mongo-uri") ? arg("--mongo-uri") : "";
if (!["development", "test"].includes(env.nodeEnv) || !/^mongodb:\/\/127\.0\.0\.1:\d+\/medreach_local_email_test$/.test(uri)) throw Error("An isolated local email test database is required");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !emailConfiguration().enabled || !emailConfiguration().configured) throw Error("Approved recipient and existing enabled SMTP configuration are required");
let transport, sent = 0;
const links = new Map();
setEmailTransportFactoryForTests((options) => {
  transport = nodemailer.createTransport(options);
  return { async sendMail(message) {
    assert.equal(message.to, recipient, "Refusing an unapproved email recipient");
    const info = await transport.sendMail(message);
    assert.ok(info.accepted?.some((address) => address.toLowerCase() === recipient.toLowerCase()), "SMTP did not accept the approved recipient");
    sent++; const match = message.text.match(/https?:\/\/[^\s]+[?&]token=([A-Za-z0-9_-]+)/);
    if (match) links.set(message.subject, match[1]);
    return info;
  } };
});
await mongoose.connect(uri);
if (await mongoose.connection.db.collection("users").countDocuments()) throw Error("Email test database is not empty; refusing to overwrite records");
try {
  await Promise.all([User, Hospital, ResourceProvider, ProviderMembership, RequestNotification, EmailDelivery, AuthToken].map((M) => M.init()));
  const app = createApp(), password = "LocalEmailSecurityTest123!";
  const patient = new User({ name: "Local email user", email: recipient, role: "user", emailVerifiedAt: new Date() });
  await patient.setPassword(password); await patient.save();
  const system = new User({ name: "Local email System Admin", email: "system@medreach.invalid", role: "system_admin", notificationEmail: recipient, notificationsEnabled: true, notificationEmailVerifiedAt: new Date() });
  await system.setPassword(password); await system.save();
  const provider = new User({ name: "Local email Provider Admin", email: "provider@medreach.invalid", role: "provider_admin", notificationEmail: recipient, accountStatus: "pending" }); await provider.save();
  const h = await Hospital.create({ name: "Local SMTP test hospital", verificationStatus: "verified" });
  const bank = await ResourceProvider.create({ name: "Local SMTP test blood bank", kind: "blood_bank", verificationStatus: "verified", sourceName: "Isolated email test" });
  const ambulance = await ResourceProvider.create({ name: "Local SMTP test ambulance", kind: "ambulance", verificationStatus: "verified", sourceName: "Isolated email test" });
  for (const [kind, organization] of [["hospital", h._id], ["blood_bank", bank._id], ["ambulance", ambulance._id]]) await ProviderMembership.create({ user: provider._id, kind, organization, assignedBy: system._id });
  assert.equal((await issueProviderActivation(provider)).status, "sent");
  const activation = await request(app).post("/api/auth/activate-provider").send({ token: links.get("Activate your MedReach provider account"), password }); assert.equal(activation.status, 200);
  await issueAuthToken(await User.findById(provider._id), "reset_password");
  const reset = await request(app).post("/api/auth/reset-password").send({ token: links.get("Reset your MedReach password"), password: "LocalEmailResetPassword123!" }); assert.equal(reset.status, 200);
  const providerContact = await User.findById(provider._id).select("+authVersion");
  await User.updateOne({ _id: provider._id }, { $unset: { notificationEmailVerifiedAt: 1 } }); providerContact.notificationEmailVerifiedAt = undefined;
  assert.equal(await configureNotificationContact(providerContact, recipient, true), "sent");
  assert.equal((await request(app).post("/api/auth/verify-notification-email").send({ token: links.get("Verify your MedReach notification address") })).status, 200);
  const patientAuth = { Authorization: `Bearer ${await signSessionToken(patient)}` };
  const providerAuth = { Authorization: `Bearer ${await signSessionToken(await User.findById(provider._id).select("+authVersion"))}` };
  for (const kind of ["hospital", "blood_bank", "ambulance"]) {
    const id = kind === "hospital" ? h._id : kind === "blood_bank" ? bank._id : ambulance._id;
    assert.deepEqual((await notificationRecipients(kind, id, false)).map((r) => r.channel), ["provider"]);
    // Both roles use the same controlled inbox; a single emergency copy is intentional.
    assert.deepEqual((await notificationRecipients(kind, id, true)).map((r) => r.channel), ["system"]);
  }
  for (const emergency of [true, false]) {
    const bed = await request(app).post(`/api/emergency-requests/${emergency ? "emergency" : "standard"}`).set(patientAuth).send({ hospitalId: h._id, emergencyType: "General", requiredFacility: "ICU", contactPhone: "+919876543210", contactEmail: recipient, ambulanceRequired: true });
    assert.equal(bed.status, 201);
    const intent = await RequestNotification.findOne({ source: bed.body.request._id }); assert.equal(intent.channel, emergency ? "system" : "provider"); assert.equal(intent.status, "sent");
    if (!emergency) {
      const update = await request(app).patch(`/api/emergency-requests/${bed.body.request._id}`).set(providerAuth).send({ status: "UNDER_REVIEW", expectedStatus: bed.body.request.status, expectedTimelineLength: bed.body.request.timeline.length, note: "Local SMTP check" }); assert.equal(update.status, 200);
    }
    const blood = await request(app).post("/api/blood-requests").set(patientAuth).send({ type: "REQUEST", providerId: bank._id, bloodBankName: bank.name, urgency: emergency ? "within 6 hours" : "3 days", bloodGroup: "O+", patientOrDonorName: "Local test patient", contactPhone: "+919876543210", contactEmail: recipient, isUrgent: emergency }); assert.equal(blood.status, 201);
    const bloodIntent = await RequestNotification.findOne({ sourceType: "BloodRequest" }).sort({ createdAt: -1 }); assert.equal(bloodIntent.channel, emergency ? "system" : "provider"); assert.equal(bloodIntent.status, "sent");
    const booking = await request(app).post("/api/ambulances/book").set(patientAuth).send({ providerId: ambulance._id, patientName: "Local test patient", patientAge: 30, ambulanceRequired: true, bookingPickup: "Local test address", contactPhone: "+919876543210", contactEmail: recipient, isEmergency: emergency }); assert.equal(booking.status, 201);
    const bookingIntent = await RequestNotification.findOne({ sourceType: "AmbulanceBooking" }).sort({ createdAt: -1 }); assert.equal(bookingIntent.channel, emergency ? "system" : "provider"); assert.equal(bookingIntent.status, "sent");
  }
  assert.equal(await EmailDelivery.countDocuments({ status: { $ne: "sent" } }), 0);
  assert.equal(await EmailDelivery.countDocuments({ recipient: { $ne: recipient } }), 0);
  console.log(JSON.stringify({ result: "passed", smtpAccepted: sent, inboxReadVerified: false, checks: ["activation", "provider password recovery", "notification contact verification", "emergency and ordinary bed/blood/ambulance routing", "user confirmations and bed status update", "shared inbox deduplication"], applicationDatabaseModified: false }));
} finally {
  links.clear(); transport?.close(); setEmailTransportFactoryForTests();
  await mongoose.connection.dropDatabase(); await mongoose.disconnect();
}
