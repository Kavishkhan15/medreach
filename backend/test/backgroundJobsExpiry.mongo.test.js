import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { Hospital } from "../src/models/Hospital.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { expireEmergencyRequests, reconcileEmergencyExpiryEffects } from "../src/services/emergencyRequestExpiry.js";

const uri = process.env.MEDREACH_BACKGROUND_TEST_MONGO_URI;
const safeUri = uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):27017\/medreach_background_jobs_test$/.test(uri);
test("expiry effects survive crashes without duplicate audits, mail intents or transitions", { skip: !safeUri, timeout: 30000 }, async (t) => {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  assert.equal(mongoose.connection.name, "medreach_background_jobs_test");
  await Promise.all([EmergencyRequest, Hospital, AuditLog, EmailDelivery].map((Model) => Model.deleteMany({})));
  await Promise.all([EmergencyRequest, EmailDelivery].map((Model) => Model.createIndexes()));
  const hospital = await Hospital.create({ name: "Isolated expiry fixture hospital", city: "Mumbai" });
  let count = 0;
  async function fixture() {
    return EmergencyRequest.create({ hospital: hospital._id, requestId: `MR-EXPIRY-TEST-${++count}`, emergencyType: "Test fixture", requiredFacility: "ICU",
      contactPhone: "+919999990001", contactEmail: "fixture@expiry.example", expiresAt: new Date(Date.now() - 10000),
      status: "SENT", timeline: [{ status: "REQUESTED", actorRole: "patient" }, { status: "SENT", actorRole: "system" }] });
  }
  try {
    await t.test("a crash after EXPIRED preserves the durable effect intent for another process", async () => {
      const record = await fixture();
      await assert.rejects(() => expireEmergencyRequests(new Date(), { beforeEffects: async () => { throw new Error("simulated process crash"); } }), /simulated process crash/);
      const saved = await EmergencyRequest.findById(record._id).select("+expiryEffects");
      assert.equal(saved.status, "EXPIRED");
      assert.equal(saved.expiryEffects.status, "pending");
      assert.equal(saved.timeline.length, 3);
      assert.equal(saved.toJSON().expiryEffects, undefined);
      assert.equal((await reconcileEmergencyExpiryEffects()).completed, 1);
      assert.equal((await expireEmergencyRequests()).expired, 0);
      assert.equal(await AuditLog.countDocuments({ entityId: record._id, action: "update" }), 1);
      assert.equal(await EmailDelivery.countDocuments({ eventKey: `mail:emergency:${record.id}:3` }), 1);
    });
    await t.test("failure after the audit is replayed with the same audit identity", async () => {
      const record = await fixture();
      const originalFind = Hospital.findById;
      try {
        Hospital.findById = () => { throw Object.assign(new Error("do not expose this internal detail"), { code: "DATABASE_UNAVAILABLE" }); };
        assert.equal((await expireEmergencyRequests()).expired, 1);
      } finally { Hospital.findById = originalFind; }
      let saved = await EmergencyRequest.findById(record._id).select("+expiryEffects");
      assert.equal(saved.expiryEffects.status, "pending");
      assert.equal(saved.expiryEffects.attempts, 1);
      assert.equal(saved.expiryEffects.errorCode, "DATABASE_UNAVAILABLE");
      assert.equal(await AuditLog.countDocuments({ entityId: record._id }), 1);
      await EmergencyRequest.updateOne({ _id: record._id }, { $set: { "expiryEffects.retryAt": new Date(0) } });
      const result = await reconcileEmergencyExpiryEffects();
      assert.equal(result.completed, 1);
      saved = await EmergencyRequest.findById(record._id).select("+expiryEffects");
      assert.equal(saved.expiryEffects.status, "complete");
      assert.equal(await AuditLog.countDocuments({ entityId: record._id }), 1);
      assert.equal(await EmailDelivery.countDocuments({ eventKey: `mail:emergency:${record.id}:3` }), 1);
    });
    await t.test("competing expiry workers produce exactly one transition and effects journal", async () => {
      const record = await fixture();
      const results = await Promise.all([expireEmergencyRequests(), expireEmergencyRequests()]);
      assert.equal(results.reduce((total, item) => total + item.expired, 0), 1);
      await reconcileEmergencyExpiryEffects();
      const saved = await EmergencyRequest.findById(record._id).select("+expiryEffects");
      assert.equal(saved.timeline.filter((entry) => entry.status === "EXPIRED").length, 1);
      assert.equal(await AuditLog.countDocuments({ entityId: record._id }), 1);
      assert.equal(await EmailDelivery.countDocuments({ eventKey: `mail:emergency:${record.id}:3` }), 1);
    });
    await t.test("effect failures exhaust bounded retries and remain observable", async () => {
      const record = await fixture();
      await assert.rejects(() => expireEmergencyRequests(new Date(), { beforeEffects: async () => { throw new Error("crash"); } }));
      await EmergencyRequest.updateOne({ _id: record._id }, { $set: { "expiryEffects.attempts": 6 } });
      await reconcileEmergencyExpiryEffects();
      const saved = await EmergencyRequest.findById(record._id).select("+expiryEffects");
      assert.equal(saved.expiryEffects.status, "exhausted");
      assert.equal(saved.expiryEffects.errorCode, "EXPIRY_EFFECTS_RETRY_EXHAUSTED");
      assert.equal(await AuditLog.countDocuments({ entityId: record._id }), 0);
    });
  } finally {
    await Promise.all([EmergencyRequest, Hospital, AuditLog, EmailDelivery].map((Model) => Model.deleteMany({})));
    await mongoose.disconnect();
  }
});
