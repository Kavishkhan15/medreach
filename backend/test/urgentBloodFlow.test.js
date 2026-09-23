import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { BloodRequest } from "../src/models/BloodRequest.js";

const testDbUri =
  process.env.MEDREACH_TEST_MONGO_URI ||
  "mongodb://127.0.0.1:27017/medreach_urgent_blood_test";

test("Urgent Blood Requisition and Emergency Lifecycles Suite", async (t) => {
  let app;

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
    app = createApp();
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

  await t.test("3. GET /api/blood-requests/:reference retrieves dispatched emergency request", async () => {
    const created = await BloodRequest.findOne({ patientOrDonorName: "Sunil Gavaskar" });
    assert.ok(created);

    const res = await request(app).get(`/api/blood-requests/${created.reference}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.bloodRequest.patientOrDonorName, "Sunil Gavaskar");
    assert.equal(res.body.bloodRequest.urgency, "within 6 hours");
  });
});
