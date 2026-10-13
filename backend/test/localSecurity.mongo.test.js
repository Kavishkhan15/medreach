import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { AuthToken } from "../src/models/AuthToken.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { RequestNotification } from "../src/models/RequestNotification.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { signSessionToken } from "./helpers/session.js";
import { digestToken } from "../src/services/authTokenService.js";
import { configureNotificationContact } from "../src/services/notificationContacts.js";
import { routeRequestNotifications } from "../src/services/requestNotifications.js";
import { recoverRequestNotifications } from "../src/services/requestNotificationWorker.js";
import { sendEmailEvent, retryEmailDelivery, setEmailTransportFactoryForTests } from "../src/services/emailService.js";
import { guardSystemAdminMutation } from "../src/services/adminMutationGuard.js";
import { env } from "../src/config/env.js";

const uri = process.env.MEDREACH_LOCAL_SECURITY_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/medreach_local_security_test$/.test(uri));
test("local security and reliable notification regressions", { skip: !isolated, timeout: 120000 }, async (t) => {
  await mongoose.connect(uri); await mongoose.connection.dropDatabase();
  await Promise.all([User, Hospital, AuthToken, EmailDelivery, RequestNotification, ProviderMembership, EmergencyRequest].map((M) => M.init()));
  t.after(async () => { setEmailTransportFactoryForTests(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const app = createApp();
  let sequence = 0;
  async function user(role = "user", extra = {}) {
    const u = new User({ name: "Isolated security test", email: `user${++sequence}@security.test`, role, accountStatus: "active", emailVerifiedAt: new Date(), ...extra });
    if (u.accountStatus !== "pending") await u.setPassword("SecurityTestPassword123!");
    await u.save(); return u;
  }
  async function bearer(u) { return { Authorization: `Bearer ${await signSessionToken(await User.findById(u._id).select("+authVersion"))}` }; }
  const system = await user("system_admin"), hospital = await Hospital.create({ name: "Isolated security hospital", verificationStatus: "verified" });
  const pending = () => user("provider_admin", { accountStatus: "pending", emailVerifiedAt: undefined, notificationEmail: "contact@company.com" });
  async function token(u, purpose, raw) {
    await AuthToken.create({ user: u._id, purpose, tokenHash: digestToken(raw), expiresAt: new Date(Date.now() + 600000), metadata: { notificationEmail: u.notificationEmail } });
  }
  async function racePassword(u, operation) {
    const original = User.prototype.setPassword;
    User.prototype.setPassword = async function (password) {
      await original.call(this, password);
      if (String(this._id) === String(u._id)) await User.updateOne({ _id: u._id }, { $set: { notificationEmail: "new@company.com" }, $unset: { notificationEmailVerifiedAt: 1 }, $inc: { authVersion: 1 } });
    };
    try { return await operation(); } finally { User.prototype.setPassword = original; }
  }
  await t.test("activation cannot verify a contact changed during password hashing", async () => {
    const u = await pending(), raw = "a".repeat(43); await token(u, "provider_activation", raw);
    const response = await racePassword(u, () => request(app).post("/api/auth/activate-provider").send({ token: raw, password: "NewSecurityPassword123!" }));
    assert.equal(response.status, 409);
    const stored = await User.findById(u._id).select("+passwordHash");
    assert.equal(stored.accountStatus, "pending"); assert.equal(stored.passwordHash, undefined); assert.equal(stored.notificationEmailVerifiedAt, undefined);
  });
  await t.test("password recovery cannot change credentials after a concurrent contact change", async () => {
    const u = await user("provider_admin", { notificationEmail: "old@company.com", notificationEmailVerifiedAt: new Date() });
    const before = u.passwordHash, raw = "r".repeat(43); await token(u, "reset_password", raw);
    const response = await racePassword(u, () => request(app).post("/api/auth/reset-password").send({ token: raw, password: "NewSecurityPassword123!" }));
    assert.equal(response.status, 409); assert.equal((await User.findById(u._id).select("+passwordHash")).passwordHash, before);
  });
  await t.test("changing a contact revokes unused recovery/activation tokens and sessions, including old versionless records", async () => {
    const u = await pending(); await User.updateOne({ _id: u._id }, { $unset: { authVersion: 1 } });
    for (const [purpose, raw] of [["provider_activation", "b"], ["reset_password", "c"], ["refresh_session", "d"]]) await token(u, purpose, raw.repeat(43));
    await configureNotificationContact(await User.findById(u._id).select("+authVersion"), "replacement@company.com", true);
    assert.equal(await AuthToken.countDocuments({ user: u._id, purpose: { $in: ["provider_activation", "reset_password", "refresh_session"] }, revokedAt: { $exists: false } }), 0);
    assert.equal((await User.findById(u._id).select("+authVersion")).authVersion, 1);
  });
  await t.test("both account activation endpoints refuse an unaccepted provider invitation", async () => {
    const u = await pending(), auth = await bearer(system);
    assert.equal((await request(app).patch(`/api/admin/users/${u._id}/status`).set(auth).send({ status: "active" })).status, 409);
    assert.equal((await request(app).post(`/api/admin/provider-accounts/${u._id}/actions`).set(auth).send({ action: "activate" })).status, 409);
    assert.equal((await User.findById(u._id)).accountStatus, "pending");
  });
  await t.test("suspended invitation can be safely reissued without granting access", async () => {
    const u = await pending(), auth = await bearer(system);
    assert.equal((await request(app).post(`/api/admin/provider-accounts/${u._id}/actions`).set(auth).send({ action: "deactivate" })).status, 200);
    assert.equal((await request(app).post(`/api/admin/provider-accounts/${u._id}/actions`).set(auth).send({ action: "invite" })).status, 200);
    assert.equal((await User.findById(u._id)).accountStatus, "pending");
    assert.equal((await request(app).post("/api/auth/login").send({ email: u.email, password: "SecurityTestPassword123!" })).status, 401);
  });
  await t.test("protected hospital listing includes unapproved records and matches the verification queue", async () => {
    const a = await Hospital.create({ name: "Pending security hospital", approvalStatus: "pending", verificationStatus: "unverified" });
    const b = await Hospital.create({ name: "Rejected security hospital", approvalStatus: "rejected", verificationStatus: "unverified" });
    const auth = await bearer(system);
    const protectedList = await request(app).get("/api/admin/hospitals?limit=50").set(auth);
    assert.equal(protectedList.status, 200); assert.equal(protectedList.body.total, 3);
    assert.deepEqual(new Set(protectedList.body.data.map((h) => h._id)), new Set([hospital, a, b].map((h) => String(h._id))));
    const publicList = await request(app).get("/api/hospitals?limit=50"); assert.equal(publicList.body.total, 1);
    const overview = await request(app).get("/api/admin/overview").set(auth);
    assert.equal(overview.body.hospitals, 3); assert.equal(overview.body.verificationQueue, 1);
    for (const role of ["user", "provider_admin", "admin", "user_admin"]) assert.equal((await request(app).get("/api/admin/hospitals").set(await bearer(await user(role)))).status, 403);
  });
  await t.test("self-lockout and concurrent removal of all active System Admins are blocked", async () => {
    const other = await user("system_admin"), auth = await bearer(system), otherAuth = await bearer(other);
    assert.equal((await request(app).patch(`/api/admin/users/${system._id}/role`).set(auth).send({ role: "user" })).status, 409);
    assert.equal((await request(app).patch(`/api/admin/users/${system._id}/status`).set(auth).send({ status: "suspended" })).status, 409);
    const responses = await Promise.all([
      request(app).patch(`/api/admin/users/${other._id}/status`).set(auth).send({ status: "suspended" }),
      request(app).patch(`/api/admin/users/${system._id}/role`).set(otherAuth).send({ role: "user" }),
    ]);
    assert.ok(responses.some((r) => r.status !== 200)); assert.ok(await User.countDocuments({ role: "system_admin", accountStatus: "active" }) >= 1);
  });
  await t.test("pending SMTP send stays pending; recovery reconciles completion without a duplicate send", async () => {
    const prior = env.emailEnabled; env.emailEnabled = true;
    let release, ready, sends = 0;
    const started = new Promise((resolve) => { ready = resolve; }); const blocked = new Promise((resolve) => { release = resolve; });
    setEmailTransportFactoryForTests(() => ({ async sendMail() { sends++; ready(); await blocked; return { accepted: ["provider@company.com"] }; } }));
    const p = await user("provider_admin", { notificationEmail: "provider@company.com", notificationEmailVerifiedAt: new Date(), notificationsEnabled: true });
    await ProviderMembership.create({ user: p._id, kind: "hospital", organization: hospital._id, active: true, assignedBy: system._id });
    const r = await EmergencyRequest.create({ hospital: hospital._id, requestId: "MR-ISOLATED-PENDING", emergencyType: "General", requiredFacility: "ICU", contactPhone: "1234567890", isEmergency: false, expiresAt: new Date(Date.now() + 600000), notificationVersion: 1 });
    const first = routeRequestNotifications(r, "EmergencyRequest"); await started;
    try {
      await routeRequestNotifications(await EmergencyRequest.findById(r._id), "EmergencyRequest");
      assert.equal((await RequestNotification.findOne({ source: r._id })).status, "pending");
      assert.equal((await EmergencyRequest.findById(r._id)).notificationRoutedAt, undefined);
      release(); await first; await recoverRequestNotifications();
      assert.equal((await RequestNotification.findOne({ source: r._id })).status, "sent"); assert.equal(sends, 1);
    } finally { release(); env.emailEnabled = prior; setEmailTransportFactoryForTests(); }
  });
  await t.test("worker recovers a failed provider send even after source routing is marked complete", async () => {
    const prior = env.emailEnabled; env.emailEnabled = true; let fail = true, sends = 0;
    setEmailTransportFactoryForTests(() => ({ async sendMail() { sends++; if (fail) throw Object.assign(new Error("private SMTP details"), { code: "ECONNECTION" }); return { accepted: [] }; } }));
    try {
      const r = await EmergencyRequest.create({ hospital: hospital._id, requestId: "MR-ISOLATED-FAILED", emergencyType: "General", requiredFacility: "ICU", contactPhone: "1234567890", isEmergency: false, expiresAt: new Date(Date.now() + 600000), notificationVersion: 1 });
      await routeRequestNotifications(r, "EmergencyRequest");
      assert.ok((await EmergencyRequest.findById(r._id)).notificationRoutedAt);
      const intent = await RequestNotification.findOne({ source: r._id }); assert.equal(intent.status, "failed");
      await EmailDelivery.updateOne({ eventKey: intent.eventKey }, { $set: { lastAttemptAt: new Date(Date.now() - 60000) } });
      fail = false; await recoverRequestNotifications();
      assert.equal((await RequestNotification.findById(intent._id)).status, "sent"); assert.equal(sends, 2);
    } finally { env.emailEnabled = prior; setEmailTransportFactoryForTests(); }
  });
  await t.test("ambiguous SMTP outcomes are labelled uncertain and never automatically resent", async () => {
    const prior = env.emailEnabled; env.emailEnabled = true; let sends = 0;
    setEmailTransportFactoryForTests(() => ({ async sendMail() { sends++; throw Object.assign(new Error("sensitive response"), { code: "ETIMEDOUT", command: "DATA" }); } }));
    try {
      const event = { eventKey: "ambiguous-security-test", to: "approved@company.com", template: "provider_request" };
      const delivery = await sendEmailEvent(event); assert.equal(delivery.status, "uncertain");
      assert.equal((await retryEmailDelivery({ deliveryId: delivery._id })).status, 409);
      await sendEmailEvent(event); assert.equal(sends, 1); assert.ok(!delivery.lastError.includes("sensitive"));
      const expired = await EmailDelivery.create({ eventKey: "expired-security-test", recipient: "approved@company.com", subject: "Test", template: "provider_request", status: "pending", attempts: 1, leaseUntil: new Date(Date.now() - 1) });
      assert.equal((await sendEmailEvent({ ...event, eventKey: expired.eventKey })).status, "uncertain"); assert.equal(sends, 1);
    } finally { env.emailEnabled = prior; setEmailTransportFactoryForTests(); }
  });
  await t.test("notification verification rejects a change-away-and-back race", async () => {
    const u = await user("provider_admin", { notificationEmail: "contact@company.com" }), raw = "v".repeat(43);
    await token(u, "notification_email", raw);
    const original = AuthToken.findOneAndUpdate;
    AuthToken.findOneAndUpdate = function (...args) {
      const query = original.apply(this, args);
      const select = query.select.bind(query);
      query.select = function (...selection) {
        const result = select(...selection);
        const then = result.then.bind(result);
        result.then = (fulfilled, rejected) => then(async (entry) => {
          await User.updateOne({ _id: u._id }, { $inc: { authVersion: 2 } });
          return entry;
        }).then(fulfilled, rejected);
        return result;
      };
      return query;
    };
    try {
      const response = await request(app).post("/api/auth/verify-notification-email").send({ token: raw });
      assert.equal(response.status, 409); assert.equal((await User.findById(u._id)).notificationEmailVerifiedAt, undefined);
    } finally { AuthToken.findOneAndUpdate = original; }
  });
  await t.test("recovery cancels recipients whose provider assignment was revoked", async () => {
    const prior = env.emailEnabled; env.emailEnabled = true; let sends = 0;
    setEmailTransportFactoryForTests(() => ({ async sendMail() { sends++; throw Object.assign(new Error("Private SMTP response"), { code: "ECONNECTION" }); } }));
    try {
      const r = await EmergencyRequest.create({ hospital: hospital._id, requestId: "MR-REVOKED-RETRY", emergencyType: "General", requiredFacility: "ICU", contactPhone: "1234567890", isEmergency: false, expiresAt: new Date(Date.now() + 600000), notificationVersion: 1 });
      await routeRequestNotifications(r, "EmergencyRequest"); const intent = await RequestNotification.findOne({ source: r._id }); assert.equal(intent.status, "failed");
      await ProviderMembership.updateMany({ user: intent.recipient }, { $set: { active: false } });
      await EmailDelivery.updateOne({ eventKey: intent.eventKey }, { $set: { lastAttemptAt: new Date(Date.now() - 60000) } });
      await recoverRequestNotifications(); assert.equal((await RequestNotification.findById(intent._id)).status, "cancelled"); assert.equal(sends, 1);
    } finally { env.emailEnabled = prior; setEmailTransportFactoryForTests(); }
  });
  await t.test("SMTP acceptance followed by failed persistence is uncertain and cannot be resent", async () => {
    const prior = env.emailEnabled; env.emailEnabled = true; let sends = 0;
    const original = EmailDelivery.findOneAndUpdate;
    EmailDelivery.findOneAndUpdate = function (filter, update, ...options) {
      if (update?.$set?.status === "sent") throw Object.assign(new Error("Database unavailable after SMTP acceptance"), { code: "ECONNECTION" });
      return original.call(this, filter, update, ...options);
    };
    setEmailTransportFactoryForTests(() => ({ async sendMail() { sends++; return {}; } }));
    try {
      const event = { eventKey: "post-acceptance-persistence-failure", to: "approved@company.com", template: "provider_request" };
      const delivery = await sendEmailEvent(event); assert.equal(delivery.status, "uncertain");
      await sendEmailEvent(event); assert.equal(sends, 1);
    } finally { EmailDelivery.findOneAndUpdate = original; env.emailEnabled = prior; setEmailTransportFactoryForTests(); }
  });
  await t.test("invalid demo notification contacts are rejected without preparing mail", async () => {
    const u = await pending(); const before = await EmailDelivery.countDocuments();
    await assert.rejects(configureNotificationContact(u, "admin@hospital.example", true), (error) => error.status === 400);
    assert.equal(await EmailDelivery.countDocuments(), before);
  });

  await t.test("account recovery endpoints do not claim to prepare links for unavailable providers", async () => {
    const u = await pending(), auth = await bearer(await user("system_admin"));
    assert.equal((await request(app).post(`/api/admin/users/${u._id}/trigger-reset`).set(auth)).status, 409);
    assert.equal((await request(app).post(`/api/admin/provider-accounts/${u._id}/actions`).set(auth).send({ action: "reset" })).status, 409);
    assert.equal(await AuthToken.countDocuments({ user: u._id, purpose: "reset_password" }), 0);
  });

  await t.test("account writers recheck a stale System Admin actor after acquiring the lock", async () => {
    const retired = await user("user"); let wrote = false;
    await assert.rejects(guardSystemAdminMutation(retired._id, async () => { wrote = true; }), (error) => error.status === 403);
    assert.equal(wrote, false);
  });

  await t.test("retired fallback templates cannot create new administrator or provider emails", async () => {
    const before = await EmailDelivery.countDocuments();
    for (const template of ["bed_request_admin_notification", "blood_request_admin_notification", "ambulance_booking_admin_notification", "ambulance_booking_provider_notification"]) {
      const result = await sendEmailEvent({ eventKey: `retired:${template}`, to: "approved@company.com", template });
      assert.equal(result.status, "failed"); assert.equal(result.errorCode, "INVALID_EMAIL_EVENT");
    }
    assert.equal(await EmailDelivery.countDocuments(), before);
  });

});
