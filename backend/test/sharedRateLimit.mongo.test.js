import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";
import { MongoRateLimitStore } from "../src/services/sharedRateLimitStore.js";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { issueSession, rotateSession } from "../src/services/authTokenService.js";
import { signToken } from "../src/utils/token.js";

const uri = process.env.MEDREACH_SCALING_TEST_MONGO_URI;
const isolated = (() => {
  try { const u = new URL(uri); return ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) && u.pathname === "/medreach_scaling_test"; }
  catch { return false; }
})();

test("shared rate counters survive app recreation and coordinate replicas", { skip: !isolated }, async () => {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 2000 });
  try {
    await mongoose.connection.dropDatabase();
    const make = (namespace = "login") => {
      const app = express();
      app.use(rateLimit({ windowMs: 60000, limit: 3, store: new MongoRateLimitStore({ namespace }), validate: false }));
      app.get("/", (_req, res) => res.json({ ok: true }));
      return app;
    };
    const [a,b] = [make(),make()];
    const results = await Promise.all([a,b,a,b,a,b].map(app => request(app).get("/")));
    assert.equal(results.filter(r => r.status === 200).length,3);
    assert.equal(results.filter(r => r.status === 429).length,3);
    await request(make()).get("/").expect(429);
    await request(make("registration")).get("/").expect(200);
    const rows = await mongoose.connection.collection("ratelimitbuckets").find({}).toArray();
    assert.equal(rows.length,2);
    assert.ok(rows.every(row => !row._id.includes("127.0.0.1") && row.expiresAt instanceof Date));
  } finally { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});

test("rate store reports database failures rather than allowing a request", async () => {
  const store = new MongoRateLimitStore({ namespace:"unavailable", collection: { findOneAndUpdate: async () => { throw new Error("db unavailable"); } } });
  store.init({ windowMs: 60000 });
  await assert.rejects(() => store.increment("client"), /Rate limiting temporarily unavailable/);
});

test("account login and recovery limits survive IP rotation, concurrent replicas, restart and cooldown", { skip: !isolated }, async t => {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 2000 });
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const user = new User({ email: "target@example.test", name: "Isolated Target", accountStatus: "active" });
  await user.setPassword("IsolatedSecurePhrase123!");
  await user.save();
  let now = Date.now();
  const make = () => {
    const app = createApp({ rateLimitStoreFactory: namespace => new MongoRateLimitStore({ namespace, clock: () => now }) });
    // Only this isolated fixture trusts a simulated single edge proxy.
    app.set("trust proxy", 1);
    return app;
  };
  const [a, b] = [make(), make()];
  const attempt = (app, index, email = user.email) => request(app).post("/api/auth/login")
    .set("X-Forwarded-For", `198.51.100.${index + 1}`).send({ email, password: "WrongPassword123!" });
  const responses = await Promise.all(Array.from({ length: 14 }, (_, i) => attempt(i % 2 ? a : b, i, i % 2 ? user.email.toUpperCase() : user.email)));
  assert.equal(responses.filter(res => res.status === 401).length, 10);
  assert.equal(responses.filter(res => res.status === 429).length, 4);
  const blocked = await attempt(make(), 30);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers["retry-after"]) > 0);
  assert.equal(blocked.headers["set-cookie"], undefined);
  assert.equal(blocked.headers["cache-control"], "no-store");
  // An unrelated identity and recovery remain usable; login throttling is not a permanent account lock.
  assert.equal((await attempt(a, 31, "missing@example.test")).status, 401);
  for (let i = 0; i < 4; i++) {
    const response = await request(i % 2 ? a : b).post("/api/auth/forgot-password")
      .set("X-Forwarded-For", `203.0.113.${i + 1}`).send({ email: i % 2 ? "MISSING@example.test" : "missing@example.test" });
    assert.equal(response.status, i < 3 ? 200 : 429);
  }
  const rows = await mongoose.connection.collection("ratelimitbuckets").find({}).toArray();
  assert.ok(rows.some(row => row._id.startsWith("login-account:")));
  assert.ok(rows.every(row => !/@|198\.51\./.test(row._id)));
  now += 15 * 60 * 1000;
  assert.equal((await attempt(make(), 32)).status, 401);
  assert.equal(await User.countDocuments({ _id: user._id, accountStatus: "active" }), 1);
  const { entry, token: refreshToken } = await issueSession(user, {});
  const token = signToken(user, entry.familyId);
  // Changing IP or alternating endpoints must not bypass authenticated password/MFA guessing limits.
  for (let i = 0; i < 10; i++) {
    const response = await request(i % 2 ? a : b).put("/api/auth/password")
      .set("Authorization", `Bearer ${token}`).set("X-Forwarded-For", `192.0.2.${i + 1}`)
      .send({ currentPassword: "WrongPassword123!", newPassword: "DistinctNextPassword123!" });
    assert.equal(response.status, 400);
  }
  for (const path of ["reauthenticate", "mfa/enroll", "mfa/recovery-codes"]) {
    await request(make()).post(`/api/auth/${path}`).set("Authorization", `Bearer ${token}`)
      .set("X-Forwarded-For", "192.0.2.30").send({ password: "WrongPassword123!" }).expect(429);
  }
  // Explicit demo credential classification is sufficient to deny access even
  // if a legacy record has lost its separate demoAccount marker.
  await User.updateOne({ _id: user._id }, { $set: { credentialState: "demo_default", demoAccount: false } });
  await request(make()).get("/api/auth/me").set("Authorization", `Bearer ${token}`).expect(401);
  assert.ok((await rotateSession(refreshToken, {})).error);
  await request(make()).post("/api/auth/login").set("X-Forwarded-For", "192.0.2.40")
    .send({ email: user.email, password: "IsolatedSecurePhrase123!" }).expect(401);
  // New-password validation must not silently invalidate an existing legacy password.
  const legacy = new User({ email: "legacy@example.test", name: "Legacy Fixture", accountStatus: "active" });
  await legacy.setPassword("Password123456!");
  await legacy.save();
  const legacyLogin = await request(make()).post("/api/auth/login").set("X-Forwarded-For", "192.0.2.41")
    .send({ email: legacy.email, password: "Password123456!" });
  assert.equal(legacyLogin.status, 200);
  assert.ok(legacyLogin.headers["set-cookie"]?.some(value => value.startsWith("token=")));
});

test("account protection failure is closed before credential lookup", async t => {
  let lookups = 0;
  t.mock.method(User, "findOne", () => { lookups++; throw new Error("Unexpected credential lookup"); });
  // All stores are non-network fakes here, specifically failing the second/account layer.
  const app = createApp({ rateLimitStoreFactory: namespace => new MongoRateLimitStore({ namespace, collection: {
    findOneAndUpdate: async () => {
      if (namespace === "login-account") throw new Error("database interrupted");
      return { totalHits: 1, resetTime: new Date(Date.now() + 60000) };
    },
  } }) });
  const response = await request(app).post("/api/auth/login").send({ email: "target@example.test", password: "WrongPassword123!" });
  assert.equal(response.status, 503);
  assert.equal(response.headers["retry-after"], "1");
  assert.equal(response.headers["set-cookie"], undefined);
  assert.equal(lookups, 0);
});
