import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { Job } from "../src/models/Job.js";
import { signSessionToken } from "./helpers/session.js";
import { env } from "../src/config/env.js";
import { sendEmailEvent, setEmailTransportFactoryForTests } from "../src/services/emailService.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { RequestNotification } from "../src/models/RequestNotification.js";

const uri = process.env.MEDREACH_PERFORMANCE_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_performance_test$/.test(uri));
test("directory performance preserves response contracts and private data boundaries", { skip: !isolated }, async t => {
  await mongoose.connect(uri, { monitorCommands: true });
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const app = createApp();
  const system = await User.create({ name: "Performance fixture", email: "system@performance.test", role: "system_admin" });
  const auth = { Authorization: `Bearer ${await signSessionToken(system)}` };
  const hospital = await Hospital.create({ name: "Performance hospital", verificationStatus: "verified" });
  const resource = await ResourceProvider.create({ name: "Performance blood bank", kind: "blood_bank", sourceName: "Isolated fixture", verificationStatus: "verified" });
  for (let i = 0; i < 6; i++) {
    const user = await User.create({ name: `Provider ${i}`, email: `provider-${i}@performance.test`, role: "provider_admin" });
    await ProviderMembership.create({ user: user._id, kind: i % 2 ? "blood_bank" : "hospital",
      organization: i % 2 ? resource._id : hospital._id, assignedBy: system._id, active: i !== 5 });
  }
  await Job.create({ title: "Test clinical role", hospital: hospital._id, organizationName: hospital.name,
    description: "Isolated job description. ".repeat(120), category: "Nurse", employmentType: "full_time",
    status: "published", createdBy: system._id });

  await t.test("provider accounts batch organisation reads without exposing password hashes or losing inactive assignments", async () => {
    const reads = [];
    const client = mongoose.connection.getClient();
    const listen = event => { if (event.commandName === "find") reads.push(event.command.find); };
    client.on("commandStarted", listen);
    const response = await request(app).get("/api/admin/provider-accounts").set(auth);
    client.off("commandStarted", listen);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 6);
    assert.ok(reads.filter(name => ["providermemberships", "hospitals", "resourceproviders"].includes(name)).length <= 3, JSON.stringify(reads));
    assert.equal(response.body.data.flatMap(row => row.organizations).filter(org => !org.active).length, 1);
    assert.ok(response.body.data.every(row => !("passwordHash" in row) && row.organizations[0].name.startsWith("Performance")));
    assert.match(response.headers["cache-control"], /no-store/);
  });
  await t.test("homepage job summaries omit full descriptions and retain the normal Careers contract", async () => {
    const full = await request(app).get("/api/jobs");
    const summary = await request(app).get("/api/jobs?view=summary");
    assert.equal(full.status, 200); assert.equal(summary.status, 200);
    assert.equal(summary.body.data[0].title, full.body.data[0].title);
    assert.equal(summary.body.data[0]._id, full.body.data[0]._id);
    assert.ok(full.body.data[0].description.length > 1000);
    assert.equal(summary.body.data[0].description, undefined);
    assert.ok(summary.text.length < full.text.length / 3);
  });
  await t.test("public directories compress and revalidate; authenticated responses remain uncacheable", async () => {
    const response = await request(app).get("/api/jobs").set("Accept-Encoding", "gzip");
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-encoding"], "gzip");
    assert.equal(response.body.data.length, 1);
    assert.equal(response.headers["cache-control"], "public, no-cache");
    assert.ok(response.headers.vary.includes("Accept-Encoding"));
    const unchanged = await request(app).get("/api/jobs").set("If-None-Match", response.headers.etag);
    assert.equal(unchanged.status, 304);
    const privateResponse = await request(app).get("/api/jobs").set(auth).set("Accept-Encoding", "gzip");
    assert.match(privateResponse.headers["cache-control"], /no-store/);
    assert.equal(privateResponse.headers["content-encoding"], undefined);
  });
  await t.test("durable queued notifications return before transport, survive worker restart and deduplicate sends", async () => {
    const { startEmailDeliveryWorker, stopEmailDeliveryWorker, flushQueuedEmails } = await import("../src/services/emailDeliveryWorker.js");
    const previous = { emailEnabled: env.emailEnabled, emailProvider: env.emailProvider, smtpHost: env.smtpHost, smtpFrom: env.smtpFrom };
    Object.assign(env, { emailEnabled: true, emailProvider: "smtp", smtpHost: "127.0.0.1", smtpFrom: "sender@performance.test" });
    let calls = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    setEmailTransportFactoryForTests(() => ({ sendMail: async () => { calls++; await gate; } }));
    try {
      startEmailDeliveryWorker({ intervalMs: 60000 });
      const event = { eventKey: "performance-queued", to: "fixture@performance.test", template: "welcome", data: { name: "Unique private fixture name" } };
      const pending = await sendEmailEvent(event);
      assert.equal(pending.status, "pending");
      assert.equal(calls, 0, "HTTP workflows must await persistence, not transport");
      await stopEmailDeliveryWorker();
      const stored = await EmailDelivery.findById(pending._id).select("+retryEnvelope").lean();
      assert.equal(stored.queued, true);
      assert.ok(stored.retryEnvelope && !JSON.stringify(stored).includes(event.data.name));
      startEmailDeliveryWorker({ intervalMs: 60000 });
      const processing = flushQueuedEmails();
      while (!calls) await new Promise(resolve => setImmediate(resolve));
      const duplicate = await sendEmailEvent(event);
      assert.equal(String(duplicate._id), String(pending._id));
      release(); await processing;
      assert.equal((await EmailDelivery.findById(pending._id)).status, "sent");
      await flushQueuedEmails();
      assert.equal(calls, 1);
      // Definitive pre-send failures retry after backoff; ambiguous acceptance
      // never causes an automatic second send.
      let fail = true;
      setEmailTransportFactoryForTests(() => ({ sendMail: async () => {
        calls++;
        if (fail) throw Object.assign(new Error("Controlled transport outage"), { code: "ECONNECTION" });
      } }));
      const retryable = await sendEmailEvent({ ...event, eventKey: "performance-retry" });
      await flushQueuedEmails();
      assert.equal((await EmailDelivery.findById(retryable._id)).status, "failed");
      const afterFailure = calls;
      await flushQueuedEmails(); assert.equal(calls, afterFailure);
      await EmailDelivery.updateOne({ _id: retryable._id }, { $set: { lastAttemptAt: new Date(Date.now() - 31000) } });
      fail = false; await flushQueuedEmails();
      assert.equal((await EmailDelivery.findById(retryable._id)).status, "sent");
      assert.equal(calls, afterFailure + 1);
      setEmailTransportFactoryForTests(() => ({ sendMail: async () => {
        calls++; throw Object.assign(new Error("Controlled ambiguous outcome"), { code: "ETIMEDOUT", command: "DATA" });
      } }));
      const uncertain = await sendEmailEvent({ ...event, eventKey: "performance-uncertain" });
      await flushQueuedEmails();
      assert.equal((await EmailDelivery.findById(uncertain._id)).status, "uncertain");
      const afterAmbiguous = calls;
      await flushQueuedEmails(); assert.equal(calls, afterAmbiguous);
      // A token-bearing email keeps the existing inline, non-replayable path.
      setEmailTransportFactoryForTests(() => ({ sendMail: async () => { calls++; } }));
      const sensitive = await sendEmailEvent({ eventKey: "performance-recovery", to: event.to,
        template: "password_reset", data: { url: "https://example.test/reset?token=isolated-secret" } });
      assert.equal(sensitive.status, "sent");
      const sensitiveRow = await EmailDelivery.findById(sensitive._id).select("+retryEnvelope").lean();
      assert.equal(sensitiveRow.queued, undefined);
      assert.equal(sensitiveRow.retryEnvelope, undefined);
      assert.ok(!JSON.stringify(sensitiveRow).includes("isolated-secret"));
    } finally {
      release(); await stopEmailDeliveryWorker(); Object.assign(env, previous);
      setEmailTransportFactoryForTests();
    }
  });
  await t.test("real queued request routes preserve tracking, recipient policy and delivery reconciliation", async () => {
    const { startEmailDeliveryWorker, stopEmailDeliveryWorker, flushQueuedEmails } = await import("../src/services/emailDeliveryWorker.js");
    const previous = { emailEnabled: env.emailEnabled, emailProvider: env.emailProvider, smtpHost: env.smtpHost, smtpFrom: env.smtpFrom };
    Object.assign(env, { emailEnabled: true, emailProvider: "smtp", smtpHost: "127.0.0.1", smtpFrom: "sender@performance.test" });
    const sent = [];
    setEmailTransportFactoryForTests(() => ({ sendMail: async mail => { sent.push(mail.to); } }));
    const staff = await User.findOne({ role: "provider_admin" });
    await User.updateOne({ _id: staff._id }, { $set: { notificationsEnabled: true, notificationEmail: "provider@performance.test", notificationEmailVerifiedAt: new Date() } });
    await User.updateOne({ _id: system._id }, { $set: { notificationsEnabled: true, notificationEmail: "system@performance.test", notificationEmailVerifiedAt: new Date() } });
    const ambulance = await ResourceProvider.create({ kind: "ambulance", name: "Queued ambulance", sourceName: "Isolated fixture" });
    for (const [kind, org] of [["hospital", hospital], ["blood_bank", resource], ["ambulance", ambulance]]) {
      await ProviderMembership.updateOne({ user: staff._id, kind, organization: org._id },
        { $set: { active: true, assignedBy: system._id } }, { upsert: true });
    }
    try {
      startEmailDeliveryWorker({ intervalMs: 60000 });
      for (const kind of ["standard", "emergency", "blood", "urgent", "ambulance", "emergency-ambulance"]) {
        const patient = await User.create({ name: "Queued patient", email: `${kind}@performance.test` });
        const contact = { contactEmail: patient.email, contactPhone: "+91 9876543210" };
        const bed = ["standard", "emergency"].includes(kind);
        const blood = ["blood", "urgent"].includes(kind);
        const emergency = ["emergency", "urgent", "emergency-ambulance"].includes(kind);
        const [path, body] = bed
          ? [`/api/emergency-requests/${kind}`, { ...contact, hospitalId: hospital.id, requiredFacility: "ICU", emergencyType: "General care" }]
          : blood ? [`/api/blood-requests/${kind === "urgent" ? "urgent" : "standard"}`, { ...contact, type: "REQUEST", providerId: resource.id,
            bloodBankName: resource.name, bloodGroup: "O+", patientOrDonorName: patient.name, units: 1, urgency: emergency ? "within 6 hours" : "3 days" }]
          : ["/api/ambulances/book", { ...contact, providerId: ambulance.id, patientName: patient.name, patientAge: 35,
            ambulanceRequired: true, isEmergency: emergency, bookingPickup: "Isolated test address" }];
        sent.length = 0;
        const headers = { Authorization: `Bearer ${await signSessionToken(patient)}`, "Idempotency-Key": `queued-http-${kind}` };
        const response = await request(app).post(path).set(headers).send(body);
        assert.equal(response.status, 201, `${kind}: ${JSON.stringify(response.body)}`);
        assert.equal(sent.length, 0, "Request must complete before any transport attempt");
        const reference = bed ? response.body.request.requestId : blood ? response.body.bloodRequest.reference : response.body.reference;
        assert.ok(reference);
        assert.equal((await request(app).get(`/api/tracking/${bed ? "bed" : blood ? "blood" : "ambulance"}/${reference}`)).status, 200);
        // Revoke a recipient after queuing to exercise dispatch-time scope checks.
        const revoked = kind === "emergency-ambulance";
        if (revoked) await ProviderMembership.updateOne({ user: staff._id, kind: "ambulance", organization: ambulance._id }, { $set: { active: false } });
        for (let i = 0; i < 4 && await EmailDelivery.exists({ queued: true, status: "pending" }); i++) await flushQueuedEmails();
        assert.ok(sent.includes(patient.email));
        assert.equal(sent.includes("provider@performance.test"), !revoked, kind);
        assert.equal(sent.includes("system@performance.test"), emergency, kind);
        assert.equal(new Set(sent).size, sent.length);
        if (!revoked) assert.equal(await RequestNotification.countDocuments({ status: "pending" }), 0);
        const replay = await request(app).post(path).set(headers).send(body);
        assert.equal(replay.status, 200);
        const before = sent.length; await flushQueuedEmails(); assert.equal(sent.length, before);
      }
    } finally {
      await stopEmailDeliveryWorker(); Object.assign(env, previous); setEmailTransportFactoryForTests();
    }
  });
});
