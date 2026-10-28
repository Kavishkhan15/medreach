import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import providerAdoptionRouter from "../src/routes/providerAdoption.js";
import { ProviderGroup, ProviderOnboarding, ProviderOffboarding } from "../src/models/providerAdoptionModels.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { ResourceInventory } from "../src/models/ResourceInventory.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { AuthToken } from "../src/models/AuthToken.js";
import { signSessionToken } from "./helpers/session.js";
import { listBranchGroups, putBranchGroup, putProviderOnboarding, readProviderOnboarding, providerQualityReport, requestProviderOffboarding, recoverProviderOffboarding } from "../src/services/providerAdoption.js";
const uri = process.env.MEDREACH_PROVIDER_ADOPTION_TEST_MONGO_URI;
const isolated = /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_provider_adoption_test$/.test(uri || "");
test("provider adoption metadata, quality and recoverable offboarding remain organisation scoped", { skip: !isolated, timeout: 60000 }, async t => {
  await mongoose.connect(uri); await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([ProviderGroup, ProviderOnboarding, ProviderOffboarding, ProviderMembership, AuditLog, AuthToken, ResourceInventory].map(Model => Model.init()));
  const [admin, provider, other, staff] = await User.create(["system_admin", "provider_admin", "provider_admin", "provider_admin"].map((role, i) => ({ role, name: `Synthetic provider ${i}`, email: `${i}@adoption-local.test`, accountStatus: "active" })));
  const [hospital, unrelated] = await Hospital.create([{ name: "Synthetic branch A", approvalStatus: "approved", verificationStatus: "verified" }, { name: "Synthetic branch B", approvalStatus: "approved", verificationStatus: "verified" }]);
  const memberships = await ProviderMembership.create([{ user: provider._id, organization: hospital._id, kind: "hospital", assignedBy: admin._id }, { user: other._id, organization: unrelated._id, kind: "hospital", assignedBy: admin._id }, { user: staff._id, organization: hospital._id, kind: "hospital", assignedBy: admin._id }, { user: staff._id, organization: unrelated._id, kind: "hospital", assignedBy: admin._id }]);
  const actor = user => ({ id: String(user._id) }), scope = { kind: "hospital", organizationId: String(hospital._id) };
  await t.test("branch grouping never grants access to another organisation and uses version conflicts", async () => {
    const id = String(new mongoose.Types.ObjectId());
    const input = { name: "Synthetic network", expectedVersion: 0, branches: [{ kind: "hospital", organizationId: String(hospital._id) }, { kind: "hospital", organizationId: String(unrelated._id) }] };
    await putBranchGroup({ actor: actor(admin), id, input });
    const visible = await listBranchGroups({ actor: actor(provider) });
    assert.equal(visible.permissionsInherited, false); assert.equal(visible.data[0].branches.length, 1);
    assert.equal(String(visible.data[0].branches[0].organization), String(hospital._id));
    const app = express();
    app.set("query parser", "extended");
    app.use("/adoption", providerAdoptionRouter);
    const token = await signSessionToken(provider);
    const forged = await request(app).get("/adoption/groups")
      .query({ "actor[id]": String(admin._id) }).set("Authorization", `Bearer ${token}`);
    assert.equal(forged.status, 200);
    assert.equal(forged.body.data[0].branches.length, 1);
    assert.equal(String(forged.body.data[0].branches[0].organization), String(hospital._id));
    await assert.rejects(putBranchGroup({ actor: actor(provider), id, input: { ...input, expectedVersion: 1 } }), e => e.status === 403);
    const results = await Promise.allSettled([putBranchGroup({ actor: actor(admin), id, input: { ...input, expectedVersion: 1, name: "First update" } }), putBranchGroup({ actor: actor(admin), id, input: { ...input, expectedVersion: 1, name: "Second update" } })]);
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
    assert.equal(results.find(row => row.status === "rejected").reason.status, 409);
  });
  await t.test("readiness is an explicit operator review, requires a verified live provider contact", async () => {
    const checklist = { ownershipReviewed: true, contactReviewed: true, reportingAgreed: true, escalationAgreed: true, responsibilitiesAccepted: true };
    const input = { expectedVersion: 0, status: "ready", reason: "Synthetic ownership and responsibility review", evidenceRefs: ["fixture:ownership-review"], checklist };
    await assert.rejects(putProviderOnboarding({ actor: actor(admin), ...scope, input }), e => e.code === "PROVIDER_READINESS_NOT_ESTABLISHED");
    await User.updateOne({ _id: provider._id }, { $set: { notificationsEnabled: true, notificationEmail: "contact@adoption-local.test", notificationEmailVerifiedAt: new Date() } });
    const result = await putProviderOnboarding({ actor: actor(admin), ...scope, input });
    assert.equal(result.data.status, "ready"); assert.equal(result.clinicalValidationImplied, false);
    await assert.rejects(putProviderOnboarding({ actor: actor(admin), ...scope, input }), e => e.status === 409);
    await assert.rejects(readProviderOnboarding({ actor: actor(other), ...scope }), e => e.status === 403);
  });
  await t.test("quality reports count only scoped requests and withhold demo/stale numerical availability", async () => {
    await EmergencyRequest.collection.insertMany([{ requestId: "SYNTHETIC-ADOPTION-A", hospital: hospital._id, status: "REQUESTED", createdAt: new Date(), contactPhone: "PRIVATE", patientSummary: "PRIVATE" }, { requestId: "SYNTHETIC-ADOPTION-B", hospital: unrelated._id, status: "ACCEPTED", createdAt: new Date(), patientSummary: "PRIVATE" }]);
    await ResourceInventory.create({ kind: "hospital", organization: hospital._id, resourceKey: "general_beds", unit: "beds", capacity: 50, available: 50, version: 1, classification: "demo", reportingMethod: "demo_fixture", observedAt: new Date() });
    const report = await providerQualityReport({ actor: actor(provider), ...scope });
    assert.deepEqual(report.requests, { REQUESTED: 1 }); assert.equal(report.inventory.resources[0].available, null);
    assert.equal(report.containsPatientData, false); assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
    await assert.rejects(providerQualityReport({ actor: actor(other), ...scope }), e => e.status === 403);
    await assert.rejects(providerQualityReport({ actor: actor(provider), ...scope, days: 999 }), e => e.status === 400);
  });
  await t.test("offboarding preserves other branches/history, revokes old sessions and replay preserves a new grant", async () => {
    await signSessionToken(staff);
    const input = { actor: actor(admin), membershipId: String(memberships[2]._id), reason: "Synthetic staff departure review", idempotencyKey: randomUUID() };
    const result = await requestProviderOffboarding(input); assert.equal(result.status, "complete");
    assert.equal((await ProviderMembership.findById(memberships[2]._id)).active, false);
    assert.equal((await ProviderMembership.findById(memberships[3]._id)).active, true);
    assert.equal(await AuthToken.countDocuments({ user: staff._id, purpose: "refresh_session", revokedAt: { $exists: false } }), 0);
    assert.equal(await EmergencyRequest.countDocuments(), 2);
    const version = (await User.findById(staff._id).select("+authVersion")).authVersion;
    await ProviderMembership.updateOne({ _id: memberships[2]._id }, { $set: { active: true, assignmentMutation: "separately-approved-new-grant" } });
    assert.equal((await requestProviderOffboarding(input)).status, "complete");
    assert.equal((await ProviderMembership.findById(memberships[2]._id)).active, true);
    assert.equal((await User.findById(staff._id).select("+authVersion")).authVersion, version);
  });
  await t.test("audit outage is recoverable without repeating session version effects", async () => {
    const key = randomUUID(), input = { actor: actor(admin), membershipId: String(memberships[2]._id), reason: "Synthetic recoverable staff departure", idempotencyKey: key };
    const original = AuditLog.updateOne;
    AuditLog.updateOne = async () => { throw new Error("Synthetic audit interruption"); };
    let result;
    try { result = await requestProviderOffboarding(input); assert.notEqual(result.status, "complete"); }
    finally { AuditLog.updateOne = original; }
    const before = (await User.findById(staff._id).select("+authVersion")).authVersion;
    await recoverProviderOffboarding();
    assert.equal((await ProviderOffboarding.findById(result._id)).status, "complete");
    assert.equal((await User.findById(staff._id).select("+authVersion")).authVersion, before);
  });
});
