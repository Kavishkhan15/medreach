import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { AuthToken } from "../src/models/AuthToken.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { signSessionToken } from "./helpers/session.js";
import { env } from "../src/config/env.js";

const uri = process.env.MEDREACH_MANUAL_CREDENTIALS_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_provider_credentials_test$/.test(uri));
test("manual provider credentials preserve assignments and disclose new secrets only to System Admin", { skip: !isolated, timeout: 90000 }, async t => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([User, Hospital, ResourceProvider, ProviderMembership, AuthToken, EmailDelivery, AuditLog].map(model => model.init()));
  const app = createApp();
  const system = await User.create({ name: "Isolated System Admin", email: "system@manual.test", role: "system_admin" });
  const regular = await User.create({ name: "Isolated user", email: "user@manual.test", role: "user" });
  const auth = { Authorization: `Bearer ${await signSessionToken(system)}` };
  const hospital = await Hospital.create({ name: "Isolated manual hospital", verificationStatus: "verified" });
  const resources = await ResourceProvider.create(["blood_bank", "diagnostic", "ambulance"].map(kind => ({ kind, name: `Independent ${kind} fixture`, sourceName: "Test fixture", verificationStatus: "verified" })));
  const blocked = await Hospital.create({ name: "Pending approval", verificationStatus: "unverified", approvalStatus: "pending" });
  let accounts, credentials;

  await t.test("anonymous users and non-System Admin roles cannot provision or retrieve credentials", async () => {
    assert.equal((await request(app).post("/api/admin/provider-accounts/manual-provision").send({})).status, 401);
    for (const role of ["user", "provider_admin", "admin", "user_admin"]) {
      const user = await User.create({ name: "Restricted fixture", email: `restricted-${role}@manual.test`, role });
      const headers = { Authorization: `Bearer ${await signSessionToken(user)}` };
      assert.equal((await request(app).post("/api/admin/provider-accounts/manual-provision").set(headers).send({})).status, 403);
      assert.equal((await request(app).post(`/api/admin/provider-accounts/${user._id}/credentials`).set(headers).send({ mode: "generate", expectedRevision: 0 })).status, 403);
    }
  });
  await t.test("eligible organisations are provisioned once with unique demo IDs and no email", async () => {
    const first = await request(app).post("/api/admin/provider-accounts/manual-provision").set(auth).send({});
    assert.equal(first.status, 200);
    assert.equal(first.body.summary.created, 4);
    accounts = first.body.accounts;
    assert.equal(accounts.length, 4);
    assert.equal(new Set(accounts.map(a => a.email)).size, 4);
    for (const a of accounts) assert.match(a.email, /^admin@[a-z0-9-]+-[a-f0-9]{24}\.example$/);
    const before = await ProviderMembership.find().lean();
    const again = await request(app).post("/api/admin/provider-accounts/manual-provision").set(auth).send({});
    assert.equal(again.body.summary.created, 0);
    assert.deepEqual(await ProviderMembership.find().lean(), before);
    assert.equal(await ProviderMembership.countDocuments({ organization: blocked._id }), 0);
    assert.equal(await EmailDelivery.countDocuments(), 0);
  });
  await t.test("each generated password is unique, hashed, login-tested and absent from lists, audits and tokens", async () => {
    credentials = [];
    for (const a of accounts) {
      const result = await request(app).post(`/api/admin/provider-accounts/${a._id}/credentials`).set(auth).send({ mode: "generate", expectedRevision: a.credentialRevision });
      assert.equal(result.status, 200);
      assert.match(result.headers["cache-control"], /no-store/);
      const secret = result.body.credentials.password;
      assert.ok(secret.length >= 32 && /[A-Z]/.test(secret) && /[a-z]/.test(secret) && /\d/.test(secret) && /[^a-z0-9]/i.test(secret));
      credentials.push(result.body.credentials);
      const stored = await User.findById(a._id).select("+passwordHash");
      assert.ok(stored.passwordHash !== secret && await stored.comparePassword(secret));
      assert.equal(stored.accountStatus, "active");
      assert.equal(stored.notificationEmailVerifiedAt, undefined);
      assert.equal(stored.emailVerifiedAt, undefined);
      const providerAgent = request.agent(app);
      const login = await providerAgent.post("/api/auth/login").send({ email: a.email, password: secret });
      assert.equal(login.status, 200); assert.equal(login.body.user.role, "provider_admin");
      assert.equal((await providerAgent.get("/api/admin/provider-accounts")).status, 403);
      assert.equal((await providerAgent.get(`/api/hospital-admin/hospitals/${blocked._id}/facility-claims`)).status, 403);
    }
    assert.equal(new Set(credentials.map(c => c.password)).size, 4);
    const listed = await request(app).get("/api/admin/provider-accounts").set(auth);
    for (const a of listed.body.data.filter(a => accounts.some(b => b._id === a._id))) {
      assert.equal(a.passwordSet, true); assert.equal(a.passwordStatus, "Set (secure hash only)");
      assert.equal(a.password, undefined); assert.equal(a.passwordHash, undefined);
    }
    const persisted = JSON.stringify({ users: await User.find().select("+passwordHash").lean(), audit: await AuditLog.find().lean(), tokens: await AuthToken.find().lean() });
    for (const c of credentials) assert.ok(!persisted.includes(c.password), "Generated secret must never be persisted");
    assert.equal(await EmailDelivery.countDocuments(), 0);
  });
  await t.test("repeated generation and stale/concurrent resets cannot overwrite a confirmed password", async () => {
    const a = accounts[0], before = await ProviderMembership.find().lean();
    const agent = request.agent(app);
    assert.equal((await agent.post("/api/auth/login").send({ email: a.email, password: credentials[0].password })).status, 200);
    assert.equal((await request(app).post(`/api/admin/provider-accounts/${a._id}/credentials`).set(auth).send({ mode: "generate", expectedRevision: 0 })).status, 409);
    assert.equal((await request(app).post(`/api/admin/provider-accounts/${regular._id}/credentials`).set(auth).send({ mode: "reset", expectedRevision: 0 })).status, 404);
    const results = await Promise.all([1, 2].map(() => request(app).post(`/api/admin/provider-accounts/${a._id}/credentials`).set(auth).send({ mode: "reset", expectedRevision: 1 })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const changed = results.find(r => r.status === 200);
    assert.ok(changed.body.credentials.password !== credentials[0].password);
    assert.equal((await agent.get("/api/providers/mine")).status, 401);
    assert.equal((await request(app).post("/api/auth/login").send({ email: a.email, password: credentials[0].password })).status, 401);
    assert.equal((await request(app).post("/api/auth/login").send({ email: a.email, password: changed.body.credentials.password })).status, 200);
    assert.deepEqual(await ProviderMembership.find().lean(), before);
  });
  await t.test("production blocks local manual credentials and login; existing defaults remain isolated", async () => {
    const nodeEnv = env.nodeEnv; env.nodeEnv = "production";
    try {
      assert.equal((await request(app).post("/api/admin/provider-accounts/manual-provision").set(auth).send({})).status, 403);
      assert.equal((await request(app).post("/api/auth/login").send({ email: accounts[1].email, password: credentials[1].password })).status, 401);
    } finally { env.nodeEnv = nodeEnv; }
  });
  await t.test("existing user assignments and password hashes are preserved during provisioning", async () => {
    const owned = await Hospital.create({ name: "Existing user-owned fixture", verificationStatus: "verified" });
    await ProviderMembership.create({ user: regular._id, kind: "hospital", organization: owned._id, assignedBy: system._id });
    const hashes = await User.find({ _id: { $in: accounts.map(a => a._id) } }).select("+passwordHash").lean();
    const result = await request(app).post("/api/admin/provider-accounts/manual-provision").set(auth).send({});
    assert.equal(result.body.summary.created, 0); assert.ok(result.body.summary.needsReview >= 1);
    assert.equal((await User.findById(regular._id)).role, "user");
    assert.deepEqual(await User.find({ _id: { $in: accounts.map(a => a._id) } }).select("+passwordHash").lean(), hashes);
    assert.equal(result.body.accounts.length, 0);
  });
});
