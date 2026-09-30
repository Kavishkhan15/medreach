import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";

const uri = process.env.MEDREACH_AUTH_TEST_MONGO_URI;
const isolated = Boolean(uri && /medreach_auth_test/.test(uri));
process.env.PUBLIC_APP_URL ||= "http://localhost:3000";

const { createApp } = await import("../src/app.js");
const { User } = await import("../src/models/User.js");
const { AuthToken } = await import("../src/models/AuthToken.js");
const { EmailDelivery } = await import("../src/models/EmailDelivery.js");
const { AuditLog } = await import("../src/models/AuditLog.js");
const { env } = await import("../src/config/env.js");
const { setEmailTransportFactoryForTests, sendEmailEvent } = await import("../src/services/emailService.js");
const { consumeAuthToken, digestToken } = await import("../src/services/authTokenService.js");

const app = createApp();
const cookie = (response, name) => response.headers["set-cookie"]?.find((value) => value.startsWith(`${name}=`))?.split(";")[0];

test("database-backed auth, admin, and SMTP security flows", { skip: !isolated, timeout: 30000 }, async (t) => {
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

  await t.test("removed sign-in routes are unavailable and passwordless legacy accounts can recover", async () => {
    const recoveryApp = createApp();
    for (const path of ["/api/auth/google", "/api/auth/google/callback"]) {
      assert.equal((await request(recoveryApp).get(path)).status, 404);
    }
    assert.equal((await request(recoveryApp).delete("/api/auth/providers/google")).status, 404);
    const legacy = await User.create({ email: "legacy@example.test", name: "Legacy Account",
      emailVerifiedAt: new Date() });
    assert.equal((await request(recoveryApp).post("/api/auth/login").send({ email: legacy.email,
      password: "UnknownPassword123" })).status, 401);
    assert.equal((await request(recoveryApp).post("/api/auth/forgot-password").send({ email: legacy.email })).status, 200);
    const resetToken = "l".repeat(43);
    await AuthToken.updateOne({ user: legacy._id, purpose: "reset_password" },
      { $set: { tokenHash: digestToken(resetToken) } });
    assert.equal((await request(recoveryApp).post("/api/auth/reset-password").send({ token: resetToken,
      password: "RecoveredPassword123" })).status, 200);
    const login = await request(recoveryApp).post("/api/auth/login").send({ email: legacy.email,
      password: "RecoveredPassword123" });
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.user.email, legacy.email);
    assert.equal((await request(recoveryApp).get("/api/auth/me").set("Cookie", cookie(login, "token"))).body.providers.password, true);
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
    assert.equal(await AuditLog.countDocuments({ action: { $in: ["login", "account_disabled", "account_enabled", "role_changed", "revoke"] } }) > 0, true);
  });
});
