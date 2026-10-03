import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { BloodRequest } from "../src/models/BloodRequest.js";
import { AmbulanceBooking } from "../src/models/AmbulanceBooking.js";
import { User } from "../src/models/User.js";
import { hashTrackingToken } from "../src/utils/trackingToken.js";
import { signSessionToken } from "./helpers/session.js";

const uri = process.env.MEDREACH_TEST_MONGO_URI || "mongodb://127.0.0.1:27017/medreach_public_tracking_test";
test("reference-only tracking exposes status summaries while detailed records remain authorized", async (t) => {
  assert.match(new URL(uri).pathname, /(?:_test|_integration)$/);
  await connectDB(uri);
  await mongoose.connection.dropDatabase();
  const app = createApp();
  const secret = "private-test-tracking-token-that-is-not-public";
  const tokenHash = hashTrackingToken(secret);
  const owner = await User.create({ name: "Tracking owner", email: "owner@tracking.test" });
  const stranger = await User.create({ name: "Other user", email: "other@tracking.test" });
  const blood = await BloodRequest.create({ reference: "BR-20261002-AABBCC", type: "REQUEST", bloodBankName: "Private bank choice",
    bloodGroup: "AB-", patientOrDonorName: "Private patient", contactPhone: "+91 9876543210", contactEmail: "patient@tracking.test",
    hospitalName: "Private hospital choice", doctorNotes: "Private medical notes", trackingTokenHash: tokenHash });
  const donation = await BloodRequest.create({ reference: "BDP-20261002-112233", type: "DONATION", bloodBankName: "Private donation choice",
    bloodGroup: "O+", patientOrDonorName: "Private donor", contactPhone: "+91 9876543210", user: owner._id });
  const delivery = { status: "disabled", attempted: false };
  const booking = await AmbulanceBooking.create({ reference: "AMB-MUR0000-ABCDEF", provider: new mongoose.Types.ObjectId(),
    user: owner._id, providerSnapshot: { name: "Private provider choice", phone: "+91 9876543210", email: "provider@tracking.test" },
    requestSnapshot: { patientName: "Private patient", patientAge: 42, pickupAddress: "Private pickup address", contactPhone: "+91 9876543210", notes: "Private notes" },
    trackingTokenHash: tokenHash, delivery: { user: delivery, admin: delivery, provider: delivery } });
  try {
    await t.test("guest reference lookup returns exactly the basic fields for blood, donation and ambulance", async () => {
      for (const [kind, record] of [["blood", blood], ["blood", donation], ["ambulance", booking]]) {
        const response = await request(app).get(`/api/tracking/${kind}/${record.reference}`);
        assert.equal(response.status, 200);
        assert.equal(response.headers["cache-control"], "no-store");
        assert.deepEqual(Object.keys(response.body), ["record"]);
        assert.deepEqual(Object.keys(response.body.record).sort(), ["reference", "status", "updatedAt"]);
        assert.equal(response.body.record.reference, record.reference);
        assert.equal(response.body.record.status, record.status);
      }
    });
    await t.test("lookup accepts lowercase references and ignores stale cookies and untrusted private headers", async () => {
      const response = await request(app).get(`/api/tracking/blood/${blood.reference.toLowerCase()}`)
        .set("Cookie", "token=expired-session").set("X-MedReach-Tracking-Token", "wrong-token");
      assert.equal(response.status, 200);
      assert.equal(response.body.record.reference, blood.reference);
    });
    await t.test("lookup reads current database status rather than returning a default", async () => {
      await BloodRequest.updateOne({ _id: blood._id }, { $set: { status: "COMPLETED" } });
      await AmbulanceBooking.updateOne({ _id: booking._id }, { $set: { status: "CANCELLED" } });
      assert.equal((await request(app).get(`/api/tracking/blood/${blood.reference}`)).body.record.status, "COMPLETED");
      assert.equal((await request(app).get(`/api/tracking/ambulance/${booking.reference}`)).body.record.status, "CANCELLED");
    });
    await t.test("malformed/wrong-type/missing references do not expose a record", async () => {
      assert.equal((await request(app).get("/api/tracking/blood/not-a-reference")).status, 400);
      assert.equal((await request(app).get("/api/tracking/ambulance/BR-20261002-AABBCC")).status, 400);
      assert.equal((await request(app).get("/api/tracking/jobs/BR-20261002-AABBCC")).status, 400);
      assert.equal((await request(app).get("/api/tracking/blood/BR-20261002-000000")).status, 404);
      assert.equal((await request(app).get(`/api/tracking/blood/${blood.id}`)).status, 400);
    });
    await t.test("knowing a reference does not grant guest or another user access to sensitive records", async () => {
      assert.equal((await request(app).get(`/api/blood-requests/${blood.reference}`)).status, 403);
      assert.equal((await request(app).get(`/api/blood-requests/${donation.reference}`).set("Authorization", `Bearer ${await signSessionToken(stranger)}`)).status, 403);
      assert.equal((await request(app).get(`/api/ambulances/bookings/${booking.reference}`)).status, 403);
      assert.equal((await request(app).get(`/api/ambulances/bookings/${booking.reference}`).set("Authorization", `Bearer ${await signSessionToken(stranger)}`)).status, 403);
      assert.equal((await request(app).get(`/api/blood-requests/${blood.reference}`).set("X-MedReach-Tracking-Token", secret)).status, 200);
      assert.equal((await request(app).get(`/api/ambulances/bookings/${booking.reference}`).set("Authorization", `Bearer ${await signSessionToken(owner)}`)).status, 200);
    });
    await t.test("status lookup is read-only and rate limited", async () => {
      assert.equal((await request(app).patch(`/api/tracking/blood/${blood.reference}`).send({ status: "CANCELLED" })).status, 404);
      const isolatedApp = createApp();
      for (let attempt = 0; attempt < 60; attempt++) {
        assert.equal((await request(isolatedApp).get(`/api/tracking/blood/${blood.reference}`)).status, 200);
      }
      assert.equal((await request(isolatedApp).get(`/api/tracking/blood/${blood.reference}`)).status, 429);
    });
  } finally { await mongoose.connection.dropDatabase(); await disconnectDB(); }
});
