// Exercise the retained opt-in compatibility path, not the product default.
process.env.MFA_ENABLED = "true";
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { PrivilegedSecurity } from "../src/models/PrivilegedSecurity.js";
import { User } from "../src/models/User.js";
import { AuthToken } from "../src/models/AuthToken.js";
import { encryptMfaSecret, newMfaSecret, newRecoveryCodes, totp } from "../src/services/mfaCrypto.js";
import { verifyAndConsumeMfa } from "../src/services/privilegedMfaService.js";
import { issueSession, rotateSession } from "../src/services/authTokenService.js";
import { signToken } from "../src/utils/token.js";
import { createApp } from "../src/app.js";
const base = process.env.MEDREACH_PRIVILEGED_TEST_MONGO_URI;
// Never use the supplied database itself: create a unique isolated database.
let uri;
try { const parsed = new URL(base); if (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) && /^\/medreach_privileged_test(?:_[a-z0-9]+)*$/.test(parsed.pathname)) { parsed.pathname = `/medreach_privileged_test_${randomUUID().replaceAll("-", "")}`; uri = parsed.toString(); } } catch {}
test("real database MFA concurrency and enforced password-only login denial", { skip: !uri, timeout: 30000 }, async (t) => {
  const key = process.env.MFA_ENCRYPTION_KEY, enforcement = process.env.MFA_ENFORCE_PRIVILEGED;
  process.env.MFA_ENCRYPTION_KEY = "9".repeat(64); process.env.MFA_ENFORCE_PRIVILEGED = "true";
  await mongoose.connect(uri);
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect();
    if (key === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = key;
    if (enforcement === undefined) delete process.env.MFA_ENFORCE_PRIVILEGED; else process.env.MFA_ENFORCE_PRIVILEGED = enforcement;
  });
  await PrivilegedSecurity.init();
  const user = new User({ email: "privileged@example.test", name: "Privileged Test", role: "system_admin", accountStatus: "active" });
  await user.setPassword("IsolatedPassword123!"); await user.save();
  const secret = newMfaSecret(), recovery = newRecoveryCodes();
  await PrivilegedSecurity.create({ user: user._id, encryptedSecret: encryptMfaSecret(secret), enabledAt: new Date(), lastStep: -1, recoveryHashes: recovery.hashes });
  await t.test("one winner for recovery-code race", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => verifyAndConsumeMfa(user._id, { recoveryCode: recovery.codes[0] })));
    assert.equal(results.filter(Boolean).length, 1);
  });
  await t.test("one winner for TOTP race", async () => {
    const code = totp(secret, Math.floor(Date.now() / 30000));
    const results = await Promise.all(Array.from({ length: 8 }, () => verifyAndConsumeMfa(user._id, { code })));
    assert.equal(results.filter(Boolean).length, 1);
  });
  const app = createApp();
  await t.test("enrolled MFA remains mandatory while global enrollment enforcement is disabled", async () => {
    process.env.MFA_ENFORCE_PRIVILEGED = "false";
    try {
      const denied = await request(app).post("/api/auth/login").send({ email: user.email, password: "IsolatedPassword123!" });
      assert.equal(denied.status, 401); assert.equal(denied.body.code, "MFA_REQUIRED");
      const legacy = await issueSession(user);
      assert.equal((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${signToken(user, legacy.entry.familyId)}`)).status, 401);
      assert.equal((await rotateSession(legacy.token)).error, "invalid");
      const accepted = await request(app).post("/api/auth/login").send({ email: user.email, password: "IsolatedPassword123!", recoveryCode: recovery.codes[5] });
      assert.equal(accepted.status, 200);
      const accessCookie = accepted.headers["set-cookie"].find(value => value.startsWith("token=")).split(";")[0];
      const sensitive = await request(app).post("/api/admin/provider-accounts/manual-provision").set("Cookie", accessCookie).send({});
      assert.equal(sensitive.status, 403); assert.equal(sensitive.body.code, "REAUTHENTICATION_REQUIRED");
      await AuthToken.deleteMany({ user: user._id });
    } finally { process.env.MFA_ENFORCE_PRIVILEGED = "true"; }
  });
  await t.test("existing password-only sessions cannot bypass enforcement", async () => {
    const old = await issueSession(user);
    const denied = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${signToken(user, old.entry.familyId)}`);
    assert.equal(denied.status, 401);
    const rotated = await rotateSession(old.token);
    assert.equal(rotated.error, "invalid");
    await AuthToken.deleteMany({ user: user._id });
  });
  await t.test("password-only login creates no session and MFA login is accepted", async () => {
    const rejected = await request(app).post("/api/auth/login").send({ email: user.email, password: "IsolatedPassword123!" });
    assert.equal(rejected.status, 401); assert.equal(rejected.body.code, "MFA_REQUIRED");
    assert.equal(await AuthToken.countDocuments({ user: user._id, purpose: "refresh_session" }), 0);
    const accepted = await request(app).post("/api/auth/login").send({ email: user.email, password: "IsolatedPassword123!", recoveryCode: recovery.codes[1] });
    assert.equal(accepted.status, 200);
    const session = await AuthToken.findOne({ user: user._id, purpose: "refresh_session" }).select("+metadata");
    assert.equal(session.metadata.mfaAuthenticated, true);
    const refreshCookie = accepted.headers["set-cookie"].find(value => value.startsWith("refresh_token=")).split(";")[0];
    const rotated = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie);
    assert.equal(rotated.status, 200);
    const active = await AuthToken.findOne({ user: user._id, usedAt: { $exists: false }, revokedAt: { $exists: false } }).select("+metadata");
    assert.equal(active.metadata.mfaAuthenticated, true);
    assert.ok(!JSON.stringify(accepted.body).includes("recoveryHashes"));
    const accessCookie = accepted.headers["set-cookie"].find(value => value.startsWith("token=")).split(";")[0];
    const reenroll = await request(app).post("/api/auth/mfa/enroll").set("Cookie", accessCookie).send({ password: "IsolatedPassword123!" });
    assert.equal(reenroll.status, 409);
    assert.equal(reenroll.body.secret, undefined);
    const replacement = await request(app).post("/api/auth/mfa/recovery-codes").set("Cookie", accessCookie).send({ password: "IsolatedPassword123!", recoveryCode: recovery.codes[2] });
    assert.equal(replacement.status, 200);
    assert.equal(replacement.body.signedOut, true);
    assert.equal((await request(app).get("/api/auth/me").set("Cookie", accessCookie)).status, 401);
    assert.equal((await User.findById(user._id).select("+authVersion")).authVersion, 1);
    assert.equal(await verifyAndConsumeMfa(user._id, { recoveryCode: recovery.codes[3] }), false);
    assert.equal(await verifyAndConsumeMfa(user._id, { recoveryCode: replacement.body.recoveryCodes[0] }), true);
  });
});
