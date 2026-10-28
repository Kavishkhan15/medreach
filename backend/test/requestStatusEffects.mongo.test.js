import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { BloodRequest } from "../src/models/BloodRequest.js";
import { AmbulanceBooking } from "../src/models/AmbulanceBooking.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { Hospital } from "../src/models/Hospital.js";
import { changeEmergencyRequest } from "../src/services/emergencyRequestService.js";
import { updateProviderRequestStatus } from "../src/services/providerRequestStatus.js";
import { recoverRequestStatusEffects, drainRequestStatusEffects, requestStatusEffect, STATUS_EFFECTS_CAPACITY } from "../src/services/requestStatusEffects.js";
const uri = process.env.MEDREACH_REQUEST_EFFECTS_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/medreach_request_effects_test$/.test(uri));
test("status changes atomically retain bounded recoverable audit and email effects", { skip: !isolated, timeout: 120000 }, async t => {
  await mongoose.connect(uri); assert.equal(mongoose.connection.name, "medreach_request_effects_test");
  await mongoose.connection.dropDatabase();
  const previousEnabled = env.emailEnabled; env.emailEnabled = false;
  await Promise.all([EmergencyRequest, BloodRequest, AmbulanceBooking, AuditLog, EmailDelivery, Hospital].map(Model => Model.init()));
  t.after(async () => { env.emailEnabled = previousEnabled; await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const hospital = await Hospital.create({ name: "Status recovery fixture", approvalStatus: "approved" });
  const actor = { id: new mongoose.Types.ObjectId(), role: "system_admin" };
  const createBed = () => EmergencyRequest.create({ requestId: `MR-${new mongoose.Types.ObjectId()}`, hospital: hospital._id,
    emergencyType: "Emergency", requiredFacility: "ICU", contactPhone: "0000000000", contactEmail: "controlled@fixture.test",
    expiresAt: new Date(Date.now() + 3600000), timeline: [{ status: "REQUESTED", actorRole: "patient" }] });
  const auditUpdate = AuditLog.updateOne;
  await t.test("bed mutation survives audit outage and later changes; recovery preserves each status and original email key", async () => {
    const bed = await createBed();
    AuditLog.updateOne = () => { throw new Error("synthetic audit outage"); };
    try {
      const result = await changeEmergencyRequest({ requestId: bed._id, actor, nextStatus: "UNDER_REVIEW" });
      assert.equal(result.request.status, "UNDER_REVIEW");
      assert.equal(result.request.toJSON().statusEffects, undefined);
      const later = await changeEmergencyRequest({ requestId: bed._id, actor, nextStatus: "ACCEPTED" });
      assert.equal(later.request.status, "ACCEPTED");
    } finally { AuditLog.updateOne = auditUpdate; }
    const pending = await EmergencyRequest.findById(bed._id).select("+statusEffects");
    assert.equal(pending.statusEffects.length, 2);
    assert.equal(await AuditLog.countDocuments({ entityId: bed._id }), 0);
    const now = new Date(Date.now() + 60000);
    await Promise.all(Array.from({ length: 8 }, () => recoverRequestStatusEffects({ now })));
    await recoverRequestStatusEffects({ now });
    assert.equal(await AuditLog.countDocuments({ entityId: bed._id }), 2);
    assert.equal((await EmailDelivery.findOne({ eventKey: `mail:emergency:${bed._id}:2` })).template, "emergency_updated");
    assert.equal((await EmailDelivery.findOne({ eventKey: `mail:emergency:${bed._id}:3` })).template, "emergency_accepted");
    assert.equal((await EmergencyRequest.findById(bed._id).select("+statusEffects")).statusEffects.length, 0);
  });
  for (const kind of ["blood", "ambulance"]) await t.test(`${kind} actual status handler retains atomic intent and recovers once`, async () => {
    const Model = kind === "blood" ? BloodRequest : AmbulanceBooking;
    const common = { reference: `FIXTURE-${new mongoose.Types.ObjectId()}`, provider: new mongoose.Types.ObjectId() };
    const row = await Model.create(kind === "blood" ? { ...common, type: "REQUEST", bloodBankName: "Fixture", bloodGroup: "O+", patientOrDonorName: "Fixture", contactPhone: "0000000000", contactEmail: "controlled@fixture.test" }
      : { ...common, providerSnapshot: { name: "Fixture" }, requestSnapshot: { patientName: "Fixture", patientAge: 30, pickupAddress: "Fixture", contactEmail: "controlled@fixture.test" }, trackingTokenHash: "fixture", delivery: { user: { status: "pending" }, admin: { status: "pending" }, provider: { status: "pending" } } });
    let response;
    const res = { status(code) { this.code = code; return this; }, json(body) { response = body; return this; } };
    AuditLog.updateOne = () => { throw new Error("synthetic audit outage"); };
    try { await updateProviderRequestStatus(kind)({ params: { id: row._id }, body: { status: "CONFIRMED" }, user: actor }, res, error => { throw error; }); }
    finally { AuditLog.updateOne = auditUpdate; }
    assert.equal(response.ok, true); assert.equal(response.data.status, "CONFIRMED");
    assert.equal(response.data.toJSON().statusEffects, undefined);
    await Promise.all(Array.from({ length: 8 }, () => recoverRequestStatusEffects({ now: new Date(Date.now() + 60000) })));
    assert.equal(await AuditLog.countDocuments({ entityId: row._id }), 1);
    assert.equal(await EmailDelivery.countDocuments({ eventKey: `request-status:${Model.modelName}:${row._id}:CONFIRMED` }), 1);
  });
  await t.test("crash after audit creation reuses deterministic audit ID", async () => {
    const row = await createBed();
    const effect = requestStatusEffect({ previousStatus: "REQUESTED", status: "UNDER_REVIEW", actor, timelineLength: 2 });
    await EmergencyRequest.updateOne({ _id: row._id }, { $set: { status: "UNDER_REVIEW" }, $push: { timeline: { status: "UNDER_REVIEW", actorRole: "hospital_staff" }, statusEffects: effect } });
    await AuditLog.create({ _id: effect.auditId, action: "update", entityType: "EmergencyRequest", entityId: row._id });
    await drainRequestStatusEffects("EmergencyRequest", row._id);
    assert.equal(await AuditLog.countDocuments({ entityId: row._id }), 1);
  });
  await t.test("five failures exhaust retry budget and expired final leases remain visible", async () => {
    const row = await createBed();
    const effect = requestStatusEffect({ previousStatus: "REQUESTED", status: "UNDER_REVIEW", timelineLength: 1 });
    await EmergencyRequest.updateOne({ _id: row._id }, { $push: { statusEffects: effect } });
    AuditLog.updateOne = () => { throw new Error("synthetic persistent outage"); };
    try { for (let i = 0; i < 7; i++) await recoverRequestStatusEffects({ now: new Date(Date.now() + (i + 1) * 600000) }); }
    finally { AuditLog.updateOne = auditUpdate; }
    const stored = (await EmergencyRequest.findById(row._id).select("+statusEffects")).statusEffects[0];
    assert.equal(stored.attempts, 5); assert.equal(stored.exhausted, true);
    const final = requestStatusEffect({ previousStatus: "REQUESTED", status: "UNDER_REVIEW", timelineLength: 1 });
    final.attempts = 5; final.leaseToken = "crashed"; final.leaseUntil = new Date(Date.now() - 1);
    await EmergencyRequest.updateOne({ _id: row._id }, { $push: { statusEffects: final } });
    await recoverRequestStatusEffects();
    assert.equal((await EmergencyRequest.findById(row._id).select("+statusEffects")).statusEffects[1].exhausted, true);
  });
  await t.test("expired-on-mutation preserves the expiry business response and durable effects without duplicating the expiry worker", async () => {
    const row = await createBed();
    await EmergencyRequest.updateOne({ _id: row._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    AuditLog.updateOne = () => { throw new Error("synthetic audit outage"); };
    try {
      const outcome = await changeEmergencyRequest({ requestId: row._id, actor, nextStatus: "UNDER_REVIEW" });
      assert.equal(outcome.status, 409); assert.equal(outcome.error, "Request expired");
    } finally { AuditLog.updateOne = auditUpdate; }
    const stored = await EmergencyRequest.findById(row._id).select("+statusEffects +expiryEffects");
    assert.equal(stored.status, "EXPIRED"); assert.equal(stored.timeline.length, 2);
    assert.equal(stored.expiryEffects, undefined); assert.equal(stored.statusEffects.length, 1);
    await recoverRequestStatusEffects({ now: new Date(Date.now() + 60000) });
    assert.equal(await AuditLog.countDocuments({ entityId: row._id }), 1);
    assert.equal(await EmailDelivery.countDocuments({ eventKey: `mail:emergency:${row._id}:2` }), 1);
    assert.equal((await EmergencyRequest.findById(row._id)).timeline.length, 2);
  });
  await t.test("journal capacity cannot silently discard unresolved entries", async () => {
    const row = await createBed();
    const entries = Array.from({ length: STATUS_EFFECTS_CAPACITY }, () => requestStatusEffect({ previousStatus: "REQUESTED", status: "UNDER_REVIEW", timelineLength: 1 }));
    await EmergencyRequest.updateOne({ _id: row._id }, { $set: { statusEffects: entries } });
    assert.equal((await changeEmergencyRequest({ requestId: row._id, actor, nextStatus: "UNDER_REVIEW" })).status, 409);
    const stored = await EmergencyRequest.findById(row._id).select("+statusEffects");
    assert.equal(stored.status, "REQUESTED"); assert.equal(stored.statusEffects.length, STATUS_EFFECTS_CAPACITY);
  });
});
