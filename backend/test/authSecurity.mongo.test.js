import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { generateKeyPairSync } from "node:crypto";

const uri = process.env.MEDREACH_AUTH_TEST_MONGO_URI;
const isolated = Boolean(uri && /medreach_auth_test/.test(uri));
process.env.GOOGLE_CLIENT_ID ||= "mongo-test-google-client";
process.env.GOOGLE_CLIENT_SECRET ||= "mongo-test-google-secret";
process.env.GOOGLE_CALLBACK_URL ||= "http://localhost:4000/api/auth/google/callback";
process.env.PUBLIC_APP_URL ||= "http://localhost:3000";

const { createApp } = await import("../src/app.js");
const { User } = await import("../src/models/User.js");
const { AuthToken } = await import("../src/models/AuthToken.js");
const { EmailDelivery } = await import("../src/models/EmailDelivery.js");
const { AuditLog } = await import("../src/models/AuditLog.js");
const { env } = await import("../src/config/env.js");
const { setEmailTransportFactoryForTests, sendEmailEvent } = await import("../src/services/emailService.js");
const { consumeAuthToken, digestToken } = await import("../src/services/authTokenService.js");
const { resetGoogleJwksCacheForTests } = await import("../src/services/googleOidcService.js");
const jwt = (await import("jsonwebtoken")).default;

const app = createApp();
const cookie = (response, name) => response.headers["set-cookie"]?.find((value) => value.startsWith(`${name}=`))?.split(";")[0];

