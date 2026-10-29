import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { DiagnosticRequest } from "../src/models/DiagnosticRequest.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { User } from "../src/models/User.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { RequestNotification } from "../src/models/RequestNotification.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { ResourceInventory } from "../src/models/ResourceInventory.js";
import { signSessionToken } from "./helpers/session.js";
import { indiaDate, validPreferredDate } from "../src/services/diagnosticRequests.js";
import { recoverRequestNotifications } from "../src/services/requestNotificationWorker.js";
import { recoverRequestStatusEffects } from "../src/services/requestStatusEffects.js";
import { setEmailTransportFactoryForTests, retryEmailDelivery } from "../src/services/emailService.js";

const uri = process.env.MEDREACH_DIAGNOSTIC_TEST_MONGO_URI;
test("diagnostic date validation rejects impossible and past dates", () => {
  assert.equal(validPreferredDate("2027-02-30"), false);
  assert.equal(validPreferredDate(indiaDate()), false);
  assert.equal(validPreferredDate({ $gt: "" }), false);
  assert.equal(validPreferredDate(indiaDate(new Date(Date.now() + 86400000))), true);
  assert.equal(validPreferredDate(indiaDate(new Date(Date.now() + 200 * 86400000))), false);
});

test("diagnostic request workflow with isolated MongoDB", { skip: !uri }, async t => {
  const target = new URL(uri);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
  assert.equal(target.protocol, "mongodb:");
  assert.equal(target.pathname, "/medreach_diagnostic_requests_test");
  let app;
  let centre, otherCentre, patient, admin, secondAdmin, outsider, system, userToken, adminToken, secondToken, outsiderToken, systemToken;
  const originalEmail = { emailEnabled: env.emailEnabled, emailProvider: env.emailProvider, smtpHost: env.smtpHost, smtpFrom: env.smtpFrom };
  const body = () => ({ providerId: String(centre._id), tests: ["CBC", "LIPID_PROFILE"], patientName: "Test Patient",
    contactPhone: "+91 9876543210", preferredDate: indiaDate(new Date(Date.now() + 2 * 86400000)), preferredTime: "MORNING", notes: "Please confirm preparation instructions.", consent: true });
  const submit = (payload = body(), key, token) => {
    const req = request(app).post("/api/diagnostics/requests").send(payload);
    if (key) req.set("Idempotency-Key", key);
    if (token) req.set("Authorization", `Bearer ${token}`);
    return req;
  };
  const update = (row, changes, token = adminToken) => request(app).patch(`/api/diagnostics/requests/${row._id}/status`).set("Authorization", `Bearer ${token}`).send({ expectedVersion: row.version, ...changes });
  t.before(async () => {
    await connectDB(uri); await mongoose.connection.dropDatabase();
    env.emailEnabled = false;
    [centre, otherCentre] = await ResourceProvider.create([
      { kind: "diagnostic", name: "Diagnostic Test Centre", sourceName: "Synthetic test fixture", approvalStatus: "approved", active: true },
      { kind: "diagnostic", name: "Other Diagnostic Centre", sourceName: "Synthetic test fixture", approvalStatus: "approved", active: true },
    ]);
    [patient, admin, secondAdmin, outsider, system] = await User.create([
      { name: "Diagnostic Patient", email: "patient@example.test", role: "user" },
      { name: "Diagnostic Admin", email: "centre-admin@example.test", role: "provider_admin", notificationsEnabled: true, notificationEmail: "centre-notices@example.test", notificationEmailVerifiedAt: new Date() },
      { name: "Second Admin", email: "second-admin@example.test", role: "provider_admin" },
      { name: "Other Admin", email: "other-admin@example.test", role: "provider_admin" },
      { name: "System Admin", email: "system@example.test", role: "system_admin" },
    ]);
    await ProviderMembership.create([
      { user: admin._id, organization: centre._id, kind: "diagnostic", active: true, assignedBy: system._id },
      { user: secondAdmin._id, organization: centre._id, kind: "diagnostic", active: true, assignedBy: system._id },
      { user: outsider._id, organization: otherCentre._id, kind: "diagnostic", active: true, assignedBy: system._id },
    ]);
    [userToken, adminToken, secondToken, outsiderToken, systemToken] = await Promise.all([patient, admin, secondAdmin, outsider, system].map(signSessionToken));
    await Promise.all([DiagnosticRequest, RequestNotification, EmailDelivery].map(Model => Model.createIndexes()));
  });
  // Each scenario represents a separate client window; keep the real limiter enabled.
  t.beforeEach(() => { app = createApp(); });
  t.after(async () => {
    setEmailTransportFactoryForTests(); Object.assign(env, originalEmail);
    await mongoose.connection.dropDatabase(); await disconnectDB();
  });

  await t.test("approved centre accepts multiple tests without claiming an appointment or consuming inventory", async () => {
    const result = await submit().expect(201);
    assert.equal(result.body.request.status, "REQUESTED");
    assert.deepEqual(result.body.request.tests, ["CBC", "LIPID_PROFILE"]);
    assert.equal(result.body.request.appointmentAt, undefined);
    assert.equal(result.body.request.trackingTokenHash, undefined);
    assert.equal(result.body.request.payloadHash, undefined);
    assert.equal(result.body.request.statusEffects, undefined);
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(await ResourceInventory.countDocuments(), 0);
    const intent = await RequestNotification.findOne({ source: result.body.request._id });
    assert.equal(intent.sourceType, "DiagnosticRequest");
    assert.equal(intent.status, "disabled");
    assert.equal(await AuditLog.countDocuments({ entityType: "DiagnosticRequest", entityId: result.body.request._id }), 1);
  });
  await t.test("input validation and field tampering fail before storage", async () => {
    const count = await DiagnosticRequest.countDocuments();
    for (const invalid of [{ tests: [] }, { tests: ["CBC", "CBC"] }, { tests: ["INVENTED_TEST"] }, { consent: false },
      { preferredDate: "2026-02-30" }, { preferredDate: indiaDate() }, { patientName: { $ne: "" } },
      { contactPhone: "abc" }, { notes: "x".repeat(1001) }, { status: "CONFIRMED" }, { user: String(system._id) }, { centreApprovalPending: false }]) {
      await submit({ ...body(), ...invalid }).expect(400);
    }
    assert.equal(await DiagnosticRequest.countDocuments(), count);
  });
  await t.test("inactive, pending, rejected and archived centres cannot receive requests", async () => {
    for (const changes of [{ approvalStatus: "pending" }, { approvalStatus: "rejected" }, { active: false }, { archivedAt: new Date() }]) {
      await ResourceProvider.updateOne({ _id: otherCentre._id }, { $set: { active: true, archivedAt: null, approvalStatus: "approved", ...changes } });
      await submit({ ...body(), providerId: String(otherCentre._id) }).expect(409);
    }
    await ResourceProvider.updateOne({ _id: otherCentre._id }, { $set: { active: true, archivedAt: null, approvalStatus: "approved" } });
  });
  await t.test("legacy listing accepts a review request without approving the centre or disclosing it to assigned staff", async () => {
    const legacy = await ResourceProvider.create({ name: "Legacy listed diagnostics", kind: "diagnostic", sourceName: "Synthetic test fixture" });
    await ProviderMembership.create({ user: admin._id, organization: legacy._id, kind: "diagnostic", active: true, assignedBy: system._id });
    const { body: saved } = await submit({ ...body(), providerId: legacy.id }).expect(201);
    assert.equal(saved.request.centreApprovalPending, true);
    assert.equal(saved.request.status, "REQUESTED");
    assert.equal(saved.request.notificationRouting, "no_eligible_recipients");
    assert.equal(await RequestNotification.countDocuments({ source: saved.request._id }), 0);
    assert.equal((await ResourceProvider.findById(legacy._id)).approvalStatus, undefined);
    await recoverRequestNotifications();
    assert.equal(await RequestNotification.countDocuments({ source: saved.request._id }), 0);
    const providerList = await request(app).get("/api/diagnostics/requests").set("Authorization", `Bearer ${adminToken}`).expect(200);
    assert.ok(!providerList.body.data.some(row => row.reference === saved.reference));
    await request(app).get(`/api/diagnostics/requests/${saved.reference}`).set("Authorization", `Bearer ${adminToken}`).expect(403);
    await update(saved.request, { status: "UNDER_REVIEW" }).expect(403);
    const followup = await request(app).get("/api/diagnostics/requests?followup=true").set("Authorization", `Bearer ${systemToken}`).expect(200);
    assert.ok(followup.body.data.some(row => row.reference === saved.reference && row.centreApprovalPending));
    const privateView = await request(app).get(`/api/diagnostics/requests/${saved.reference}`).set("X-MedReach-Tracking-Token", saved.trackingToken).expect(200);
    assert.equal(privateView.body.request.centreApprovalPending, true);
    await update(saved.request, { status: "CONFIRMED", acceptedTests: ["CBC"], appointmentAt: new Date(Date.now() + 86400000).toISOString() }, systemToken).expect(409);
    const reviewed = await update(saved.request, { status: "UNDER_REVIEW" }, systemToken).expect(200);
    assert.equal(reviewed.body.data.centreApprovalPending, true);
    await update(reviewed.body.data, { status: "UNDER_REVIEW" }, systemToken).expect(409);
    await ResourceProvider.updateOne({ _id: legacy._id }, { $set: { approvalStatus: "approved" } });
    const handoffs = await Promise.all([update(reviewed.body.data, { status: "UNDER_REVIEW" }, systemToken), update(reviewed.body.data, { status: "UNDER_REVIEW" }, systemToken)]);
    assert.deepEqual(handoffs.map(response => response.status).sort(), [200, 409]);
    const handed = handoffs.find(response => response.status === 200).body.data;
    assert.equal(handed.centreApprovalPending, false);
    assert.equal(handed.notificationRouting, "recorded");
    assert.equal(await RequestNotification.countDocuments({ source: saved.request._id }), 1);
    await recoverRequestNotifications();
    assert.equal(await RequestNotification.countDocuments({ source: saved.request._id }), 1);
    await request(app).get(`/api/diagnostics/requests/${saved.reference}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
    await update(handed, { status: "CONFIRMED", acceptedTests: ["CBC"], appointmentAt: new Date(Date.now() + 86400000).toISOString() }).expect(200);
  });
  await t.test("legacy review requests retain guest cancellation and duplicate protection", async () => {
    const legacy = await ResourceProvider.create({ name: "Legacy request cancellation", kind: "diagnostic", sourceName: "Synthetic test fixture", approvalStatus: null });
    const payload = { ...body(), providerId: legacy.id };
    const first = await submit(payload, "legacy-review-duplicate-001").expect(201);
    const replay = await submit(payload, "legacy-review-duplicate-001").expect(200);
    assert.equal(first.body.reference, replay.body.reference);
    assert.equal(first.body.trackingToken, replay.body.trackingToken);
    assert.equal(first.body.request.centreApprovalPending, true);
    await request(app).patch(`/api/diagnostics/requests/${first.body.reference}/cancel`).set("X-MedReach-Tracking-Token", first.body.trackingToken).send({ expectedVersion: 0 }).expect(200);
    assert.equal(await RequestNotification.countDocuments({ source: first.body.request._id }), 0);
  });
  await t.test("interrupted approved-centre handoff recovers provider notification once", async () => {
    const legacy = await ResourceProvider.create({ name: "Legacy handoff recovery", kind: "diagnostic", sourceName: "Synthetic test fixture" });
    await ProviderMembership.create({ user: admin._id, organization: legacy._id, kind: "diagnostic", active: true, assignedBy: system._id });
    const { body: saved } = await submit({ ...body(), providerId: legacy.id }).expect(201);
    await ResourceProvider.updateOne({ _id: legacy._id }, { $set: { approvalStatus: "approved" } });
    const original = RequestNotification.findOneAndUpdate;
    RequestNotification.findOneAndUpdate = async () => { throw new Error("Synthetic outbox interruption"); };
    try {
      const handoff = await update(saved.request, { status: "UNDER_REVIEW" }, systemToken).expect(200);
      assert.equal(handoff.body.data.centreApprovalPending, false);
      assert.equal(handoff.body.data.notificationRoutedAt, undefined);
    } finally { RequestNotification.findOneAndUpdate = original; }
    await recoverRequestNotifications(); await recoverRequestNotifications();
    assert.equal(await RequestNotification.countDocuments({ source: saved.request._id }), 1);
    assert.ok((await DiagnosticRequest.findById(saved.request._id)).notificationRoutedAt);
  });
  await t.test("simultaneous duplicate submissions create one record and recover the same private link", async () => {
    const count = await DiagnosticRequest.countDocuments();
    const results = await Promise.all([submit(body(), "diagnostic-duplicate-001"), submit(body(), "diagnostic-duplicate-001")]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
    assert.equal(results[0].body.reference, results[1].body.reference);
    assert.equal(results[0].body.trackingToken, results[1].body.trackingToken);
    assert.equal(await DiagnosticRequest.countDocuments(), count + 1);
    await submit({ ...body(), tests: ["THYROID_PROFILE"] }, "diagnostic-duplicate-001").expect(409);
  });
  await t.test("public tracking reveals no patient or appointment details; a private token is required", async () => {
    const { body: saved } = await submit().expect(201);
    const summary = await request(app).get(`/api/tracking/diagnostic/${saved.reference}`).expect(200);
    assert.deepEqual(Object.keys(summary.body.record).sort(), ["reference", "status", "updatedAt"]);
    await request(app).get(`/api/diagnostics/requests/${saved.reference}`).expect(403);
    const detail = await request(app).get(`/api/diagnostics/requests/${saved.reference}`).set("X-MedReach-Tracking-Token", saved.trackingToken).expect(200);
    assert.equal(detail.body.request.requestSnapshot.patientName, "Test Patient");
    assert.equal(detail.body.request.trackingTokenHash, undefined);
  });
  await t.test("owners see their requests and unrelated providers cannot read, list or mutate them", async () => {
    const { body: saved } = await submit(body(), undefined, userToken).expect(201);
    const list = await request(app).get("/api/diagnostics/requests").set("Authorization", `Bearer ${userToken}`).expect(200);
    assert.ok(list.body.data.some(row => row.reference === saved.reference));
    const foreign = await request(app).get("/api/diagnostics/requests").set("Authorization", `Bearer ${outsiderToken}`).expect(200);
    assert.ok(!foreign.body.data.some(row => row.reference === saved.reference));
    await request(app).get(`/api/diagnostics/requests?providerId=${centre._id}`).set("Authorization", `Bearer ${outsiderToken}`).expect(403);
    await request(app).get(`/api/diagnostics/requests/${saved.reference}`).set("Authorization", `Bearer ${outsiderToken}`).expect(403);
    await update(saved.request, { status: "UNDER_REVIEW" }, outsiderToken).expect(403);
    await update(saved.request, { status: "UNDER_REVIEW" }, userToken).expect(403);
    const detail = await request(app).get(`/api/diagnostics/requests/${saved.reference}`).set("Authorization", `Bearer ${userToken}`).expect(200);
    assert.equal(detail.body.request.reference, saved.reference);
  });
  await t.test("two assigned admins racing on one version cannot overwrite each other", async () => {
    const { body: saved } = await submit().expect(201);
    const results = await Promise.all([update(saved.request, { status: "UNDER_REVIEW" }), update(saved.request, { status: "DECLINED" }, secondToken)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const stored = await DiagnosticRequest.findById(saved.request._id);
    assert.equal(stored.version, 1);
    assert.equal(stored.history.length, 2);
    await update(saved.request, { status: "CONFIRMED", acceptedTests: ["CBC"], appointmentAt: new Date(Date.now() + 3 * 86400000).toISOString() }).expect(409);
  });
  await t.test("confirmation requires a future appointment and a subset of requested tests", async () => {
    const { body: saved } = await submit().expect(201);
    await update(saved.request, { status: "CONFIRMED" }).expect(400);
    await update(saved.request, { status: "CONFIRMED", acceptedTests: ["THYROID_PROFILE"], appointmentAt: new Date(Date.now() + 86400000).toISOString() }).expect(400);
    await update(saved.request, { status: "CONFIRMED", acceptedTests: ["CBC"], appointmentAt: new Date(Date.now() - 86400000).toISOString() }).expect(400);
    const confirmed = await update(saved.request, { status: "CONFIRMED", acceptedTests: ["CBC"], appointmentAt: new Date(Date.now() + 3 * 86400000).toISOString(), providerResponse: "Lipid profile is unavailable at this appointment." }).expect(200);
    assert.deepEqual(confirmed.body.data.acceptedTests, ["CBC"]);
    assert.equal(confirmed.body.data.history.at(-1).status, "CONFIRMED");
    const completed = await update(confirmed.body.data, { status: "COMPLETED" }).expect(200);
    await update(completed.body.data, { status: "UNDER_REVIEW" }).expect(409);
  });
  await t.test("guest cancellation uses private credentials and version checks", async () => {
    const { body: saved } = await submit().expect(201);
    const url = `/api/diagnostics/requests/${saved.reference}/cancel`;
    await request(app).patch(url).send({ expectedVersion: 0 }).expect(403);
    await request(app).patch(url).set("X-MedReach-Tracking-Token", saved.trackingToken).send({ expectedVersion: 2 }).expect(409);
    const cancelled = await request(app).patch(url).set("X-MedReach-Tracking-Token", saved.trackingToken).send({ expectedVersion: 0 }).expect(200);
    assert.equal(cancelled.body.data.status, "CANCELLED");
    await update(cancelled.body.data, { status: "CONFIRMED" }).expect(409);
  });
  await t.test("unassigned centres save requests and expose follow-up only to System Admin", async () => {
    const { body: saved } = await submit({ ...body(), providerId: String(otherCentre._id) }).expect(201);
    assert.equal(saved.request.notificationRouting, "no_eligible_recipients");
    const followup = await request(app).get("/api/diagnostics/requests?followup=true").set("Authorization", `Bearer ${systemToken}`).expect(200);
    assert.ok(followup.body.data.some(row => row.reference === saved.reference));
    await request(app).get("/api/diagnostics/requests?followup=true").set("Authorization", `Bearer ${userToken}`).expect(403);
  });
  await t.test("crash after save recovers routing and audit without duplicate effects", async () => {
    const { body: saved } = await submit().expect(201);
    await RequestNotification.deleteMany({ source: saved.request._id });
    await DiagnosticRequest.updateOne({ _id: saved.request._id }, { $unset: { notificationRoutedAt: 1, notificationRouting: 1 } });
    await recoverRequestNotifications(); await recoverRequestNotifications();
    assert.equal(await RequestNotification.countDocuments({ source: saved.request._id }), 1);
    await recoverRequestStatusEffects(); await recoverRequestStatusEffects();
    assert.equal(await AuditLog.countDocuments({ entityType: "DiagnosticRequest", entityId: saved.request._id }), 1);
  });
  await t.test("notification failure is persisted and retries reject a revoked provider", async () => {
    env.emailEnabled = true; env.emailProvider = "smtp"; env.smtpHost = "smtp.example.test"; env.smtpFrom = "sender@example.test";
    setEmailTransportFactoryForTests(() => ({ sendMail: async () => { throw Object.assign(new Error("Synthetic SMTP failure"), { code: "ECONNREFUSED" }); } }));
    const { body: saved } = await submit().expect(201);
    const delivery = await EmailDelivery.findOne({ eventKey: `request-routing:DiagnosticRequest:${saved.request._id}:${admin._id}` });
    assert.equal(delivery.status, "failed");
    await ResourceProvider.updateOne({ _id: centre._id }, { $set: { approvalStatus: "pending" } });
    assert.equal((await retryEmailDelivery({ deliveryId: delivery._id })).code, "RECIPIENT_NO_LONGER_ELIGIBLE");
    await ResourceProvider.updateOne({ _id: centre._id }, { $set: { approvalStatus: "approved" } });
    await ProviderMembership.updateOne({ user: admin._id, organization: centre._id }, { $set: { active: false } });
    const retried = await retryEmailDelivery({ deliveryId: delivery._id });
    assert.equal(retried.code, "RECIPIENT_NO_LONGER_ELIGIBLE");
    await ProviderMembership.updateOne({ user: admin._id, organization: centre._id }, { $set: { active: true } });
    env.emailEnabled = false; setEmailTransportFactoryForTests();
  });
  await t.test("pagination is bounded and rejects injected filters", async () => {
    await request(app).get("/api/diagnostics/requests?limit=101").set("Authorization", `Bearer ${systemToken}`).expect(400);
    await request(app).get("/api/diagnostics/requests?providerId[$ne]=1").set("Authorization", `Bearer ${systemToken}`).expect(400);
    const first = await request(app).get("/api/diagnostics/requests?limit=2").set("Authorization", `Bearer ${systemToken}`).expect(200);
    const second = await request(app).get(`/api/diagnostics/requests?limit=2&before=${first.body.nextCursor}`).set("Authorization", `Bearer ${systemToken}`).expect(200);
    assert.equal(first.body.data.length, 2);
    assert.ok(second.body.data.every(row => !first.body.data.some(previous => previous._id === row._id)));
  });
});
