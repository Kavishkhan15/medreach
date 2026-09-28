import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { User } from "../src/models/User.js";
import { BloodCampaign } from "../src/models/BloodCampaign.js";
import { BloodRequest } from "../src/models/BloodRequest.js";
import { signToken } from "../src/utils/token.js";

const testDbUri =
  process.env.MEDREACH_TEST_MONGO_URI ||
  "mongodb://127.0.0.1:27017/medreach_campaigns_test";

test("Blood campaigns, moderation lifecycle, and blood requests test suite", async (t) => {
  let app;
  let adminToken;
  let regularUserToken;
  let otherUserToken;
  let adminUser;
  let regularUser;
  let otherUser;
  let testHospital;
  let proposedCampaignId;

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
    app = createApp();

    // 1. Setup Admin User (role: system_admin)
    adminUser = await User.create({
      name: "MedReach System Admin",
      email: "sysadmin@medreach.test",
      role: "system_admin",
      accountStatus: "active",
    });
    adminToken = signToken(adminUser);

    // 2. Setup Standard Authenticated User (role: user)
    regularUser = await User.create({
      name: "Regular Donor User",
      email: "donor@medreach.test",
      role: "user",
      accountStatus: "active",
    });
    regularUserToken = signToken(regularUser);

    // 3. Setup Secondary Non-Admin User for permission boundaries
    otherUser = await User.create({
      name: "Unauthorized Other User",
      email: "other@medreach.test",
      role: "user",
      accountStatus: "active",
    });
    otherUserToken = signToken(otherUser);

    // 4. Setup Test Hospital
    testHospital = await Hospital.create({
      name: "Lilavati Hospital and Research Centre",
      slug: "lilavati-hospital-and-research-centre",
      locality: "Bandra West",
      city: "Mumbai",
      pincode: "400050",
      phone: "+91-22-2675-1000",
      emergencyPhone: "+91-22-2656-8000",
      specialties: ["Cardiology", "Neurology", "Oncology", "Trauma"],
      facilities: [
        { facility: "Blood Bank", capability: "yes", status: "available" },
        { facility: "Emergency Department", capability: "yes", status: "available" },
      ],
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
      // Clean teardown fallback
    }
  });

  // 1. Public / Guest can propose a blood campaign, receives status 'pending'
  await t.test("1. Public/guest can propose a blood campaign with status 'pending'", async () => {
    const payload = {
      name: "Bandra LifeSavers Blood Drive",
      organizer: "Rotary Club Bandra",
      location: "Bandra Gymkhana Grounds",
      date: new Date(Date.now() + 86400000).toISOString(),
      bloodGroups: ["O-", "O+", "A+", "B+"],
      contact: "+91-98200-11223",
      email: "contact@rotarybandra.org",
      description: "Urgent drive to restock O- and B+ reserves",
      targetDonors: 100,
    };

    const res = await request(app)
      .post("/api/blood-banks/campaigns")
      .send(payload);

    assert.equal(res.status, 201);
    assert.ok(res.body.campaign);
    assert.equal(res.body.campaign.name, "Bandra LifeSavers Blood Drive");
    assert.equal(res.body.campaign.status, "pending");
    proposedCampaignId = res.body.campaign._id;
  });

  // 2. Pending campaigns are NOT shown in public listing
  await t.test("2. Pending campaigns are hidden from public list", async () => {
    const res = await request(app).get("/api/blood-banks/campaigns");
    assert.equal(res.status, 200);
    const found = res.body.data.find((c) => String(c._id) === String(proposedCampaignId));
    assert.equal(found, undefined, "Pending campaign must not appear in public active listing");
  });

  // 3. Admin can list pending campaigns
  await t.test("3. Admin can list pending campaigns with status=pending", async () => {
    const res = await request(app)
      .get("/api/blood-banks/campaigns?status=pending")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    const found = res.body.data.find((c) => String(c._id) === String(proposedCampaignId));
    assert.ok(found, "Pending campaign should be found in admin pending query");
    assert.equal(found.status, "pending");
  });

  // 4. Non-admin cannot approve campaign
  await t.test("4. Non-admin cannot approve campaign (403)", async () => {
    const res = await request(app)
      .patch(`/api/blood-banks/campaigns/${proposedCampaignId}/status`)
      .set("Authorization", `Bearer ${otherUserToken}`)
      .send({ status: "active" });

    assert.equal(res.status, 403);
  });

  // 5. Admin can approve campaign
  await t.test("5. Admin can approve campaign (PATCH status='active')", async () => {
    const res = await request(app)
      .patch(`/api/blood-banks/campaigns/${proposedCampaignId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "active" });

    assert.equal(res.status, 200);
    assert.equal(res.body.campaign.status, "active");
  });

  // 6. Once approved, campaign appears in public GET /api/blood-banks/campaigns
  await t.test("6. Approved campaign appears in public active campaigns list", async () => {
    const res = await request(app).get("/api/blood-banks/campaigns");
    assert.equal(res.status, 200);
    const found = res.body.data.find((c) => String(c._id) === String(proposedCampaignId));
    assert.ok(found, "Approved campaign must now appear in public listing");
    assert.equal(found.status, "active");
  });

  // 7. Blood request creation (REQUEST type)
  await t.test("7. POST /api/blood-requests creates a valid blood requisition", async () => {
    const res = await request(app)
      .post("/api/blood-requests/standard")
      .send({
        type: "REQUEST",
        bloodBankName: "KEM Hospital Blood Bank",
        bloodGroup: "O-",
        patientOrDonorName: "Ramesh Sharma",
        units: 2,
        urgency: "3 days",
        hospitalName: "KEM Hospital",
        contactPhone: "+91-98200-99887",
        contactEmail: "requester@example.com",
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.bloodRequest);
    assert.ok(res.body.reference.startsWith("BR-"));
    assert.equal(res.body.bloodRequest.bloodGroup, "O-");
    assert.equal(res.body.bloodRequest.status, "REQUESTED");
  });

  // 8. Blood donation pledge creation (DONATION type)
  await t.test("8. POST /api/blood-requests creates a valid donation pledge", async () => {
    const res = await request(app)
      .post("/api/blood-requests/standard")
      .send({
        type: "DONATION",
        bloodBankName: "Lilavati Blood Bank",
        bloodGroup: "A+",
        patientOrDonorName: "Pooja Patel",
        age: 26,
        weight: 58,
        contactPhone: "+91-98111-22334",
        contactEmail: "donor@example.com",
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.bloodRequest);
    assert.ok(res.body.reference.startsWith("BDP-"));
    assert.equal(res.body.bloodRequest.bloodGroup, "A+");
  });

  // 8b. Urgent blood requirement with isUrgent and emergency urgency window
  await t.test("8b. POST /api/blood-requests handles urgent blood requirements", async () => {
    const res = await request(app)
      .post("/api/blood-requests/urgent")
      .send({
        type: "REQUEST",
        isUrgent: true,
        bloodGroup: "B+",
        patientOrDonorName: "Arjun Mehta",
        units: 3,
        urgency: "within 6 hours",
        hospitalName: "Hinduja Hospital Mahim",
        contactPhone: "+91-98700-11223",
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.bloodRequest);
    assert.equal(res.body.bloodRequest.isUrgent, true);
    assert.equal(res.body.bloodRequest.urgency, "within 6 hours");
    assert.equal(res.body.bloodRequest.bloodBankName, "No specific blood bank selected");
  });

  // 8c. Normal blood requirement timing
  await t.test("8c. POST /api/blood-requests handles normal requirement timing options", async () => {
    const res = await request(app)
      .post("/api/blood-requests/standard")
      .send({
        type: "REQUEST",
        bloodBankName: "Saifee Hospital Blood Bank",
        bloodGroup: "AB+",
        patientOrDonorName: "Zainab Merchant",
        units: 1,
        urgency: "1 week",
        hospitalName: "Saifee Hospital Charni Road",
        contactPhone: "+91-98200-33445",
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.bloodRequest);
    assert.equal(res.body.bloodRequest.urgency, "1 week");
  });

  // 9. Hospital enriched data
  await t.test("9. GET /api/hospitals/:idOrSlug/enriched returns factual data", async () => {
    const res = await request(app).get(`/api/hospitals/${testHospital.slug}/enriched`);
    assert.equal(res.status, 200);
    assert.ok(res.body.enriched);
    assert.equal(res.body.enriched.name, "Lilavati Hospital and Research Centre");
    assert.equal(res.body.enriched.phone, "+91-22-2675-1000");
  });
});
