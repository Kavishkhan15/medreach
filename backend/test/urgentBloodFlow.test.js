import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { BloodRequest } from "../src/models/BloodRequest.js";
import { User } from "../src/models/User.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { signSessionToken } from "./helpers/session.js";

const testDbUri =
  process.env.MEDREACH_TEST_MONGO_URI ||
  "mongodb://127.0.0.1:27017/medreach_urgent_blood_test";

test("Urgent Blood Requisition and Emergency Lifecycles Suite", async (t) => {
  let app;
  let guestTrackingToken;
  let ownerToken;
  let adminToken;
  let bloodBank;

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
    app = createApp();
    const owner = await User.create({
      name: "Blood Request Owner",
      email: "blood-owner@medreach.test",
      role: "user",
      phone: "+91-98200-10000",
    });
    ownerToken = await signSessionToken(owner);
    const admin = await User.create({
      name: "Blood Request Admin",
      email: "blood-admin@medreach.test",
      role: "system_admin",
      phone: "+91-98200-10001",
    });
    adminToken = await signSessionToken(admin);
    bloodBank = await ResourceProvider.create({
      kind: "blood_bank", name: "Test Blood Bank", sourceName: "Test registry", active: true,
    });
  });

  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  });

  await t.test("1. POST /api/blood-requests creates an urgent emergency requisition with 6h window", async () => {
    const res = await request(app)
      .post("/api/blood-requests")
      .send({
        type: "REQUEST",
        isUrgent: true,
        bloodGroup: "O+",
        patientOrDonorName: "Sunil Gavaskar",
        units: 4,
        urgency: "within 6 hours",
        hospitalName: "Lilavati Hospital Bandra",
        doctorNotes: "[Doctor: Dr. Sen] Urgent cardiac surgery bypass",
        contactPhone: "+91-98200-11223",
        contactEmail: "attendant@example.com",
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.bloodRequest);
    assert.equal(res.body.bloodRequest.isUrgent, true);
    assert.equal(res.body.bloodRequest.units, 4);
    assert.equal(res.body.bloodRequest.urgency, "within 6 hours");
    assert.ok(res.body.bloodRequest.reference.startsWith("BR-"));
    assert.equal(typeof res.body.trackingToken, "string");
    assert.ok(res.body.trackingToken.length >= 32);
    assert.equal(res.body.bloodRequest.trackingTokenHash, undefined);
    guestTrackingToken = res.body.trackingToken;

    const stored = await BloodRequest.findById(res.body.bloodRequest._id).select("+trackingTokenHash");
    assert.ok(stored.trackingTokenHash);
    assert.notEqual(stored.trackingTokenHash, guestTrackingToken);
  });

  await t.test("2. Rejects request when patient name or phone is missing", async () => {
    const res = await request(app)
      .post("/api/blood-requests")
      .send({
        type: "REQUEST",
        isUrgent: true,
        bloodGroup: "AB+",
        units: 1,
        urgency: "12 hours",
      });

    assert.equal(res.status, 400);
  });

  await t.test("3. GET /api/blood-requests/:reference requires the guest tracking token", async () => {
    const created = await BloodRequest.findOne({ patientOrDonorName: "Sunil Gavaskar" });
    assert.ok(created);

    const missingToken = await request(app).get(`/api/blood-requests/${created.reference}`);
    assert.equal(missingToken.status, 403);

    const wrongToken = await request(app)
      .get(`/api/blood-requests/${created.reference}`)
      .set("X-MedReach-Tracking-Token", "wrong-token");
    assert.equal(wrongToken.status, 403);

    const unrelatedUser = await request(app)
      .get(`/api/blood-requests/${created.reference}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(unrelatedUser.status, 403);

    const res = await request(app)
      .get(`/api/blood-requests/${created.reference}`)
      .set("X-MedReach-Tracking-Token", guestTrackingToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.bloodRequest.patientOrDonorName, "Sunil Gavaskar");
    assert.equal(res.body.bloodRequest.urgency, "within 6 hours");
    assert.equal(res.body.bloodRequest.trackingTokenHash, undefined);

    const adminLookup = await request(app)
      .get(`/api/blood-requests/${created.reference}`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(adminLookup.status, 200);
    assert.equal(adminLookup.body.bloodRequest.trackingTokenHash, undefined);
  });

  await t.test("4. Authenticated blood-request owners can retrieve their request without a tracking token", async () => {
    const created = await request(app)
      .post("/api/blood-requests/standard")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        type: "REQUEST",
        bloodBankName: "Test Blood Bank",
        providerId: bloodBank.id,
        bloodGroup: "A+",
        patientOrDonorName: "Blood Request Owner",
        contactPhone: "+91-98200-10000",
        urgency: "3 days",
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.trackingToken, undefined);

    const res = await request(app)
      .get(`/api/blood-requests/${created.body.reference}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.bloodRequest.reference, created.body.reference);
    assert.equal(res.body.bloodRequest.trackingTokenHash, undefined);
  });
});
