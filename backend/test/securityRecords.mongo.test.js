import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { User } from "../src/models/User.js";
import { BloodCampaign } from "../src/models/BloodCampaign.js";
import { AuthToken } from "../src/models/AuthToken.js";
import { signSessionToken } from "./helpers/session.js";
import { verifyToken } from "../src/utils/token.js";

const uri = process.env.MEDREACH_TEST_MONGO_URI || "mongodb://127.0.0.1:27017/medreach_security_test";
if (!["medreach_security_test", "medreach_fusion_integration"].includes(new URL(uri).pathname.slice(1))) throw new Error("Security tests require an isolated database");

test("persisted security boundaries", async (t) => {
  await connectDB(uri);
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await disconnectDB(); });
  const app = createApp();
  const owner = await User.create({ name: "Owner", email: "private-owner@example.test" });
  const outsider = await User.create({ name: "Outsider", email: "outsider@example.test" });
  const admin = await User.create({ name: "Admin", email: "admin@example.test", role: "system_admin" });
  const ownerToken = await signSessionToken(owner);
  const outsiderToken = await signSessionToken(outsider);
  const adminToken = await signSessionToken(admin);
  const proposal = await BloodCampaign.create({ name: "Private proposal", organizer: "Organizer", location: "Mumbai",
    date: new Date(), contact: "9876543210", createdBy: owner._id, status: "pending" });

  await t.test("pending/rejected/cancelled campaigns cannot be read or queried publicly", async () => {
    for (const status of ["pending", "rejected", "cancelled"]) {
      await BloodCampaign.updateOne({ _id: proposal._id }, { $set: { status } });
      assert.equal((await request(app).get(`/api/blood-banks/campaigns/${proposal._id}`)).status, 404);
      assert.equal((await request(app).get(`/api/blood-banks/campaigns/${proposal._id}`).set("Authorization", `Bearer ${outsiderToken}`)).status, 404);
      assert.equal((await request(app).get(`/api/blood-banks/campaigns?status=${status}`)).status, 403);
      assert.equal((await request(app).get(`/api/blood-banks/campaigns/${proposal._id}`).set("Authorization", `Bearer ${ownerToken}`)).status, 200);
      assert.equal((await request(app).get(`/api/blood-banks/campaigns?status=${status}`).set("Authorization", `Bearer ${adminToken}`)).status, 200);
    }
  });

  await t.test("campaign query operators and malformed proposal fields are rejected", async () => {
    for (const query of ["status[$ne]=pending", "status[]=pending", "bloodGroup[$ne]=O%2B", "q[$regex]=.*"]) {
      assert.equal((await request(app).get(`/api/blood-banks/campaigns?${query}`)).status, 400);
    }
    const payload = { name: "Valid drive", organizer: "Organizer", location: "Mumbai", date: new Date().toISOString(), contact: "9876543210" };
    for (const patch of [{ name: { $ne: "" } }, { date: "invalid" }, { contact: "123" }, { email: "invalid" }, { bloodGroups: [{ $ne: null }] }]) {
      assert.equal((await request(app).post("/api/blood-banks/campaigns").send({ ...payload, ...patch })).status, 400);
    }
  });

  await t.test("proposals do not publish the account email unless supplied as contact information", async () => {
    const response = await request(app).post("/api/blood-banks/campaigns").set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Contact privacy", organizer: "Organizer", location: "Mumbai", date: new Date().toISOString(), contact: "9876543210" });
    assert.equal(response.status, 201);
    assert.equal(response.body.campaign.email, undefined);
  });

  await t.test("public campaign responses omit creator account identity", async () => {
    await BloodCampaign.updateOne({ _id: proposal._id }, { $set: { status: "active" } });
    for (const path of ["/api/blood-banks/campaigns", `/api/blood-banks/campaigns/${proposal._id}`, "/api/blood-campaigns"]) {
      const result = await request(app).get(path);
      assert.equal(result.status, 200);
      assert.equal(JSON.stringify(result.body).includes(owner.email), false);
      assert.equal(JSON.stringify(result.body).includes('"createdBy"'), false);
    }
  });

  await t.test("editing an approved campaign as its creator requires moderation again", async () => {
    const changed = await request(app).patch(`/api/blood-banks/campaigns/${proposal._id}`)
      .set("Authorization", `Bearer ${ownerToken}`).send({ name: "Changed content", status: "active" });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.campaign.status, "pending");
    assert.equal((await request(app).get(`/api/blood-banks/campaigns/${proposal._id}`)).status, 404);
    assert.equal((await request(app).patch(`/api/blood-banks/campaigns/${proposal._id}`).set("Authorization", `Bearer ${outsiderToken}`).send({ name: "Hijack" })).status, 403);
    const approved = await request(app).patch(`/api/blood-banks/campaigns/${proposal._id}/status`).set("Authorization", `Bearer ${adminToken}`).send({ status: "active" });
    assert.equal(approved.status, 200);
  });

  for (const invalidation of ["revoked", "expired", "deleted", "disabled", "version_changed"]) {
    await t.test(`${invalidation} session cannot use protected or optional-auth routes`, async () => {
      const user = await User.create({ name: "Session test", email: `${invalidation}@example.test` });
      const token = await signSessionToken(user);
      const familyId = verifyToken(token).sid;
      if (invalidation === "revoked") await AuthToken.updateMany({ familyId }, { $set: { revokedAt: new Date() } });
      if (invalidation === "expired") await AuthToken.updateMany({ familyId }, { $set: { expiresAt: new Date(0) } });
      if (invalidation === "deleted") await AuthToken.deleteMany({ familyId });
      if (invalidation === "disabled") await User.updateOne({ _id: user._id }, { $set: { accountStatus: "disabled" } });
      if (invalidation === "version_changed") await User.updateOne({ _id: user._id }, { $inc: { authVersion: 1 } });
      for (const path of ["/api/auth/me", "/api/blood-banks/campaigns"]) {
        assert.equal((await request(app).get(path).set("Authorization", `Bearer ${token}`)).status, 401);
      }
    });
  }

  await t.test("role changes are read from the database instead of stale access claims", async () => {
    await User.updateOne({ _id: admin._id }, { $set: { role: "user" } });
    assert.equal((await request(app).get("/api/admin/users").set("Authorization", `Bearer ${adminToken}`)).status, 403);
  });

  await t.test("both career submission routes reject unsafe resume aliases before saving", async () => {
    for (const path of ["/api/jobs/507f1f77bcf86cd799439011/apply", "/api/organizations/507f1f77bcf86cd799439011/apply"]) {
      for (const field of ["fileUrl", "url", "dataUrl", "data"]) {
        const response = await request(app).post(path).set("Authorization", `Bearer ${ownerToken}`)
          .send({ organizationType: "hospital", roleInterested: "Nurse", sop: "Healthcare application statement", resume: { [field]: "javascript:alert(1)" } });
        assert.equal(response.status, 400);
        assert.ok(response.body.details.some(({ field }) => field === "resume"));
      }
    }
  });
});
