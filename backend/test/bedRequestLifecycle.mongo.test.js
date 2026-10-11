import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { expireEmergencyRequests } from "../src/services/emergencyRequestExpiry.js";
import { signSessionToken } from "./helpers/session.js";
import { setEmailTransportFactoryForTests } from "../src/services/emailService.js";

const uri = process.env.MEDREACH_PRODUCT_TEST_MONGO_URI;
test("bed request lifecycle: real database, staff, patient, guest, history and failure handling", {
  skip: !uri || !/\/medreach_product_integration(?:\?|$)/.test(uri), timeout: 60000,
}, async (t) => {
  await connectDB(uri);
  await mongoose.connection.dropDatabase();
  const app = createApp();
  const patient = await User.create({ name: "Lifecycle patient", email: "patient@lifecycle.test", role: "user" });
  const staff = await User.create({ name: "Lifecycle staff", email: "staff@lifecycle.test", role: "hospital_admin", notificationsEnabled: true, notificationEmail: "staff@lifecycle.test", notificationEmailVerifiedAt: new Date() });
  const outsider = await User.create({ name: "Unassigned staff", email: "outsider@lifecycle.test", role: "hospital_admin" });
  const hospital = await Hospital.create({ name: "Lifecycle Hospital", city: "Mumbai", admins: [staff._id], phone: "+91 22 4000 1000" });
  const tokens = { patient: await signSessionToken(patient), staff: await signSessionToken(staff), outsider: await signSessionToken(outsider) };
  const payload = { hospitalId: hospital.id, emergencyType: "General care", requiredFacility: "ICU", contactPhone: "+91 98765 40101" };
  const update = (id, token, data, trackingToken) => {
    const call = request(app).patch(`/api/emergency-requests/${id}`);
    if (token) call.set("Authorization", `Bearer ${token}`);
    if (trackingToken) call.set("X-MedReach-Tracking-Token", trackingToken);
    return call.send(data);
  };
  const create = async (guest = false, extra = {}) => {
    const call = request(app).post(`/api/emergency-requests/${guest ? "emergency" : "standard"}`);
    if (!guest) call.set("Authorization", `Bearer ${tokens.patient}`);
    const result = await call.send({ ...payload, ...extra });
    assert.equal(result.status, 201);
    return result.body;
  };
  try {
    await t.test("standard submission routes to assigned staff and exposes only patient delivery metadata", async () => {
      const result = await create();
      assert.equal(result.request.isEmergency, false);
      assert.equal(result.request.status, "SENT");
      assert.deepEqual(result.request.timeline.map((s) => s.status), ["REQUESTED", "SENT"]);
      assert.equal(await mongoose.connection.collection("notifications").countDocuments(), 0);
      assert.ok(await EmailDelivery.findOne({ eventKey: `request-routing:EmergencyRequest:${result.request._id}:${staff.id}` }));
      const view = await request(app).get(`/api/emergency-requests/${result.request._id}`).set("Authorization", `Bearer ${tokens.patient}`);
      assert.equal(view.status, 200);
      assert.equal(view.body.request.hospital.phone, hospital.phone);
      assert.equal(view.body.request.hospital.admins, undefined);
      assert.equal(view.body.permissions.canRespond, false);
      assert.equal(view.body.emailHistory.available, true);
      assert.ok(view.body.emailHistory.items.some((item) => item.status === "disabled" && item.title === "Hospital bed request submitted"));
      assert.ok(view.body.emailHistory.items.every((item) => !item.recipient && !item.eventKey && !item.retryEnvelope && !item.lastError));
      const denied = await request(app).get(`/api/emergency-requests/${result.request._id}`).set("Authorization", `Bearer ${tokens.outsider}`);
      assert.equal(denied.status, 403);
    });
    await t.test("staff review, information request, patient reply, accept and complete preserve messages and audit events", async () => {
      const { request: record } = await create();
      assert.equal((await update(record._id, tokens.staff, { status: "UNDER_REVIEW", hospitalResponse: "Triage review started" })).status, 200);
      assert.equal((await update(record._id, tokens.staff, { status: "INFORMATION_REQUESTED" })).status, 400);
      const info = await update(record._id, tokens.staff, { status: "INFORMATION_REQUESTED", hospitalResponse: "Please describe mobility needs" });
      assert.equal(info.status, 200);
      assert.equal((await update(record._id, tokens.patient, { status: "ACCEPTED" })).status, 403);
      assert.equal((await update(record._id, tokens.outsider, { status: "REJECTED" })).status, 403);
      assert.equal((await update(record._id, tokens.patient, { status: "UNDER_REVIEW" })).status, 400);
      assert.equal((await update(record._id, tokens.patient, { status: "UNDER_REVIEW", note: "Needs wheelchair", hospitalResponse: "Forged" })).status, 403);
      const reply = await update(record._id, tokens.patient, { status: "UNDER_REVIEW", expectedStatus: "INFORMATION_REQUESTED", note: "Needs wheelchair" });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.request.timeline.at(-1).actorRole, "patient");
      assert.equal((await EmailDelivery.findOne({ eventKey: `mail:emergency:${record._id}:5:hospital:${staff.id}` })).template, "bed_request_staff_updated");
      assert.equal((await update(record._id, tokens.staff, { status: "ACCEPTED", expectedStatus: "UNDER_REVIEW", expectedTimelineLength: 3 })).status, 409);
      const accepted = await update(record._id, tokens.staff, { status: "ACCEPTED", hospitalResponse: "Please call reception for next steps" });
      assert.equal(accepted.status, 200);
      const completed = await update(record._id, tokens.staff, { status: "COMPLETED", hospitalResponse: "Coordination completed" });
      assert.equal(completed.status, 200);
      assert.deepEqual(completed.body.request.timeline.map((s) => s.status), ["REQUESTED", "SENT", "UNDER_REVIEW", "INFORMATION_REQUESTED", "UNDER_REVIEW", "ACCEPTED", "COMPLETED"]);
      assert.equal(completed.body.request.timeline[3].hospitalResponse, "Please describe mobility needs");
      assert.equal(completed.body.request.timeline[4].note, "Needs wheelchair");
      assert.equal(await AuditLog.countDocuments({ entityId: record._id, action: "update" }), 5);
      assert.equal((await update(record._id, tokens.patient, { status: "CANCELLED" })).status, 409);
    });
    await t.test("guest can privately reply and cancel; missing/wrong tokens cannot retrieve or update", async () => {
      const { request: record, trackingToken } = await create(true, { contactEmail: "guest@lifecycle.test" });
      await update(record._id, tokens.staff, { status: "UNDER_REVIEW" });
      await update(record._id, tokens.staff, { status: "INFORMATION_REQUESTED", hospitalResponse: "Please provide contact availability" });
      assert.equal((await update(record._id, null, { status: "UNDER_REVIEW", note: "Available now" })).status, 403);
      assert.equal((await update(record._id, null, { status: "UNDER_REVIEW", note: "Available now" }, "wrong-token")).status, 403);
      assert.equal((await update(record._id, null, { status: "ACCEPTED" }, trackingToken)).status, 403);
      assert.equal((await update(record._id, null, { status: "UNDER_REVIEW", note: "Available now" }, trackingToken)).status, 200);
      const view = await request(app).get(`/api/emergency-requests/${record._id}`).set("X-MedReach-Tracking-Token", trackingToken);
      assert.equal(view.status, 200);
      assert.ok(view.body.emailHistory.items.some((item) => item.channel === "email" && item.status === "disabled"));
      assert.ok(view.body.emailHistory.items.every((item) => item.channel === "email"));
      assert.equal((await request(app).get(`/api/emergency-requests/${record._id}`)).status, 403);
      assert.equal((await update(record._id, null, { status: "CANCELLED" }, trackingToken)).status, 200);
    });
    await t.test("lost transition responses are replayable; competing staff responses cannot overwrite history", async () => {
      const { request: record } = await create();
      const review = { status: "UNDER_REVIEW", expectedStatus: "SENT", hospitalResponse: "Review started" };
      assert.equal((await update(record._id, tokens.staff, review)).status, 200);
      const count = await EmailDelivery.countDocuments();
      assert.equal((await update(record._id, tokens.staff, review)).status, 200);
      assert.equal(await EmailDelivery.countDocuments(), count);
      assert.equal((await EmergencyRequest.findById(record._id)).timeline.length, 3);
      const responses = await Promise.all([
        update(record._id, tokens.staff, { status: "ACCEPTED", expectedStatus: "UNDER_REVIEW", hospitalResponse: "Accepted" }),
        update(record._id, tokens.staff, { status: "REJECTED", expectedStatus: "UNDER_REVIEW", hospitalResponse: "Declined" }),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await EmergencyRequest.findById(record._id)).timeline.length, 4);
    });
    await t.test("expiry closes guests with and without email and signed-in patients exactly once", async () => {
      const records = await Promise.all([create(true), create(true, { contactEmail: "expiry@lifecycle.test" }), create()]);
      for (const item of records) await EmergencyRequest.updateOne({ _id: item.request._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      assert.equal((await expireEmergencyRequests()).expired, 3);
      assert.equal((await expireEmergencyRequests()).expired, 0);
      for (const item of records) {
        const saved = await EmergencyRequest.findById(item.request._id);
        assert.equal(saved.status, "EXPIRED");
        assert.equal(saved.timeline.filter((step) => step.status === "EXPIRED").length, 1);
        assert.equal((await update(saved.id, tokens.staff, { status: "UNDER_REVIEW" })).status, 409);
      }
      assert.ok(await EmailDelivery.findOne({ recipient: "expiry@lifecycle.test", eventKey: `mail:emergency:${records[1].request._id}:3` }));
      assert.ok(await EmailDelivery.findOne({ recipient: patient.email, eventKey: `mail:emergency:${records[2].request._id}:3` }));
    });
    await t.test("email and audit failures preserve a saved guest response and failed delivery for retry", async () => {
      const { request: record } = await create(true, { contactEmail: "failure@lifecycle.test" });
      const previous = { emailEnabled: env.emailEnabled, smtpHost: env.smtpHost, smtpFrom: env.smtpFrom };
      const auditCreate = AuditLog.create;
      try {
        Object.assign(env, { emailEnabled: true, smtpHost: "smtp.invalid.test", smtpFrom: "medreach@example.test" });
        setEmailTransportFactoryForTests(() => ({ sendMail: async () => { throw Object.assign(new Error("simulated transport failure"), { code: "ECONNECTION" }); } }));
        AuditLog.create = async () => { throw new Error("simulated audit failure"); };
        const result = await update(record._id, tokens.staff, { status: "UNDER_REVIEW", hospitalResponse: "Review recorded despite delivery failure" });
        assert.equal(result.status, 200);
        assert.equal((await EmergencyRequest.findById(record._id)).status, "UNDER_REVIEW");
        const delivery = await EmailDelivery.findOne({ eventKey: `mail:emergency:${record._id}:3` });
        assert.equal(delivery.status, "failed");
        assert.equal(delivery.retryable, true);
      } finally { AuditLog.create = auditCreate; Object.assign(env, previous); setEmailTransportFactoryForTests(); }
    });
    await t.test("email delivery history failure does not hide the primary request; malformed updates are rejected", async () => {
      const { request: record } = await create();
      const find = EmailDelivery.find;
      try {
        EmailDelivery.find = () => { throw new Error("history unavailable"); };
        const view = await request(app).get(`/api/emergency-requests/${record._id}`).set("Authorization", `Bearer ${tokens.patient}`);
        assert.equal(view.status, 200);
        assert.equal(view.body.request._id, record._id);
        assert.equal(view.body.emailHistory.available, false);
      } finally { EmailDelivery.find = find; }
      assert.equal((await update(record._id, tokens.staff, { status: "FAKE" })).status, 400);
      assert.equal((await update(record._id, tokens.staff, { status: "UNDER_REVIEW", note: {} })).status, 400);
      assert.equal((await update(record._id, tokens.staff, { status: "UNDER_REVIEW", hospitalResponse: "x".repeat(501) })).status, 400);
    });
  } finally { await mongoose.connection.dropDatabase(); await disconnectDB(); }
});
