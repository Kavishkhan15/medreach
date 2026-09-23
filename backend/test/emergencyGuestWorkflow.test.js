import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { User } from "../src/models/User.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { signToken } from "../src/utils/token.js";

const testDbUri = "mongodb://127.0.0.1:27017/medreach_emergency_guest_test";

test("Emergency Guest Workflow & Authentication Boundary Test Suite", async (t) => {
  let app;
  let testHospital;
  let testUser;
  let userToken;

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
    app = createApp();

    testUser = await User.create({
      name: "Registered Patient",
      email: "patient.guesttest@medreach.test",
      role: "user",
      phone: "+91 98765 00001",
    });
    userToken = signToken(testUser);

    testHospital = await Hospital.create({
      name: "Holy Family Hospital",
      slug: "holy-family-hospital",
      locality: "Bandra West",
      city: "Mumbai",
      facilities: [{ facility: "Emergency Department", status: "available" }, { facility: "ICU", status: "limited" }],
      location: { type: "Point", coordinates: [72.83, 19.05] },
    });
  });

  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  });

  await t.test("1. Rejects unauthenticated request when isEmergency is false", async () => {
    const res = await request(app)
      .post("/api/emergency-requests")
      .send({
        hospitalId: testHospital._id.toString(),
        emergencyType: "Routine Bed",
        requiredFacility: "ICU",
        contactPhone: "+91 98765 11111",
        isEmergency: false,
      });

    assert.equal(res.status, 401);
    assert.ok(res.body.error);
    assert.match(res.body.error, /authentication required/i);
  });

  await t.test("2. Rejects emergency request missing required contactPhone", async () => {
    const res = await request(app)
      .post("/api/emergency-requests")
      .send({
        hospitalId: testHospital._id.toString(),
        emergencyType: "cardiac",
        requiredFacility: "Emergency Department",
        isEmergency: true,
      });

    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  await t.test("3. Successfully creates unauthenticated guest emergency triage request", async () => {
    const res = await request(app)
      .post("/api/emergency-requests")
      .send({
        hospitalId: testHospital._id.toString(),
        emergencyType: "cardiac",
        requiredFacility: "Emergency Department",
        contactPhone: "+91 98765 22222",
        contactEmail: "bystander@example.com",
        patientAgeGroup: "adult",
        patientSummary: "Acute chest pain, arriving by private transport",
        locality: "Bandra",
        isEmergency: true,
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.request);
    assert.equal(res.body.request.user, null);
    assert.equal(res.body.request.contactPhone, "+91 98765 22222");
    assert.equal(res.body.request.contactEmail, "bystander@example.com");
    assert.ok(res.body.request.requestId.startsWith("MR-"));
    assert.equal(res.body.request.isEmergency, true);

    const guestRequestId = res.body.request._id;

    // Unauthenticated lookup of guest emergency request succeeds
    const lookupRes = await request(app).get(`/api/emergency-requests/${guestRequestId}`);
    assert.equal(lookupRes.status, 200);
    assert.equal(lookupRes.body.request._id, guestRequestId);
    assert.equal(lookupRes.body.request.user, null);
  });

  await t.test("4. Authenticated emergency request properly associates user ID and enforces access control", async () => {
    const res = await request(app)
      .post("/api/emergency-requests")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        hospitalId: testHospital._id.toString(),
        emergencyType: "trauma",
        requiredFacility: "Emergency Department",
        contactPhone: "+91 98765 33333",
        patientAgeGroup: "adult",
        isEmergency: true,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.request.user, testUser._id.toString());
    const authRequestId = res.body.request._id;

    // Owner can view request
    const ownerLookup = await request(app)
      .get(`/api/emergency-requests/${authRequestId}`)
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(ownerLookup.status, 200);

    // Unauthenticated lookup of authenticated user's request is blocked with 403
    const unauthLookup = await request(app).get(`/api/emergency-requests/${authRequestId}`);
    assert.equal(unauthLookup.status, 403);
  });

  await t.test("5. Stores ambulanceRequired=true and ambulancePickupAddress in Emergency Bed Request", async () => {
    const res = await request(app)
      .post("/api/emergency-requests")
      .send({
        hospitalId: testHospital._id.toString(),
        emergencyType: "stroke",
        requiredFacility: "Emergency Department",
        contactPhone: "+91 98765 44444",
        isEmergency: true,
        ambulanceRequired: true,
        ambulancePickupAddress: "Flat 402, Sea View Apts, Bandra West, Mumbai",
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.request.ambulanceRequired, true);
    assert.equal(res.body.request.ambulancePickupAddress, "Flat 402, Sea View Apts, Bandra West, Mumbai");

    // Verify persisted in DB
    const dbDoc = await EmergencyRequest.findById(res.body.request._id);
    assert.equal(dbDoc.ambulanceRequired, true);
    assert.equal(dbDoc.ambulancePickupAddress, "Flat 402, Sea View Apts, Bandra West, Mumbai");
  });

  await t.test("6. Stores ambulanceRequired=false and omits pickup address in Standard Bed Request", async () => {
    const res = await request(app)
      .post("/api/emergency-requests")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        hospitalId: testHospital._id.toString(),
        emergencyType: "general",
        requiredFacility: "ICU",
        contactPhone: "+91 98765 55555",
        isEmergency: false,
        ambulanceRequired: false,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.request.ambulanceRequired, false);

    const dbDoc = await EmergencyRequest.findById(res.body.request._id);
    assert.equal(dbDoc.ambulanceRequired, false);
    assert.ok(!dbDoc.ambulancePickupAddress);
  });
});
