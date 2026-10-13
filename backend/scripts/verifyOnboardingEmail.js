// Explicit local-only SMTP integration check; never reads or changes real accounts.
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import request from "supertest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { ProviderApplication } from "../src/models/ProviderApplication.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { setEmailTransportFactoryForTests, emailConfiguration } from "../src/services/emailService.js";
import { env } from "../src/config/env.js";
import { signSessionToken } from "../test/helpers/session.js";
const approved = "medreachforyou@gmail.com";
const uri = process.env.MEDREACH_ONBOARDING_EMAIL_TEST_URI;
if (!process.argv.includes("--send-approved-tests") || env.nodeEnv === "production" || !/^mongodb:\/\/127\.0\.0\.1:27017\/medreach_local_onboarding_email_test_[0-9]+$/.test(uri || "")) throw new Error("Explicit isolated local SMTP test required");
if (!env.emailEnabled || !emailConfiguration().configured) throw new Error("Existing SMTP configuration is unavailable; no settings changed");
let owned = false;
try {
  await mongoose.connect(uri, { autoCreate: false, autoIndex: false });
  if ((await mongoose.connection.db.listCollections().toArray()).length) throw new Error("Test namespace already exists; refusing to modify it");
  owned = true;
  // Create test indexes only after establishing ownership of an empty namespace.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).createIndexes()));
  const accepted = [];
  setEmailTransportFactoryForTests((options) => {
    const transport = nodemailer.createTransport(options);
    return { sendMail: async (message) => {
      if (message.to !== approved) throw Object.assign(new Error("Unapproved test recipient blocked"), { code: "RECIPIENT_BLOCKED" });
      const result = await transport.sendMail(message);
      if (!result.accepted?.includes(approved)) throw Object.assign(new Error("SMTP acceptance not confirmed"), { code: "SMTP_NOT_ACCEPTED" });
      accepted.push(message.subject); return result;
    } };
  });
  const app = createApp();
  const system = await User.create({ name: "Controlled SMTP System", email: "system@onboarding.example", role: "system_admin", notificationsEnabled: true, notificationEmail: approved, notificationEmailVerifiedAt: new Date() });
  const submit = await request(app).post("/api/providers/applications").send({ kind: "diagnostic", name: "Isolated onboarding SMTP centre", address: "Test street", city: "Mumbai", contactName: "Controlled Contact", contactEmail: approved, phone: "+919876543210" });
  if (submit.status !== 202) throw new Error("Submission failed");
  const application = await ProviderApplication.findOne();
  const review = await request(app).post(`/api/admin/provider-approvals/${application._id}/review`).set("Authorization", `Bearer ${await signSessionToken(system)}`).send({ decision: "approve" });
  if (review.status !== 200) throw new Error("Approval failed");
  const sentBefore = accepted.length;
  await request(app).post(`/api/admin/provider-approvals/${application._id}/review`).set("Authorization", `Bearer ${await signSessionToken(system)}`).send({ decision: "approve" });
  if (accepted.length !== sentBefore) throw new Error("Approval replay duplicated mail");
  const deliveries = await EmailDelivery.find().select("template status").lean();
  console.log(JSON.stringify({ approvedInbox: approved, smtpAccepted: accepted.length, inboxDeliveryVerified: false, approvalReplayDuplicatedMail: false, deliveries: deliveries.map(({ template, status }) => ({ template, status })) }, null, 2));
  if (accepted.length !== 4 || deliveries.some((d) => d.status !== "sent")) throw new Error("Not all expected messages were SMTP-accepted");
} catch { console.error("Local onboarding email verification incomplete. No SMTP settings were changed."); process.exitCode = 1; }
finally { setEmailTransportFactoryForTests(); if (owned) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
