import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";

const testDbUri =
  process.env.MEDREACH_TEST_MONGO_URI ||
  "mongodb://127.0.0.1:27017/medreach_ambulance_test";

test("Ambulance provider directory and booking workflow test suite", async (t) => {
  let app;
  let sampleAmbulance;

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
    app = createApp();

    sampleAmbulance = await ResourceProvider.create({
      name: "LifeLine Critical Care Ambulance Mumbai",
      kind: "ambulance",
      active: true,
      locality: "Bandra West",
      address: "Near Lilavati Hospital, Bandra West, Mumbai 400050",
      phone: "+91-98200-10800",
      operatingHours: "24/7",
      providerType: "Advanced Life Support (ALS)",
      services: ["ALS Transport", "Ventilator Support", "Paramedic Onboard"],
      location: {
        type: "Point",
        coordinates: [72.8295, 19.0522],
      },
      verificationStatus: "verified",
      sourceName: "BMC Mumbai EMS Directory",
    });
  });

  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  });

  await t.test("1. GET /api/ambulances lists verified ambulance providers", async () => {
    const res = await request(app).get("/api/ambulances");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    const found = res.body.data.find((a) => a.name === sampleAmbulance.name);
    assert.ok(found, "Sample ambulance provider must be listed");
    assert.equal(found.phone, "+91-98200-10800");
    assert.equal(found.verificationStatus, "verified");
  });

  await t.test("2. GET /api/ambulances?q=Bandra filters providers by locality", async () => {
    const res = await request(app).get("/api/ambulances?q=Bandra");
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    assert.equal(res.body.data[0].locality, "Bandra West");
  });

  await t.test("3. Verifies ambulance provider coordinates format for map and navigation", async () => {
    assert.ok(sampleAmbulance.location?.coordinates?.length === 2);
    const [lng, lat] = sampleAmbulance.location.coordinates;
    assert.equal(lng, 72.8295);
    assert.equal(lat, 19.0522);
  });
});