test("database-backed auth, OAuth, admin, and SMTP security flows", { skip: !isolated, timeout: 30000 }, async (t) => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  t.after(async () => { setEmailTransportFactoryForTests(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  await t.test("register, verify, refresh rotation/replay, reset/change and logout", async () => {
    const agent = request.agent(app);
    const registration = await agent.post("/api/auth/register").send({ name: "Patient One", email: "patient@example.test", password: "StrongPassword123" });
    assert.equal(registration.status, 202);
    assert.equal("token" in registration.body, false);
    assert.equal(JSON.stringify(registration.body).includes("passwordHash"), false);
    assert.equal(cookie(registration, "token"), undefined);
    const duplicate = await request(app).post("/api/auth/register").send({ name: "Different Name", email: "patient@example.test", password: "DifferentPass123" });
    assert.equal(duplicate.status, registration.status); assert.deepEqual(duplicate.body, registration.body);
    assert.equal("verificationLink" in registration.body, false);
    const verificationToken = "v".repeat(43);
    await AuthToken.updateOne({ purpose: "verify_email" }, { $set: { tokenHash: digestToken(verificationToken) } });
    assert.equal((await agent.post("/api/auth/verify-email").send({ token: verificationToken })).status, 200);
    assert.equal((await agent.post("/api/auth/verify-email").send({ token: verificationToken })).status, 400);
    const initialLogin = await agent.post("/api/auth/login").send({ email: "patient@example.test", password: "StrongPassword123" });
    assert.equal(initialLogin.body.user.regionOnboardingRequired, true);
    assert.equal((await agent.put("/api/auth/profile").send({ region: "   " })).status, 400);
    const completedProfile = await agent.put("/api/auth/profile").send({ region: "Western Suburbs" });
    assert.equal(completedProfile.status, 200);
    assert.equal(completedProfile.body.user.regionOnboardingRequired, false);
    const originalRefresh = cookie(initialLogin, "refresh_token"); assert.ok(originalRefresh);
    const refreshed = await agent.post("/api/auth/refresh");
    assert.equal(refreshed.status, 200);
    assert.notEqual(cookie(refreshed, "refresh_token"), originalRefresh);
    const replay = await request(app).post("/api/auth/refresh").set("Cookie", originalRefresh);
    assert.equal(replay.status, 401);
    assert.equal(await AuthToken.countDocuments({ purpose: "refresh_session", revokeReason: "replay_detected" }) > 0, true);

    const forgot = await request(app).post("/api/auth/forgot-password").send({ email: "patient@example.test" });
    const missing = await request(app).post("/api/auth/forgot-password").send({ email: "missing@example.test" });
    assert.equal(missing.body.message, forgot.body.message); assert.equal("resetLink" in missing.body, false);
    assert.equal("resetLink" in forgot.body, false);
    const resetToken = "r".repeat(43);
    await AuthToken.updateOne({ purpose: "reset_password", usedAt: { $exists: false } }, { $set: { tokenHash: digestToken(resetToken) } });
    assert.equal((await request(app).post("/api/auth/reset-password").send({ token: resetToken, password: "ChangedPassword123" })).status, 200);
    assert.equal((await request(app).post("/api/auth/reset-password").send({ token: resetToken, password: "ChangedAgain123" })).status, 400);
    const login = await agent.post("/api/auth/login").send({ email: "patient@example.test", password: "ChangedPassword123" });
    assert.equal(login.status, 200);
    const changed = await agent.put("/api/auth/password").send({ currentPassword: "ChangedPassword123", newPassword: "FinalPassword123" });
    assert.equal(changed.status, 200); assert.equal(changed.body.signedOut, true);
    assert.equal((await agent.get("/api/auth/me")).status, 401);
    const finalLogin = await agent.post("/api/auth/login").send({ email: "patient@example.test", password: "FinalPassword123" });
    assert.equal(finalLogin.status, 200);
    const copiedAccess = cookie(finalLogin, "token");
    assert.equal((await agent.post("/api/auth/logout")).status, 200);
    assert.equal((await agent.get("/api/auth/me")).status, 401);
    assert.equal((await request(app).get("/api/auth/me").set("Cookie", copiedAccess)).status, 401);
    const expiredRaw = "x".repeat(43);
    await AuthToken.create({ user: (await User.findOne({ email: "patient@example.test" }))._id,
      purpose: "reset_password", tokenHash: digestToken(expiredRaw), expiresAt: new Date(Date.now() - 1000) });
    assert.equal(await consumeAuthToken(expiredRaw, "reset_password"), null);
  });

  await t.test("Google create/login/collision/link/unlink, invalid and reused state", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }); Object.assign(jwk, { kid: "mongo-key", use: "sig", alg: "RS256" });
    let identity = { sub: "google-new", email: "google@example.test", name: "Google Person" };
    let currentNonce = "";
    global.fetch = async (url) => {
      if (String(url).includes("/certs")) return { ok: true, json: async () => ({ keys: [jwk] }) };
      const idToken = jwt.sign({ ...identity, email_verified: true, nonce: currentNonce }, privateKey,
        { algorithm: "RS256", keyid: "mongo-key", issuer: "https://accounts.google.com",
          audience: process.env.GOOGLE_CLIENT_ID, expiresIn: "5m" });
      return { ok: true, json: async () => ({ id_token: idToken, access_token: "must-not-store", refresh_token: "must-not-store" }) };
    };
    const start = await request(app).get("/api/auth/google?returnTo=%2Fjobs%2F507f1f77bcf86cd799439011"); assert.equal(start.status, 302);
    const stateValue = new URL(start.headers.location).searchParams.get("state");
    const stateDoc = await AuthToken.findOne({ purpose: "oauth_state" }).select("+metadata"); currentNonce = stateDoc.metadata.nonce;
    assert.equal(stateDoc.metadata.returnTo, "/jobs/507f1f77bcf86cd799439011");
    resetGoogleJwksCacheForTests();
    const callback = await request(app).get(`/api/auth/google/callback?state=${stateValue}&code=test-code`);
    assert.equal(callback.status, 302); assert.match(callback.headers.location, /status=success/);
    const newAccountResult = new URL(callback.headers.location);
    assert.equal(newAccountResult.searchParams.get("returnTo"), "/jobs/507f1f77bcf86cd799439011");
    assert.equal(newAccountResult.searchParams.get("accountCreated"), "true");
    assert.equal(newAccountResult.searchParams.get("regionOnboardingRequired"), "true");
    const googleUser = await User.findOne({ email: "google@example.test" }).select("+googleSubject +passwordHash");
    assert.equal(googleUser.googleSubject, "google-new"); assert.equal(googleUser.passwordHash, undefined);
    assert.equal(JSON.stringify(await AuthToken.find().lean()).includes("must-not-store"), false);
    assert.match((await request(app).get(`/api/auth/google/callback?state=${stateValue}&code=test-code`)).headers.location, /invalid_state/);
    assert.match((await request(app).get("/api/auth/google/callback?state=invalid&code=x")).headers.location, /invalid_state/);
    const deniedStart = await request(app).get("/api/auth/google");
    const deniedState = new URL(deniedStart.headers.location).searchParams.get("state");
    assert.match((await request(app).get(`/api/auth/google/callback?state=${deniedState}&error=access_denied`)).headers.location, /status=denied/);
    assert.match((await request(app).get(`/api/auth/google/callback?state=${deniedState}&code=test-code`)).headers.location, /invalid_state/);
    const linkedLoginStart = await request(app).get("/api/auth/google");
    const linkedLoginState = new URL(linkedLoginStart.headers.location).searchParams.get("state");
    currentNonce = (await AuthToken.findOne({ purpose: "oauth_state", usedAt: { $exists: false } }).sort({ createdAt: -1 }).select("+metadata")).metadata.nonce;
    resetGoogleJwksCacheForTests();
    const existingCallback = await request(app).get(`/api/auth/google/callback?state=${linkedLoginState}&code=test-code`);
    assert.match(existingCallback.headers.location, /status=success/);
    assert.equal(new URL(existingCallback.headers.location).searchParams.get("accountCreated"), "false");
    assert.equal(new URL(existingCallback.headers.location).searchParams.get("regionOnboardingRequired"), "true");
    assert.equal(await User.countDocuments({ email: "google@example.test" }), 1);

    const collision = new User({ email: "collision@example.test", name: "Collision" }); await collision.setPassword("CollisionPass123"); await collision.save();
    identity = { sub: "collision-google", email: collision.email, name: "Collision" };
    const collisionStart = await request(app).get("/api/auth/google");
    const collisionState = new URL(collisionStart.headers.location).searchParams.get("state");
    currentNonce = (await AuthToken.findOne({ tokenHash: { $exists: true }, purpose: "oauth_state", usedAt: { $exists: false } }).sort({ createdAt: -1 }).select("+metadata")).metadata.nonce;
    resetGoogleJwksCacheForTests();
    const collisionCallback = await request(app).get(`/api/auth/google/callback?state=${collisionState}&code=test-code`);
    assert.match(collisionCallback.headers.location, /email_exists/);
    assert.equal((await User.findById(collision._id).select("+googleSubject")).googleSubject, undefined);

    const passwordAgent = request.agent(app);
    assert.equal((await passwordAgent.post("/api/auth/login").send({ email: collision.email, password: "CollisionPass123" })).status, 200);
    const linkStart = await passwordAgent.get("/api/auth/google?flow=link&confirm=link-google"); assert.equal(linkStart.status, 302);
    const linkState = new URL(linkStart.headers.location).searchParams.get("state");
    currentNonce = (await AuthToken.findOne({ purpose: "oauth_state", usedAt: { $exists: false } }).sort({ createdAt: -1 }).select("+metadata")).metadata.nonce;
    resetGoogleJwksCacheForTests();
    assert.match((await passwordAgent.get(`/api/auth/google/callback?state=${linkState}&code=test-code`)).headers.location, /status=linked/);
    assert.equal(Boolean((await User.findById(collision._id).select("+googleSubject")).googleSubject), true);
    assert.equal((await passwordAgent.delete("/api/auth/providers/google").send({ confirm: "UNLINK" })).status, 200);
    assert.equal((await User.findById(collision._id).select("+googleSubject")).googleSubject, undefined);
    assert.equal((await request(app).delete("/api/auth/providers/google").set("Cookie", cookie(callback, "token") || "").send({ confirm: "UNLINK" })).status, 409);
  });

  await t.test("system admin user controls are RBAC-safe and invalidate sessions", async () => {
    const admin = new User({ email: "admin@example.test", name: "Admin", role: "system_admin", emailVerifiedAt: new Date() });
    await admin.setPassword("AdminPassword123"); await admin.save();
    const adminAgent = request.agent(app); assert.equal((await adminAgent.post("/api/auth/login").send({ email: admin.email, password: "AdminPassword123" })).status, 200);
    const target = await User.findOne({ email: "patient@example.test" }).select("+authVersion");
    assert.equal((await adminAgent.get("/api/admin/users")).status, 200);
    assert.equal((await adminAgent.patch(`/api/admin/users/${target._id}/status`).send({ status: "suspended" })).status, 200);
    assert.equal((await request(app).post("/api/auth/login").send({ email: target.email, password: "FinalPassword123" })).status, 401);
    assert.equal((await adminAgent.patch(`/api/admin/users/${target._id}/status`).send({ status: "active" })).status, 200);
    assert.equal((await adminAgent.patch(`/api/admin/users/${target._id}/role`).send({ role: "hospital_admin" })).status, 200);
    const hospitalLogin = await request(app).post("/api/auth/login").send({ email: target.email, password: "FinalPassword123" });
    assert.equal(hospitalLogin.status, 200);
    assert.equal((await request(app).get("/api/admin/users").set("Cookie", cookie(hospitalLogin, "token"))).status, 403);
    assert.equal((await adminAgent.post(`/api/admin/users/${target._id}/revoke-sessions`)).status, 200);
    assert.equal((await adminAgent.post(`/api/admin/users/${target._id}/trigger-reset`)).status, 200);
    assert.equal((await adminAgent.post(`/api/admin/users/${target._id}/resend-verification`)).status, 200);
    assert.equal((await adminAgent.patch(`/api/admin/users/${admin._id}/status`).send({ status: "suspended" })).status, 409);
  });

  await t.test("email disabled/success/auth/connection failures are recorded without leaking credentials", async () => {
    const original = { enabled: env.emailEnabled, host: env.smtpHost, from: env.smtpFrom, user: env.smtpUser, password: env.smtpPassword };
    env.emailEnabled = false;
    const disabled = await sendEmailEvent({ eventKey: "email-disabled", to: "recipient@example.test", template: "admin_security", data: { message: "test" } });
    assert.equal(disabled.status, "disabled");
    env.emailEnabled = true; env.smtpHost = "smtp.example.test"; env.smtpFrom = "sender@example.test"; env.smtpUser = "secret-user"; env.smtpPassword = "secret-password";
    setEmailTransportFactoryForTests(() => ({ sendMail: async () => ({ messageId: "ok" }) }));
    assert.equal((await sendEmailEvent({ eventKey: "email-success", to: "recipient@example.test", template: "admin_security" })).status, "sent");
    setEmailTransportFactoryForTests(() => ({ sendMail: async () => { const error = new Error("secret-password"); error.code = "EAUTH"; throw error; } }));
    const authFailure = await sendEmailEvent({ eventKey: "email-auth-failure", to: "recipient@example.test", template: "admin_security" });
    assert.equal(authFailure.errorCode, "EAUTH"); assert.equal(JSON.stringify(authFailure).includes("secret-password"), false);
    setEmailTransportFactoryForTests(() => ({ sendMail: async () => { const error = new Error("smtp.example.test secret-user"); error.code = "ETIMEDOUT"; throw error; } }));
    const timeout = await sendEmailEvent({ eventKey: "email-timeout", to: "recipient@example.test", template: "admin_security" });
    assert.equal(timeout.errorCode, "ETIMEDOUT"); assert.equal(JSON.stringify(timeout).includes("secret-user"), false);
    Object.assign(env, { emailEnabled: original.enabled, smtpHost: original.host, smtpFrom: original.from,
      smtpUser: original.user, smtpPassword: original.password });
    assert.equal(await AuditLog.countDocuments({ action: { $in: ["login", "oauth_login", "provider_linked", "provider_unlinked", "account_disabled", "account_enabled", "role_changed", "revoke"] } }) > 0, true);
  });
});
