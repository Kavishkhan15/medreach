import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";

import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { User } from "../src/models/User.js";
import { Job } from "../src/models/Job.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { signToken } from "../src/utils/token.js";
import { seedCareersFromProviders } from "../src/services/careerJobSeeder.js";

const testDbUri =
  process.env.MEDREACH_TEST_MONGO_URI ||
  "mongodb://127.0.0.1:27017/medreach_flow_contracts_test";

test("explicit healthcare request flow contracts", async (t) => {
  await connectDB(testDbUri);
  await mongoose.connection.dropDatabase();

  const app = createApp();
  const user = await User.create({
    name: "Flow Test Patient",
    email: "flow-patient@medreach.test",
    role: "user",
  });
  const token = signToken(user);
  const hospital = await Hospital.create({
    name: "Flow Contract Hospital",
    slug: "flow-contract-hospital",
    city: "Mumbai",
  });
  const bloodBank = await ResourceProvider.create({
    kind: "blood_bank", name: "Test Blood Bank", sourceName: "Test registry", active: true,
  });

  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  });

  const bedPayload = {
    hospitalId: hospital._id.toString(),
    emergencyType: "general",
    requiredFacility: "ICU",
    contactPhone: "9876543210",
  };

  await t.test("emergency bed contract is public and always persists emergency mode", async () => {
    const res = await request(app)
      .post("/api/emergency-requests/emergency")
      .send({ ...bedPayload, isEmergency: false });

    assert.equal(res.status, 201);
    assert.equal(res.body.request.isEmergency, true);
  });

  await t.test("standard bed contract requires authentication and always persists standard mode", async () => {
    const guest = await request(app)
      .post("/api/emergency-requests/standard")
      .send({ ...bedPayload, isEmergency: true });
    assert.equal(guest.status, 401);

    const authenticated = await request(app)
      .post("/api/emergency-requests/standard")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...bedPayload, isEmergency: true });
    assert.equal(authenticated.status, 201);
    assert.equal(authenticated.body.request.isEmergency, false);
  });

  await t.test("legacy bed contract rejects an omitted flow flag", async () => {
    const res = await request(app).post("/api/emergency-requests").send(bedPayload);
    assert.equal(res.status, 400);
    assert.ok(res.body.details.some((detail) => detail.field === "isEmergency"));
  });

  const bloodPayload = {
    type: "REQUEST",
    providerId: bloodBank.id,
    bloodGroup: "O+",
    patientOrDonorName: "Flow Test Patient",
    units: 2,
    contactPhone: "9876543210",
  };

  await t.test("urgent blood contract accepts only urgent timing windows", async () => {
    const invalid = await request(app)
      .post("/api/blood-requests/urgent")
      .send({ ...bloodPayload, urgency: "3 days" });
    assert.equal(invalid.status, 400);

    const valid = await request(app)
      .post("/api/blood-requests/urgent")
      .send({ ...bloodPayload, urgency: "within 6 hours", isUrgent: false });
    assert.equal(valid.status, 201);
    assert.equal(valid.body.bloodRequest.isUrgent, true);
  });

  await t.test("standard blood contract rejects urgent timing and always persists normal mode", async () => {
    const invalid = await request(app)
      .post("/api/blood-requests/standard")
      .send({ ...bloodPayload, bloodBankName: "Test Blood Bank", urgency: "within 6 hours" });
    assert.equal(invalid.status, 400);

    const valid = await request(app)
      .post("/api/blood-requests/standard")
      .send({ ...bloodPayload, bloodBankName: "Test Blood Bank", urgency: "3 days", isUrgent: true });
    assert.equal(valid.status, 201);
    assert.equal(valid.body.bloodRequest.isUrgent, false);
  });

  await t.test("legacy blood request contract rejects an omitted flow flag", async () => {
    const res = await request(app)
      .post("/api/blood-requests")
      .send({ ...bloodPayload, bloodBankName: "Test Blood Bank", urgency: "3 days" });
    assert.equal(res.status, 400);
    assert.ok(res.body.details.some((detail) => detail.field === "isUrgent"));
  });
});

test("predefined career seeds stay non-live and unverified", async (t) => {
  await connectDB(testDbUri);
  await mongoose.connection.dropDatabase();

  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  });

  const admin = await User.create({
    name: "Seed Test Admin",
    email: "seed-admin@medreach.test",
    role: "system_admin",
  });
  await Hospital.create({
    name: "King Edward Memorial Hospital",
    city: "Mumbai",
  });

  const seeded = await seedCareersFromProviders({ adminId: admin._id });
  assert.ok(seeded.length > 0);
  assert.ok(seeded.every((job) => job.status !== "published"));
  assert.ok(seeded.every((job) => job.verificationStatus === "unverified"));
  assert.ok(seeded.every((job) => job.demo === true));
  assert.ok(seeded.every((job) => !job.reviewedBy));

  assert.equal(await ResourceProvider.countDocuments({ kind: "ambulance" }), 0);
  assert.equal(await Job.countDocuments({ status: "published" }), 0);
});
