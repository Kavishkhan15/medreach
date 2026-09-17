import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { User } from "../src/models/User.js";
import { BloodCampaign } from "../src/models/BloodCampaign.js";
import { signToken } from "../src/utils/token.js";

const testDbUri = "mongodb://127.0.0.1:27017/medreach_campaigns_test";

test("Blood campaigns and hospital enrichment test suite", async (t) => {
  let app;
  let userToken;
  let testUser;
  let testHospital;

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
    app = createApp();

    testUser = await User.create({
      name: "Dr. Campaign Organizer",
      email: "organizer@medreach.test",
      role: "user",
    });
    userToken = signToken(testUser);

    testHospital = await Hospital.create({
      name: "Lilavati Hospital and Research Centre",
      slug: "lilavati-hospital-and-research-centre",
      locality: "Bandra West",
      city: "Mumbai",
      pincode: "400050",
      phone: "+91-22-2675-1000",
      emergencyPhone: "+91-22-2656-8000",
      specialties: ["Cardiology", "Neurology", "Oncology", "Trauma"],
      location: { type: "Point", coordinates: [72.8295, 19.0519] },
    });
  });

  t.after(async () => {
    try {
      if (mongoose.connection?.readyState === 1) {
        await mongoose.connection.dropDatabase();
      }
      await disconnectDB();
    } catch {
      // ignore
    }
  });

  await t.test("POST /api/blood-banks/campaigns requires authentication", async () => {
    const res = await request(app)
      .post("/api/blood-banks/campaigns")
      .send({
        name: "Community Blood Drive",
        organizer: "Local NGO",
        location: "Community Center",
        date: new Date().toISOString(),
        contact: "9999999999",
      });

    assert.equal(res.status, 401);
  });

  await t.test("POST /api/blood-banks/campaigns creates a campaign when authorized", async () => {
    const res = await request(app)
      .post("/api/blood-banks/campaigns")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        name: "Bandra LifeSavers Blood Drive",
        organizer: "Rotary Club Bandra",
        location: "Bandra Gymkhana Grounds",
        date: new Date(Date.now() + 86400000).toISOString(),
        bloodGroups: ["O-", "O+", "A+", "B+"],
        contact: "+91-98200-11223",
        description: "Urgent drive to restock O- and B+ reserves",
        targetDonors: 100,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.campaign.name, "Bandra LifeSavers Blood Drive");
    assert.equal(res.body.campaign.status, "active");
    assert.deepEqual(res.body.campaign.bloodGroups, ["O-", "O+", "A+", "B+"]);
  });

  await t.test("GET /api/blood-banks/campaigns returns active campaigns", async () => {
    const res = await request(app).get("/api/blood-banks/campaigns");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length >= 1);
    const found = res.body.data.find((c) => c.name === "Bandra LifeSavers Blood Drive");
    assert.ok(found);
    assert.equal(found.organizer, "Rotary Club Bandra");
  });

  await t.test("GET /api/hospitals/:idOrSlug/enriched returns structured factual hospital data", async () => {
    const res = await request(app).get(`/api/hospitals/${testHospital.slug}/enriched`);
    assert.equal(res.status, 200);
    assert.ok(res.body.enriched);
    const { enriched } = res.body;
    assert.equal(enriched.name, "Lilavati Hospital and Research Centre");
    assert.equal(enriched.pincode, "400050");
    assert.equal(enriched.phone, "+91-22-2675-1000");
    assert.ok(Array.isArray(enriched.specialties));
    assert.ok(enriched.specialties.includes("Cardiology"));
  });

  await t.test("GET /api/hospitals/:idOrSlug/enriched gracefully falls back to 'Not available.' if data is missing", async () => {
    const sparseHospital = await Hospital.create({
      name: "Sparse Medical Center",
      slug: "sparse-medical-center",
      location: { type: "Point", coordinates: [72.85, 19.1] },
    });

    const res = await request(app).get(`/api/hospitals/${sparseHospital.slug}/enriched`);
    assert.equal(res.status, 200);
    assert.ok(res.body.enriched);
    const { enriched } = res.body;
    assert.equal(enriched.name, "Sparse Medical Center");
    assert.equal(enriched.pincode, "Not available.");
    assert.equal(enriched.phone, "Not available.");
    assert.deepEqual(enriched.specialties, ["Not available."]);
  });
});
