import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { existingProviderInventory, provisionExistingProviders } from "../scripts/provisionExistingProviders.js";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { ProviderApplication } from "../src/models/ProviderApplication.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { Hospital } from "../src/models/Hospital.js";
import { BloodRequest } from "../src/models/BloodRequest.js";
import { AmbulanceBooking } from "../src/models/AmbulanceBooking.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { AuthToken } from "../src/models/AuthToken.js";
import { signSessionToken } from "./helpers/session.js";
import { env } from "../src/config/env.js";
import { digestToken } from "../src/services/authTokenService.js";
import { validateProviderApplication } from "../../packages/core/src/providerApplication.js";
import { profileDestination } from "../../packages/core/src/authNavigation.js";
const uri = process.env.MEDREACH_ROLE_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/medreach_roles_test$/.test(uri));
test("public onboarding and scoped request lifecycle", { skip: !isolated, timeout: 90000 }, async (t) => {
  await mongoose.connect(uri); await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([User, ProviderApplication, ProviderMembership, Hospital, ResourceProvider, BloodRequest, AmbulanceBooking, EmailDelivery, AuthToken].map((m) => m.init()));
  const app = createApp();
  const system = await User.create({ email: "system@onboarding.test", name: "System", role: "system_admin" });
  const auth = { Authorization: `Bearer ${await signSessionToken(system)}` };
  const payload = { name: "Onboarding blood bank", kind: "blood_bank", contactName: "Test Representative", contactEmail: "medreachforyou@gmail.com", phone: "+919876543210", address: "Controlled test street", city: "Mumbai", explanation: "Isolated test" };
  let application, provider, providerAuth;
  await t.test("invalid input and role elevation are rejected, guest submissions are persistent and concurrent duplicates collapse", async () => {
    assert.equal((await request(app).post("/api/providers/applications").send({ ...payload, contactEmail: "bad" })).status, 400);
    for (const field of ["contactName", "city", "phone"]) {
      const incomplete = { ...payload }; delete incomplete[field];
      assert.equal((await request(app).post("/api/providers/applications").send(incomplete)).status, 400);
    }
    const results = await Promise.all([1,2,3].map(() => request(app).post("/api/providers/applications").send(payload)));
    for (const result of results) { assert.equal(result.status, 202); assert.equal(result.body.application, undefined); }
    assert.equal(await ProviderApplication.countDocuments(), 1);
    const changedContact = await request(app).post("/api/providers/applications").send({ ...payload, contactEmail: "other@example.com" });
    assert.equal(changedContact.status, 202); assert.equal(changedContact.body.application, undefined);
    assert.equal(await ProviderApplication.countDocuments(), 1);
    application = await ProviderApplication.findOne();
    assert.equal(application.status, "pending"); assert.equal(await ResourceProvider.countDocuments(), 0); assert.equal(await User.countDocuments(), 1);
    assert.equal((await request(app).get("/api/admin/provider-approvals")).status, 401);
    assert.equal(validateProviderApplication(payload).name, undefined);
    assert.equal(Object.keys(validateProviderApplication({ ...payload, phone: "bad", kind: "user_admin" })).length, 2);
  });
  await t.test("approval automatically provisions a pending account and assignment; retries preserve credentials and prevent duplicates", async () => {
    const first = await request(app).post(`/api/admin/provider-approvals/${application._id}/review`).set(auth).send({ decision: "approve" });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    provider = await User.findById(first.body.account._id).select("+passwordHash");
    assert.match(provider.email, /^admin@.+\.example$/); assert.equal(provider.accountStatus, "pending"); assert.equal(provider.passwordHash, undefined);
    assert.equal((await ResourceProvider.findById(application.organization)).approvalStatus, "approved");
    assert.equal(await ProviderMembership.countDocuments({ user: provider._id }), 1);
    assert.equal((await request(app).post("/api/auth/login").send({ email: provider.email, password: "Provider@Medreach786" })).status, 401);
    const retry = await request(app).post(`/api/admin/provider-approvals/${application._id}/review`).set(auth).send({ decision: "approve" });
    assert.equal(retry.status, 200); assert.equal(retry.body.account._id, String(provider._id));
    assert.equal(await ResourceProvider.countDocuments(), 1); assert.equal(await User.countDocuments(), 2); assert.equal(await ProviderMembership.countDocuments(), 1);
    // Exercise the real activation endpoint using a controlled token, no SMTP needed.
    const token = "a".repeat(43);
    await AuthToken.updateOne({ user: provider._id, purpose: "provider_activation", revokedAt: { $exists: false } }, { $set: { tokenHash: digestToken(token) } });
    const activated = await request(app).post("/api/auth/activate-provider").send({ token, password: "PersonalTestPassword123" });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));
    assert.equal((await request(app).post("/api/auth/login").send({ email: provider.email, password: "PersonalTestPassword123" })).status, 200);
    providerAuth = { Authorization: `Bearer ${await signSessionToken(await User.findById(provider._id).select("+authVersion"))}` };
  });
  await t.test("rejection is recorded once and never creates organisations or users", async () => {
    await request(app).post("/api/providers/applications").send({ ...payload, name: "Rejected test centre", kind: "diagnostic" });
    const pending = await ProviderApplication.findOne({ status: "pending" });
    for (let i=0;i<2;i++) assert.equal((await request(app).post(`/api/admin/provider-approvals/${pending._id}/review`).set(auth).send({ decision: "reject", note: "Incomplete information" })).status, 200);
    assert.equal((await ProviderApplication.findById(pending._id)).reviewNote, "Incomplete information");
    assert.equal(await ResourceProvider.countDocuments(), 1);
  });
  await t.test("same organisation name and street in different cities do not collapse into one application", async () => {
    for (const city of ["Mumbai", "Pune"]) {
      assert.equal((await request(app).post("/api/providers/applications").send({ ...payload, name: "City scope test", city })).status, 202);
    }
    assert.equal(await ProviderApplication.countDocuments({ name: "City scope test" }), 2);
  });
  await t.test("case and spacing differences cannot provision a duplicate of an existing organisation", async () => {
    const submission = { ...payload, name: "Existing Match Test", address: "Existing Test Street" };
    await request(app).post("/api/providers/applications").send(submission);
    const submitted = await ProviderApplication.findOne({ name: submission.name });
    const existing = await ResourceProvider.create({ name: "existing match test", kind: "blood_bank", address: "existing  test street", city: "mUMbAi", sourceName: "Isolated", verificationStatus: "verified" });
    const count = await ResourceProvider.countDocuments();
    const review = await request(app).post(`/api/admin/provider-approvals/${submitted._id}/review`).set(auth).send({ decision: "approve" });
    assert.equal(review.status, 409);
    assert.equal(await ResourceProvider.countDocuments(), count);
    assert.equal(await ProviderMembership.countDocuments({ organization: existing._id }), 0);
    assert.equal((await ProviderApplication.findById(submitted._id)).status, "pending");
  });
  await t.test("providers can update assigned requests only; terminal transitions and regular user mutations fail", async () => {
    const other = await ResourceProvider.create({ name: "Other bank", kind: "blood_bank", sourceName: "Isolated", verificationStatus: "verified" });
    const rows = await BloodRequest.create([application.organization, other._id].map((id, i) => ({ reference: `BR-TEST-${i}`, provider: id, type: "REQUEST", bloodBankName: "Test", bloodGroup: "O+", patientOrDonorName: "Test", contactPhone: "+919876543210", contactEmail: payload.contactEmail })));
    assert.equal((await request(app).patch(`/api/blood-requests/${rows[1]._id}/status`).set(providerAuth).send({ status: "CONFIRMED" })).status, 403);
    assert.equal((await request(app).patch(`/api/blood-requests/${rows[0]._id}/status`).set(providerAuth).send({ status: "CONFIRMED" })).status, 200);
    assert.equal((await request(app).patch(`/api/blood-requests/${rows[0]._id}/status`).set(providerAuth).send({ status: "COMPLETED" })).status, 200);
    assert.equal((await request(app).patch(`/api/blood-requests/${rows[0]._id}/status`).set(providerAuth).send({ status: "CANCELLED" })).status, 409);
    const user = await User.create({ name: "Patient", email: "patient@onboarding.test", role: "user" });
    assert.equal((await request(app).patch(`/api/blood-requests/${rows[1]._id}/status`).set({ Authorization: `Bearer ${await signSessionToken(user)}` }).send({ status: "CONFIRMED" })).status, 403);
    assert.equal((await request(app).get("/api/providers/mine").set(providerAuth)).body.data.length, 1);
    const ambulance = await ResourceProvider.create({ name: "Ambulance", kind: "ambulance", sourceName: "Isolated", verificationStatus: "verified" });
    const booking = await AmbulanceBooking.create({ reference: "AMB-TEST-STATUS", provider: ambulance._id, providerSnapshot: { name: "Ambulance" }, requestSnapshot: { patientName: "Test", patientAge: 30, pickupAddress: "Test" }, trackingTokenHash: "hash", delivery: { user: { status: "disabled" }, admin: { status: "not_available" }, provider: { status: "disabled" } } });
    assert.equal((await request(app).patch(`/api/ambulances/bookings/${booking._id}/status`).set(providerAuth).send({ status: "CONFIRMED" })).status, 403);
    assert.equal((await request(app).patch(`/api/ambulances/bookings/${booking._id}/status`).set(auth).send({ status: "CONFIRMED" })).status, 200);
    assert.equal((await request(app).patch(`/api/ambulances/bookings/${booking._id}/status`).set(auth).send({ status: "DISPATCHED" })).status, 200);
    assert.equal((await request(app).patch(`/api/ambulances/bookings/${booking._id}/status`).set(auth).send({ status: "COMPLETED" })).status, 200);
    assert.equal(env.emailEnabled, false);
  });
  await t.test("reports use actual assigned records and reject unrelated organisations and regular users", async () => {
    const report = await request(app).get(`/api/providers/blood_bank/${application.organization}/report`).set(providerAuth);
    assert.equal(report.status, 200, JSON.stringify(report.body));
    assert.equal(report.body.data.organizationId, String(application.organization));
    assert.deepEqual(report.body.data.requests, [{ _id: "COMPLETED", count: 1 }]);
    assert.equal(report.body.data.availability, "not_reported");
    assert.equal(report.body.data.observations, null);
    const unrelated = await ResourceProvider.findOne({ name: "Other bank" });
    assert.equal((await request(app).get(`/api/providers/blood_bank/${unrelated._id}/report`).set(providerAuth)).status, 403);
    const regular = await User.findOne({ role: "user" });
    assert.equal((await request(app).get(`/api/providers/blood_bank/${application.organization}/report`).set({ Authorization: `Bearer ${await signSessionToken(regular)}` })).status, 403);
    const aggregate = BloodRequest.aggregate;
    BloodRequest.aggregate = () => Promise.reject(new Error("Controlled outage"));
    try { assert.equal((await request(app).get(`/api/providers/blood_bank/${application.organization}/report`).set(providerAuth)).status, 500); }
    finally { BloodRequest.aggregate = aggregate; }
  });
  await t.test("existing organisation provisioning is non-destructive, groups explicit hospital resources and never sends invitations without contacts", async () => {
    const h = await Hospital.create({ name: "Existing parent", verificationStatus: "verified" });
    const lab = await ResourceProvider.create({ name: "Existing hospital lab", kind: "diagnostic", hospital: h._id, verificationStatus: "verified", sourceName: "Isolated" });
    const blocked = await Hospital.create({ name: "Unapproved existing", verificationStatus: "unverified" });
    const beforeHash = (await User.findById(provider._id).select("+passwordHash")).passwordHash;
    const inventory = await existingProviderInventory();
    const group = inventory.find((g) => g.key === `hospital:${h._id}`);
    assert.equal(group.organizations.length, 2);
    assert.equal(inventory.find((g) => g.key === `hospital:${blocked._id}`).action, "manual_review");
    const results = await provisionExistingProviders(system._id);
    const created = results.find((g) => g.key === group.key);
    const pending = await User.findById(created.accountId).select("+passwordHash");
    assert.equal(pending.accountStatus, "pending"); assert.equal(pending.passwordHash, undefined); assert.equal(pending.notificationEmail, undefined);
    assert.equal(await ProviderMembership.countDocuments({ user: pending._id }), 2);
    assert.equal(await ProviderMembership.countDocuments({ user: pending._id, organization: lab._id }), 1);
    // Simulate an interrupted batch after the account and first assignment were saved.
    await ProviderMembership.deleteOne({ user: pending._id, organization: lab._id });
    assert.equal((await existingProviderInventory()).find((g) => g.key === group.key).action, "resume_pending_assignments");
    await provisionExistingProviders(system._id);
    assert.equal(await ProviderMembership.countDocuments({ user: pending._id }), 2);
    const counts = [await User.countDocuments(), await ProviderMembership.countDocuments()];
    await provisionExistingProviders(system._id);
    assert.deepEqual([await User.countDocuments(), await ProviderMembership.countDocuments()], counts);
    assert.equal((await User.findById(provider._id).select("+passwordHash")).passwordHash, beforeHash);
    assert.equal((await request(app).post("/api/auth/login").send({ email: pending.email, password: "Provider@Medreach786" })).status, 401);
  });
  await t.test("default navigation selects the appropriate dashboard", () => {
    assert.equal(profileDestination({ role: "system_admin" }), "/admin");
    assert.equal(profileDestination({ role: "provider_admin" }), "/provider");
    assert.equal(profileDestination({ role: "user", region: "Mumbai" }), "/dashboard");
  });
});
