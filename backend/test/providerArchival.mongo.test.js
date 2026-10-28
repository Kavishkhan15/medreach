import { addAssignment } from "../src/services/providerAccounts.js";
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { User } from "../src/models/User.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { archiveProviderOrganization, recoverProviderArchives, organizationIsAvailable } from "../src/services/providerLifecycle.js";
import { assignedContext } from "../src/services/providerAccess.js";
import { createEmergencyRequest } from "../src/services/emergencyRequestService.js";
import { getPublicInventory, getInventoryHistory } from "../src/services/inventoryService.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { Job } from "../src/models/Job.js";
import { listJobs, getJob, applyToJob } from "../src/controllers/careersController.js";
import { updateAssignment } from "../src/controllers/providerAdminController.js";
import { approvedAssignments } from "../src/services/manualProviderCredentials.js";
import { listHospitals } from "../src/controllers/hospitalController.js";
import { listResources } from "../src/controllers/resourceController.js";
import express from "express";
import request from "supertest";
const uri = process.env.MEDREACH_ARCHIVAL_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_archival_test$/.test(uri));
test("provider archival preserves references, fails closed and recovers partial cleanup", { skip: !isolated, timeout: 30000 }, async t => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([Hospital, ResourceProvider, ProviderMembership, User, AuditLog, EmergencyRequest].map(M => M.init()));
  const [admin, staff] = await User.create(["system_admin", "provider_admin"].map((role, i) => ({ name: role, email: `archive${i}@test.example`, role, accountStatus: "active" })));
  const hospital = await Hospital.create({ name: "Archive test", approvalStatus: "approved" });
  const resource = await ResourceProvider.create({ name: "Linked ambulance", hospital: hospital._id, kind: "ambulance", sourceName: "isolated", approvalStatus: "approved" });
  const membership = await ProviderMembership.create({ user: staff._id, organization: hospital._id, kind: "hospital", assignedBy: admin._id });
  const childMembership = await ProviderMembership.create({ user: staff._id, organization: resource._id, kind: "ambulance", assignedBy: admin._id });
  const historical = await EmergencyRequest.create({ requestId: "MR-ARCHIVE-HISTORY", hospital: hospital._id, user: staff._id, emergencyType: "General care", requiredFacility: "ICU", contactPhone: "9999999999", expiresAt: new Date(Date.now()+60000) });
  const archived = { kind: "hospital", id: hospital._id, actor: { id: admin._id }, reason: "Provider ceased operations" };
  await t.test("requires active system admin and an explicit reason", async () => {
    await assert.rejects(archiveProviderOrganization({ ...archived, actor: { id: staff._id } }), e => e.status === 403);
    await assert.rejects(archiveProviderOrganization({ ...archived, reason: "" }), e => e.status === 400);
    assert.equal(await organizationIsAvailable("hospital", hospital._id), true);
  });
  await t.test("audit outage leaves an immediately effective recoverable archive", async () => {
    const original = AuditLog.updateOne;
    AuditLog.updateOne = async () => { throw new Error("injected audit interruption"); };
    try { assert.equal((await archiveProviderOrganization(archived)).cleanupPending, true); } finally { AuditLog.updateOne = original; }
    assert.equal(await organizationIsAvailable("hospital", hospital._id), false);
    assert.equal(await organizationIsAvailable("ambulance", resource._id), false);
    assert.deepEqual(await assignedContext({ id: staff._id, role: "provider_admin" }), { hospitalIds: [], providerIds: [] });
    assert.equal((await Hospital.findById(hospital._id)).archivePending, true);
    await assert.rejects(getPublicInventory({ kind: "hospital", organizationId: hospital._id }), e => e.status === 404);
  });
  await t.test("recovery is idempotent, retains IDs and records only one audit event", async () => {
    await Hospital.updateOne({ _id: hospital._id }, { $set: { archiveRetryAt: new Date(Date.now()-1000) } });
    assert.equal((await recoverProviderArchives()).recovered, 1);
    assert.equal((await recoverProviderArchives()).recovered, 0);
    assert.equal(await Hospital.countDocuments({ _id: hospital._id }), 1);
    const history = await EmergencyRequest.findById(historical._id).populate("hospital", "name");
    assert.equal(history.hospital.name, hospital.name);
    assert.equal(history.status, "REQUESTED");
    assert.equal(await ResourceProvider.countDocuments({ _id: resource._id }), 1);
    assert.equal((await ProviderMembership.findById(membership._id)).active, false);
    assert.equal((await ProviderMembership.findById(childMembership._id)).active, false);
    assert.equal(await AuditLog.countDocuments({ entityId: hospital._id }), 1);
    const again = await archiveProviderOrganization(archived);
    assert.equal(again.archived, true);
    assert.equal(await AuditLog.countDocuments({ entityId: hospital._id }), 1);
  });
  await t.test("archival blocks new requests and preserves authorised historical inventory reads", async () => {
    assert.equal((await createEmergencyRequest({ hospitalId: hospital._id }, { id: staff._id })).status, 404);
    assert.deepEqual(await getInventoryHistory({ kind: "hospital", organizationId: hospital._id, resourceKey: "general_beds", actor: { id: admin._id } }), { data: [], nextCursor: null });
    await assert.rejects(getInventoryHistory({ kind: "hospital", organizationId: hospital._id, resourceKey: "general_beds", actor: { id: staff._id } }), e => e.status === 403);
  });
  await t.test("records predating lifecycle fields can be archived without migration", async () => {
    const id = new mongoose.Types.ObjectId();
    await Hospital.collection.insertOne({ _id: id, name: "Legacy lifecycle test", approvalStatus: "approved" });
    const result = await archiveProviderOrganization({ ...archived, id });
    assert.equal(result.cleanupPending, false);
    assert.equal((await Hospital.findById(id)).archiveAttempts, 1);
  });
  await t.test("a crash on final lease becomes visible exhaustion and cannot loop forever", async () => {
    const item = await Hospital.create({ name: "Exhausted archive", archivedAt: new Date(), archivePending: true, archiveAttempts: 5,
      archiveLeaseToken: "crashed-fifth-attempt", archiveLeaseUntil: new Date(Date.now()-1000), archiveOperation: new mongoose.Types.ObjectId() });
    const result = await recoverProviderArchives(); assert.equal(result.exhausted, 1);
    const current = await Hospital.findById(item._id);
    assert.equal(current.archiveErrorCode, "ARCHIVE_RETRIES_EXHAUSTED"); assert.ok(current.archiveExhaustedAt);
    assert.equal(current.archiveAttempts, 5); assert.equal(current.archivePending, true);
    assert.equal((await recoverProviderArchives()).recovered, 0);
  });
  await t.test("archived organisations cannot advertise jobs, accept applications, reactivate memberships or generate credentials", async () => {
    const job = await Job.create({ hospital: hospital._id, title: "Archived provider nurse", category: "Nurse", employmentType: "full_time", description: "Isolated fixture", status: "published", createdBy: admin._id });
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { id: String(admin._id), role: "system_admin" }; next(); });
    app.get("/jobs", listJobs); app.get("/jobs/:id", getJob); app.post("/jobs/:id/apply", applyToJob);
    app.patch("/accounts/:id/:membershipId", updateAssignment);
    assert.equal((await request(app).get("/jobs")).body.data.length, 0);
    assert.equal((await request(app).get(`/jobs/${job._id}`)).status, 404);
    assert.equal((await request(app).post(`/jobs/${job._id}/apply`).send({})).status, 404);
    assert.equal((await request(app).patch(`/accounts/${staff._id}/${membership._id}`).send({ active: true })).status, 409);
    assert.equal((await ProviderMembership.findById(membership._id)).active, false);
    await ProviderMembership.updateOne({ _id: membership._id }, { $set: { active: true } });
    assert.equal(await approvedAssignments(staff), false);
    await ProviderMembership.updateOne({ _id: membership._id }, { $set: { active: false } });
  });
  await t.test("cursor pagination returns duplicate-name hospitals exactly once", async () => {
    await Hospital.create(Array.from({ length: 5 }, () => ({ name: "Same hospital name", approvalStatus: "approved" })));
    const app = express(); app.get("/hospitals", listHospitals);
    let cursor, ids = [];
    do {
      const result = await request(app).get("/hospitals").query({ pagination: "cursor", limit: 2, ...(cursor ? { cursor } : {}) });
      assert.equal(result.status, 200);
      ids.push(...result.body.data.map(h => h._id)); cursor = result.body.nextCursor;
    } while (cursor);
    assert.equal(ids.length, 5); assert.equal(new Set(ids).size, 5);
    await Hospital.deleteMany({ name: "Same hospital name" });
  });
  await t.test("archive finishing between assignment precheck and insertion cannot leave active membership", async () => {
    const target = await Hospital.create({ name: "Assignment insertion race", approvalStatus: "approved", verificationStatus: "verified" });
    const original = ProviderMembership.findOneAndUpdate;
    let injected = false;
    ProviderMembership.findOneAndUpdate = function(filter, update, options) {
      if (!injected && String(filter.organization) === String(target._id) && update.$setOnInsert?.active) {
        injected = true;
        return (async () => {
          await archiveProviderOrganization({ ...archived, id: target._id });
          return original.call(this, filter, update, options);
        })();
      }
      return original.call(this, filter, update, options);
    };
    try { await assert.rejects(addAssignment(staff, { kind: "hospital", organizationId: target._id }, admin._id), error => error.status === 409); }
    finally { ProviderMembership.findOneAndUpdate = original; }
    assert.equal(injected, true);
    const record = await ProviderMembership.findOne({ user: staff._id, organization: target._id });
    assert.ok(record); assert.equal(record.active, false);
    assert.equal((await assignedContext({ id: staff._id, role: "provider_admin" })).hospitalIds.includes(String(target._id)), false);
  });
  await t.test("archive finishing between activation precheck and mutation cannot reactivate membership", async () => {
    const target = await Hospital.create({ name: "Assignment activation race", approvalStatus: "approved", verificationStatus: "verified" });
    const inactive = await ProviderMembership.create({ user: staff._id, organization: target._id, kind: "hospital", assignedBy: admin._id, active: false });
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { id: String(admin._id), role: "system_admin" }; next(); });
    app.patch("/accounts/:id/:membershipId", updateAssignment);
    const original = ProviderMembership.findOneAndUpdate;
    let injected = false;
    ProviderMembership.findOneAndUpdate = function(filter, update, options) {
      if (!injected && String(filter._id) === String(inactive._id) && update.$set?.active === true) {
        injected = true;
        return (async () => { await archiveProviderOrganization({ ...archived, id: target._id }); return original.call(this, filter, update, options); })();
      }
      return original.call(this, filter, update, options);
    };
    try { assert.equal((await request(app).patch(`/accounts/${staff._id}/${inactive._id}`).send({ active: true })).status, 409); }
    finally { ProviderMembership.findOneAndUpdate = original; }
    assert.equal(injected, true);
    assert.equal((await ProviderMembership.findById(inactive._id)).active, false);
  });
  await t.test("public directories omit archived organisations and linked resources", async () => {
    const app = express(); app.get("/hospitals", listHospitals); app.get("/resources", listResources("ambulance"));
    assert.equal((await request(app).get("/hospitals")).body.data.length, 0);
    assert.equal((await request(app).get("/resources")).body.data.length, 0);
  });
});
