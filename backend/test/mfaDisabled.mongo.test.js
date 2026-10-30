import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { PrivilegedSecurity } from "../src/models/PrivilegedSecurity.js";
import { mfaRequiredForUser } from "../src/middleware/privilegedSecurity.js";
import { validateMfaConfiguration } from "../src/config/mfaPolicy.js";

test("disabled MFA ignores legacy rollout flags while rejecting malformed explicit switches", () => {
  assert.equal(validateMfaConfiguration({ MFA_ENFORCE_PRIVILEGED: "true" }), true);
  assert.equal(validateMfaConfiguration({ MFA_ENABLED: "false", MFA_ENCRYPTION_KEY: "retained" }), true);
  assert.throws(() => validateMfaConfiguration({ MFA_ENABLED: "FALSE" }), /exactly true or false/);
});

const base = process.env.MEDREACH_PRIVILEGED_TEST_MONGO_URI;
let uri;
try {
  const parsed = new URL(base);
  if (["127.0.0.1", "localhost"].includes(parsed.hostname) && /^\/medreach_privileged_test$/.test(parsed.pathname)) {
    parsed.pathname = `/medreach_privileged_test_${randomUUID().replaceAll("-", "")}`; uri = parsed.toString();
  }
} catch { /* Only explicitly isolated test databases may be used. */ }

test("password sign-in and session refresh work for existing enrolled accounts when MFA is disabled", { skip: !uri }, async t => {
  const before = { enabled: process.env.MFA_ENABLED, enforce: process.env.MFA_ENFORCE_PRIVILEGED };
  delete process.env.MFA_ENABLED; process.env.MFA_ENFORCE_PRIVILEGED = "true";
  await mongoose.connect(uri);
  t.after(async () => {
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
    if (before.enabled === undefined) delete process.env.MFA_ENABLED; else process.env.MFA_ENABLED = before.enabled;
    if (before.enforce === undefined) delete process.env.MFA_ENFORCE_PRIVILEGED; else process.env.MFA_ENFORCE_PRIVILEGED = before.enforce;
  });
  const user = new User({ name: "Legacy enrolled admin", email: "enrolled@isolated.example", role: "system_admin", accountStatus: "active" });
  await user.setPassword("IsolatedPassword123!"); await user.save();
  const enrolled = await PrivilegedSecurity.create({ user: user._id, enabledAt: new Date(), encryptedSecret: "retained-untouched-secret" });
  assert.equal(await mfaRequiredForUser(user), false);
  const agent = request.agent(createApp());
  const login = await agent.post("/api/auth/login").send({ email: user.email, password: "IsolatedPassword123!" });
  assert.equal(login.status, 200);
  assert.equal((await agent.get("/api/auth/me")).status, 200);
  assert.equal((await agent.post("/api/auth/refresh")).status, 200);
  assert.deepEqual((await agent.get("/api/auth/mfa")).body, { enabled: false, required: false, eligible: false });
  assert.equal((await agent.post("/api/auth/mfa/enroll").send({ password: "IsolatedPassword123!" })).status, 410);
  const retained = await PrivilegedSecurity.findById(enrolled._id).select("+encryptedSecret");
  assert.equal(retained.encryptedSecret, "retained-untouched-secret");
  assert.ok(retained.enabledAt);
  assert.equal((await request(createApp()).post("/api/auth/login").send({ email: user.email, password: "IncorrectPassword" })).status, 401);
});
