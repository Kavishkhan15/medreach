import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { signSessionToken } from "./helpers/session.js";

const uri = process.env.MEDREACH_AUTH_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/medreach_auth_test$/.test(uri));

test("guarded HTTP responses wait for account lease cleanup", { skip: !isolated }, async (t) => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const lock = mongoose.model("AdminMutationLock");
  const originalDelete = lock.deleteOne;
  const cleanup = [];
  const headersAtCleanup = [];
  let currentResponse;
  const app = express();
  app.use((_req, res, next) => { currentResponse = res; next(); });
  app.use(createApp());
  lock.deleteOne = function (...args) {
    headersAtCleanup.push(currentResponse.headersSent);
    const pending = originalDelete.apply(this, args).exec();
    cleanup.push(pending);
    return pending;
  };
  t.after(async () => {
    lock.deleteOne = originalDelete;
    await Promise.all(cleanup);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const admin = await User.create({ name: "Lease fixture", email: "admin@lease.test", role: "system_admin", emailVerifiedAt: new Date() });
  const user = new User({ name: "Account fixture", email: "user@lease.test", emailVerifiedAt: new Date(),
    notificationEmail: "contact@company.com", notificationEmailVerifiedAt: new Date() });
  await user.setPassword("IsolatedFixturePassword123");
  await user.save();
  const auth = { Authorization: `Bearer ${await signSessionToken(admin)}` };
  async function check(method, path, body, status) {
    const before = headersAtCleanup.length;
    const response = await request(app)[method](path).set(auth).send(body);
    await Promise.all(cleanup);
    assert.equal(response.status, status, JSON.stringify(response.body));
    assert.equal(headersAtCleanup.length, before + 1, "Each mutation must release its lease");
    assert.equal(headersAtCleanup.at(-1), false, "Response headers must remain unsent until lease cleanup completes");
    assert.equal(await lock.countDocuments({}), 0);
    return response;
  }

  await t.test("sequential status, role, session and recovery changes release before success", async () => {
    const base = `/api/admin/users/${user._id}`;
    await check("patch", `${base}/status`, { status: "suspended" }, 200);
    await check("patch", `${base}/status`, { status: "active" }, 200);
    await check("patch", `${base}/role`, { role: "provider_admin" }, 200);
    await check("post", `${base}/revoke-sessions`, {}, 200);
    await check("post", `${base}/trigger-reset`, {}, 200);
    await check("post", `${base}/resend-verification`, {}, 200);
  });
  await t.test("denied changes release before their error response and preserve the System Admin", async () => {
    await check("patch", `/api/admin/users/${admin._id}/status`, { status: "suspended" }, 409);
    assert.equal((await User.findById(admin._id)).accountStatus, "active");
  });
  await t.test("provider account and assignment responses release before success or missing-record errors", async () => {
    const hospital = await Hospital.create({ name: "Lease hospital", slug: "lease-hospital", city: "Mumbai", approvalStatus: "approved", verificationStatus: "verified" });
    await check("post", "/api/admin/provider-accounts", { kind: "hospital", organizationId: String(hospital._id), loginEmail: "invited@company.com", notificationEmail: "contact@company.com" }, 201);
    await check("post", `/api/admin/provider-accounts/${user._id}/assignments`, { kind: "hospital", organizationId: String(hospital._id) }, 200);
    await check("patch", `/api/admin/provider-accounts/${user._id}/assignments/${new mongoose.Types.ObjectId()}`, { active: false }, 404);
  });
  await t.test("notification contact changes release before missing-account errors", async () => {
    await check("patch", `/api/admin/users/${new mongoose.Types.ObjectId()}/notifications`, { email: "contact@company.com", enabled: false }, 404);
  });
  await t.test("invalid activation links release before their error response", async () => {
    const response = await request(app).post("/api/auth/activate-provider").send({ token: "x".repeat(43), password: "IsolatedFixturePassword123" });
    await Promise.all(cleanup);
    assert.equal(response.status, 400);
    assert.equal(headersAtCleanup.at(-1), false);
  });
  await t.test("ownership review releases before returning a missing-claim error", async () => {
    await check("post", `/api/admin/ownership-claims/${new mongoose.Types.ObjectId()}/review`, { decision: "approve" }, 404);
  });
});
