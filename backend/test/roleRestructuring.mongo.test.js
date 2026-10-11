import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { ProviderApplication } from "../src/models/ProviderApplication.js";
import { AuthToken } from "../src/models/AuthToken.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { RequestNotification } from "../src/models/RequestNotification.js";
import { signSessionToken } from "./helpers/session.js";
import { isolatedDemoEnabled, setDemoPassword } from "../src/services/demoAccounts.js";
import { notificationRecipients } from "../src/services/requestNotifications.js";
import { digestToken } from "../src/services/authTokenService.js";
import { roleInventory } from "../scripts/roleInventory.js";
import { guardAdminMutation } from "../src/services/adminMutationGuard.js";
import { requestRouting } from "../src/services/requestNotifications.js";
import { env } from "../src/config/env.js";
const uri = process.env.MEDREACH_ROLE_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/medreach_roles_test$/.test(uri));
test("three-role permissions, provisioning, assignments and notification routing", { skip: !isolated, timeout: 90000 }, async (t) => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([User, Hospital, ProviderMembership, ProviderApplication, RequestNotification, EmailDelivery].map((Model) => Model.init()));
  const app = createApp();
  async function makeUser(role, email) {
    const user = new User({ name: role, email, role, accountStatus: "active", emailVerifiedAt: new Date() });
    await user.setPassword("StrongTestPassword123"); await user.save(); return user;
  }
  const system = await makeUser("system_admin", "system@roles.test"), support = await makeUser("user_admin", "support@roles.test"), patient = await makeUser("user", "patient@roles.test");
  let systemToken = await signSessionToken(system); const supportToken = await signSessionToken(support);
  const bearer = (token) => ({ Authorization: `Bearer ${token}` });
  const hospital = await Hospital.create({ name: "Role hospital", verificationStatus: "verified" });
  const otherHospital = await Hospital.create({ name: "Other role hospital", verificationStatus: "verified" });
  const providers = await ResourceProvider.create(["blood_bank", "diagnostic", "ambulance"].map((kind) => ({ name: `Role ${kind}`, kind, verificationStatus: "verified", sourceName: "Isolated test" })));
  let provider, providerToken;
  await t.test("System Admin demo credentials are hashed and isolated", async () => {
    const demo = new User({ email: "admin@medreach.com", name: "Demo System", role: "system_admin" });
    assert.equal(isolatedDemoEnabled(), true); await setDemoPassword(demo); await demo.save();
    const stored = await User.findById(demo._id).select("+passwordHash");
    assert.equal(stored.passwordHash.includes("Admin@medreach786"), false);
    assert.equal((await request(app).post("/api/auth/login").send({ email: demo.email, password: "Admin@medreach786" })).status, 200);
    await User.deleteOne({ _id: demo._id });
  });
  await t.test("Retired User Admin has no administrative permissions", async () => {
    const list = await request(app).get("/api/admin/users?role=system_admin").set(bearer(supportToken));
    assert.equal(list.status, 403);
    for (const path of [`/api/admin/users/${system._id}`, "/api/admin/provider-accounts", "/api/admin/overview"]) assert.equal((await request(app).get(path).set(bearer(supportToken))).status, 403);
    for (const path of ["trigger-reset", "revoke-sessions", "resend-verification"]) assert.equal((await request(app).post(`/api/admin/users/${system._id}/${path}`).set(bearer(supportToken))).status, 403);
    assert.equal((await request(app).patch(`/api/admin/users/${system._id}/status`).set(bearer(supportToken)).send({ status: "suspended" })).status, 403);
    assert.equal((await request(app).patch(`/api/admin/users/${patient._id}/role`).set(bearer(supportToken)).send({ role: "system_admin" })).status, 403);
    assert.equal((await request(app).post(`/api/admin/hospitals/${hospital._id}/verify`).set(bearer(supportToken)).send({ decision: "verify" })).status, 403);
    assert.equal((await request(app).post(`/api/admin/users/${patient._id}/trigger-reset`).set(bearer(supportToken))).status, 403);
  });
  await t.test("Provider demo provisioning covers all categories and preserves existing accounts", async () => {
    for (const org of [{ ...hospital.toObject(), kind: "hospital" }, ...providers.map((p) => p.toObject())]) {
      const response = await request(app).post("/api/admin/provider-accounts").set(bearer(systemToken)).send({ kind: org.kind, organizationId: org._id, demo: true });
      assert.equal(response.status, 201, JSON.stringify(response.body));
      assert.match(response.body.account.email, /^admin@.+\.example$/);
      assert.equal(response.body.account.credentialLabel, "Demo default: Provider@medreach786");
      assert.equal(response.body.account.organizations[0].organizationId, String(org._id));
      const stored = await User.findById(response.body.account._id).select("+passwordHash");
      assert.equal(stored.passwordHash.includes("Provider@medreach786"), false);
      if (org.kind === "hospital") provider = stored;
    }
    providerToken = await signSessionToken(provider);
    const before = provider.passwordHash;
    const duplicate = await request(app).post("/api/admin/provider-accounts").set(bearer(systemToken)).send({ kind: "hospital", organizationId: hospital._id, loginEmail: provider.email, demo: true });
    assert.equal(duplicate.status, 409); assert.equal((await User.findById(provider._id).select("+passwordHash")).passwordHash, before);
  });
  await t.test("Demo defaults are rejected outside the isolated database and when email is enabled", async () => {
    const prior = env.emailEnabled; env.emailEnabled = true;
    try {
      assert.equal((await request(app).post("/api/auth/login").send({ email: provider.email, password: "Provider@medreach786" })).status, 401);
      assert.equal((await request(app).get("/api/providers/mine").set(bearer(providerToken))).status, 401);
      assert.equal((await request(app).post("/api/admin/provider-accounts").set(bearer(systemToken)).send({ kind: "hospital", organizationId: otherHospital._id, demo: true })).status, 403); }
    finally { env.emailEnabled = prior; }
  });
  await t.test("Assignments scope all provider categories and cannot grant global approval", async () => {
    assert.equal((await request(app).put(`/api/hospitals/${otherHospital._id}`).set(bearer(providerToken)).send({ phone: "123" })).status, 403);
    assert.equal((await request(app).post(`/api/admin/hospitals/${hospital._id}/verify`).set(bearer(providerToken)).send({ decision: "verify" })).status, 403);
    assert.equal((await request(app).get("/api/admin/users").set(bearer(providerToken))).status, 403);
    for (const org of providers) assert.equal((await request(app).patch(`/api/admin/resources/${org._id}`).set(bearer(providerToken)).send({ phone: "123" })).status, 403);
    assert.equal((await request(app).post(`/api/admin/provider-accounts/${provider._id}/assignments`).set(bearer(systemToken)).send({ kind: "blood_bank", organizationId: providers[0]._id })).status, 200);
    providerToken = await signSessionToken(await User.findById(provider._id).select("+authVersion"));
    assert.equal((await request(app).patch(`/api/admin/resources/${providers[0]._id}`).set(bearer(providerToken)).send({ phone: "123", verificationStatus: "rejected", hospital: otherHospital._id })).status, 200);
    assert.equal((await ResourceProvider.findById(providers[0]._id)).verificationStatus, "verified");
    const mine = await request(app).get("/api/providers/mine").set(bearer(providerToken)); assert.equal(mine.body.data.length, 2);
  });
  await t.test("Assignment lookup outages fail closed as unavailable, not as expired authentication", async () => {
    const original = ProviderMembership.find;
    ProviderMembership.find = () => ({ lean: async () => { throw new Error("Isolated assignment outage"); } });
    try {
      const unavailable = await request(app).get("/api/providers/mine").set(bearer(providerToken));
      assert.equal(unavailable.status, 503); assert.equal("data" in unavailable.body, false);
    } finally { ProviderMembership.find = original; }
  });
  await t.test("Legacy admin loses global privileges; hospital compatibility never migrates accounts", async () => {
    const legacy = await makeUser("admin", "legacy@roles.test"), staff = await makeUser("hospital_admin", "staff@roles.test");
    await Hospital.updateOne({ _id: otherHospital._id }, { $addToSet: { admins: staff._id } });
    assert.equal((await request(app).get("/api/admin/overview").set(bearer(await signSessionToken(legacy)))).status, 403);
    const mine = await request(app).get("/api/providers/mine").set(bearer(await signSessionToken(staff)));
    assert.equal(mine.body.data.length, 1); assert.equal((await User.findById(staff._id)).role, "hospital_admin");
  });
  await t.test("Changing a demo password reports custom without disclosing it", async () => {
    const changed = await request(app).put("/api/auth/password").set(bearer(providerToken)).send({ currentPassword: "Provider@medreach786", newPassword: "PersonalPassword123" });
    assert.equal(changed.status, 200);
    const list = await request(app).get("/api/admin/provider-accounts").set(bearer(systemToken));
    assert.equal(list.body.data.find((r) => r._id === String(provider._id)).credentialLabel, "Custom password set");
    assert.equal(JSON.stringify(list.body).includes("PersonalPassword123"), false);
    providerToken = await signSessionToken(await User.findById(provider._id).select("+authVersion"));
  });
  await t.test("Only active configured System Admins get emergencies; ordinary requests reach providers only", async () => {
    for (const user of [system, provider]) await User.updateOne({ _id: user._id }, { $set: { notificationsEnabled: true, notificationEmail: `${user._id}@company.com`, notificationEmailVerifiedAt: new Date() } });
    await User.updateOne({ _id: support._id }, { $set: { notificationsEnabled: true, notificationEmail: "support@company.com", notificationEmailVerifiedAt: new Date() } });
    assert.deepEqual((await notificationRecipients("hospital", hospital._id, false)).map((r) => r.channel), ["provider"]);
    const emergency = await notificationRecipients("hospital", hospital._id, true); assert.deepEqual(emergency.map((r) => r.channel).sort(), ["provider", "system"]);
    const body = { hospitalId: hospital._id, emergencyType: "General", requiredFacility: "ICU", contactPhone: "+919876543210", isEmergency: false };
    const normal = await request(app).post("/api/emergency-requests").set(bearer(await signSessionToken(patient))).send(body); assert.equal(normal.status, 201);
    assert.equal(await RequestNotification.countDocuments({ source: normal.body.request._id, channel: "system" }), 0);
    assert.equal(await RequestNotification.countDocuments({ source: normal.body.request._id, channel: "provider" }), 1);
    const urgent = await request(app).post("/api/emergency-requests").send({ ...body, isEmergency: true }); assert.equal(urgent.status, 201);
    assert.equal(await RequestNotification.countDocuments({ source: urgent.body.request._id, channel: "system" }), 1);
  });
  await t.test("Standalone provider careers require the correct assignment and keep publication moderated", async () => {
    const payload = { provider: providers[0]._id, title: "Blood bank technician", category: "Technician", description: "A real isolated test job description", employmentType: "full_time" };
    const draft = await request(app).post("/api/jobs").set(bearer(providerToken)).send(payload); assert.equal(draft.status, 201);
    assert.equal((await request(app).post("/api/jobs").set(bearer(providerToken)).send({ ...payload, provider: providers[1]._id })).status, 403);
    const submit = await request(app).post(`/api/jobs/${draft.body.job._id}/status`).set(bearer(providerToken)).send({ status: "published" }); assert.equal(submit.body.job.status, "pending");
    assert.equal((await request(app).get(`/api/organizations/${providers[1]._id}/applications`).set(bearer(providerToken))).status, 403);
  });
  await t.test("New provider approval provisions an account without converting the submitter", async () => {
    const patientToken = await signSessionToken(patient);
    const submitted = await request(app).post("/api/providers/applications").set(bearer(patientToken)).send({ kind: "diagnostic", name: "Submitted diagnostic", address: "Actual test address", contactEmail: "representative@company.com" }); assert.equal(submitted.status, 201);
    const approved = await request(app).post(`/api/admin/provider-approvals/${submitted.body.application._id}/review`).set(bearer(systemToken)).send({ decision: "approve", demo: true }); assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.account.role, "provider_admin"); assert.equal((await User.findById(patient._id)).role, "user");
  });
  await t.test("Real provisioning is pending until invitation acceptance and never stores raw tokens", async () => {
    const created = await request(app).post("/api/admin/provider-accounts").set(bearer(systemToken)).send({ kind: "hospital", organizationId: otherHospital._id, loginEmail: "provider@company.com", notificationEmail: "contact@company.com" }); assert.equal(created.status, 201);
    const id = created.body.account._id;
    assert.equal(created.body.account.accountStatus, "pending");
    const raw = "a".repeat(43); await AuthToken.updateOne({ user: id, purpose: "provider_activation" }, { $set: { tokenHash: digestToken(raw) } });
    const response = await request(app).post("/api/auth/activate-provider").send({ token: raw, password: "ActivatedPassword123" }); assert.equal(response.status, 200);
    assert.equal((await request(app).post("/api/auth/activate-provider").send({ token: raw, password: "ActivatedPassword123" })).status, 400);
    const user = await User.findById(id); assert.equal(user.accountStatus, "active"); assert.equal(user.notificationsEnabled, true);
    assert.equal(JSON.stringify(await EmailDelivery.find({ template: "provider_activation" }).select("+retryEnvelope").lean()).includes("?token="), false);
  });
  await t.test("Read-only inventory proposes hospital mappings and never promotes legacy admin", async () => {
    const before = await User.find().select("+passwordHash").lean();
    const memberships = await ProviderMembership.find().lean();
    const inventory = await roleInventory(mongoose.connection.db);
    assert.equal(inventory.readOnly, true); assert.equal(inventory.migrationApplied, false);
    assert.equal(inventory.mappings.find((r) => r.currentRole === "admin").proposedRole, null);
    assert.equal(inventory.mappings.find((r) => r.currentRole === "hospital_admin").preserveHospitalAssignments.length, 1);
    assert.deepEqual(await User.find().select("+passwordHash").lean(), before);
    assert.deepEqual(await ProviderMembership.find().lean(), memberships);
  });
  await t.test("Concurrent administrator changes fail closed and the lease releases", async () => {
    let release, ready;
    const started = new Promise((resolve) => { ready = resolve; });
    const blocked = new Promise((resolve) => { release = resolve; });
    const first = guardAdminMutation(async () => { ready(); await blocked; });
    await started;
    await assert.rejects(guardAdminMutation(async () => {}), (error) => error.status === 409);
    release(); await first;
    await guardAdminMutation(async () => {});
  });
  await t.test("Emergency flags exclude ordinary ambulance transport and donation pledges", () => {
    assert.equal(requestRouting({ ambulanceRequired: true, isEmergency: false }, "AmbulanceBooking").isEmergency, false);
    assert.equal(requestRouting({ isEmergency: true }, "AmbulanceBooking").isEmergency, true);
    assert.equal(requestRouting({ type: "DONATION", isUrgent: true }, "BloodRequest").isEmergency, false);
    assert.equal(requestRouting({ type: "REQUEST", isUrgent: true }, "BloodRequest").isEmergency, true);
  });
  await t.test("Every configured active System Admin gets emergencies; unverified and inactive accounts do not", async () => {
    const second = await makeUser("system_admin", "second@roles.test");
    await User.updateOne({ _id: second._id }, { $set: { notificationsEnabled: true, notificationEmail: "second@company.com", notificationEmailVerifiedAt: new Date() } });
    assert.equal((await notificationRecipients("hospital", hospital._id, true)).filter((r) => r.channel === "system").length, 2);
    await User.updateOne({ _id: second._id }, { $unset: { notificationEmailVerifiedAt: 1 } });
    assert.equal((await notificationRecipients("hospital", hospital._id, true)).filter((r) => r.channel === "system").length, 1);
    await User.deleteOne({ _id: second._id });
  });
  await t.test("New unapproved providers cannot receive direct-ID healthcare submissions", async () => {
    const h = await Hospital.create({ name: "Pending role hospital", approvalStatus: "pending" });
    const bank = await ResourceProvider.create({ kind: "blood_bank", name: "Pending bank", sourceName: "Test", approvalStatus: "pending" });
    const ambulance = await ResourceProvider.create({ kind: "ambulance", name: "Pending ambulance", sourceName: "Test", approvalStatus: "pending" });
    assert.equal((await request(app).post("/api/emergency-requests").send({ hospitalId: h._id, emergencyType: "General", requiredFacility: "ICU", contactPhone: "+919876543210", isEmergency: true })).status, 404);
    assert.equal((await request(app).post("/api/blood-requests").send({ type: "REQUEST", providerId: bank._id, bloodGroup: "O+", patientOrDonorName: "Test", contactPhone: "+919876543210", isUrgent: true })).status, 400);
    assert.equal((await request(app).post("/api/ambulances/book").send({ providerId: ambulance._id, patientName: "Test", patientAge: 30, ambulanceRequired: true, bookingPickup: "Test road", contactPhone: "+919876543210", isEmergency: false })).status, 404);
  });

  await t.test("Approval with a colliding login keeps the new organisation unpublished and existing credentials untouched", async () => {
    const submission = await request(app).post("/api/providers/applications").set(bearer(await signSessionToken(patient))).send({ kind: "hospital", name: "Collision hospital", address: "Test street", contactEmail: "contact@company.com" });
    const record = await ProviderApplication.findById(submission.body.application._id);
    const before = await User.findOne({ email: "provider@company.com" }).select("+passwordHash").lean();
    const rejected = await request(app).post(`/api/admin/provider-approvals/${record._id}/review`).set(bearer(systemToken)).send({ decision: "approve", loginEmail: before.email });
    assert.equal(rejected.status, 409);
    assert.equal((await Hospital.findById(record.organization)).approvalStatus, "pending");
    assert.equal((await User.findById(before._id).select("+passwordHash")).passwordHash, before.passwordHash);
    assert.equal((await ProviderApplication.findById(record._id)).status, "pending");
  });
  await t.test("Contact verification is single-use and a changed address cannot be verified by its old link", async () => {
    const configured = await request(app).patch(`/api/admin/users/${system._id}/notifications`).set(bearer(systemToken)).send({ email: "replacement@company.com", enabled: true });
    assert.equal(configured.status, 200); assert.equal(configured.body.verified, false); assert.equal(configured.body.delivery, "disabled");
    const raw = "n".repeat(43);
    await AuthToken.updateOne({ user: system._id, purpose: "notification_email", revokedAt: { $exists: false } }, { $set: { tokenHash: digestToken(raw) } });
    await User.updateOne({ _id: system._id }, { $set: { notificationEmail: "different@company.com" } });
    assert.equal((await request(app).post("/api/auth/verify-notification-email").send({ token: raw })).status, 400);
    assert.equal(Boolean((await User.findById(system._id)).notificationEmailVerifiedAt), false);
  });
  systemToken = await signSessionToken(await User.findById(system._id).select("+authVersion"));
  await t.test("Revoked assignment invalidates the session and scoped access remains denied after sign-in", async () => {
    const membership = await ProviderMembership.findOne({ user: provider._id, kind: "hospital", organization: hospital._id });
    const revoked = await request(app).patch(`/api/admin/provider-accounts/${provider._id}/assignments/${membership._id}`).set(bearer(systemToken)).send({ active: false });
    assert.equal(revoked.status, 200);
    assert.equal((await request(app).get("/api/providers/mine").set(bearer(providerToken))).status, 401);
    const fresh = await signSessionToken(await User.findById(provider._id).select("+authVersion"));
    assert.equal((await request(app).put(`/api/hospitals/${hospital._id}`).set(bearer(fresh)).send({ phone: "123" })).status, 403);
    assert.equal((await User.findById(provider._id)).role, "provider_admin");
  });

});
