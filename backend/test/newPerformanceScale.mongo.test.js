import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { Hospital } from "../src/models/Hospital.js";
import { User } from "../src/models/User.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { ProviderApplication } from "../src/models/ProviderApplication.js";
import { AvailabilityObservation } from "../src/models/AvailabilityObservation.js";
import { listFacilities, getAvailability } from "../src/controllers/availabilityController.js";
import { listHospitals } from "../src/controllers/hospitalController.js";
import { listAccounts, listOrganizations, providerApplications, myOrganizations } from "../src/controllers/providerAdminController.js";
import { withHospitalData } from "../src/services/hospitalDataLoader.js";
import { readHospitalPage, hospitalPagePipeline } from "../src/services/hospitalReadPipeline.js";
import { readPublicResources } from "../src/services/publicResourceRead.js";
import { HospitalFieldClaim } from "../src/models/HospitalFieldClaim.js";
import { HospitalFieldConflict } from "../src/models/HospitalFieldConflict.js";
import { FacilitySourceClaim } from "../src/models/FacilitySourceClaim.js";
import { DataSource } from "../src/models/DataSource.js";

const uri = process.env.MEDREACH_SCALE_PERFORMANCE_TEST_MONGO_URI;
const isolated = /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_scale_performance_test$/.test(uri || "");
test("bounded provider lists and public availability integrity", { skip: !isolated }, async t => {
  await mongoose.connect(uri, { monitorCommands: true });
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const system = await User.create({ name: "Scale system", role: "system_admin", email: "system@scale.test" });
  const provider = await User.create({ name: "Scale provider", role: "provider_admin", email: "provider@scale.test" });
  const other = await User.create({ name: "Other provider", role: "provider_admin", email: "other@scale.test" });
  const hospitals = await Hospital.create(Array.from({ length: 105 }, (_, i) => ({ name: `Scale hospital ${String(i).padStart(3, "0")}`, approvalStatus: "approved" })));
  const privateHospitals = await Hospital.create(["pending", "rejected"].map(approvalStatus => ({ name: `${approvalStatus} private hospital`, approvalStatus })));
  const bloodBank = await ResourceProvider.create({ name: "Scale blood bank", kind: "blood_bank", sourceName: "Isolated fixture" });
  await ProviderMembership.create(hospitals.map(h => ({ user: provider._id, organization: h._id, kind: "hospital", assignedBy: system._id })));
  await ProviderMembership.create({ user: other._id, organization: bloodBank._id, kind: "blood_bank", assignedBy: system._id });
  await ProviderApplication.create(Array.from({ length: 103 }, (_, i) => ({ name: `Scale application ${i}`, kind: "hospital", address: "Isolated address", contactEmail: "fixture@scale.test" })));
  await User.create(Array.from({ length: 103 }, (_, i) => ({ name: `Scale account ${i}`, role: "provider_admin", email: `provider-${i}@scale.test` })));
  const app = express();
  let actor = { id: provider.id, role: provider.role };
  app.use((req, _res, next) => { req.user = actor; next(); });
  app.get("/facilities/:id", listFacilities); app.get("/availability/:id", getAvailability);
  app.get("/accounts", listAccounts); app.get("/organizations", listOrganizations);
  app.get("/applications", providerApplications); app.get("/mine", myOrganizations); app.get("/hospitals", listHospitals);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));

  await t.test("pending/rejected hospitals cannot leak public facilities or history counts", async () => {
    for (const h of privateHospitals) for (const path of ["facilities", "availability"]) assert.equal((await request(app).get(`/${path}/${h.id}`)).status, 404);
    assert.equal((await request(app).get(`/facilities/${hospitals[0].id}`)).status, 200);
    assert.equal((await request(app).get("/availability/not-an-id")).status, 404);
  });
  await t.test("account/application/organisation lists expose bounded pages and truthful totals", async () => {
    for (const [path, total] of [["accounts", 105], ["applications", 103], ["organizations", 108]]) {
      const response = await request(app).get(`/${path}`);
      assert.equal(response.status, 200); assert.equal(response.body.data.length, 100, path);
      assert.equal(response.body.total, total, path); assert.equal(response.body.hasMore, true);
      const second = await request(app).get(`/${path}?page=2`);
      assert.equal(second.body.data.length, total - 100, path); assert.equal(second.body.hasMore, false);
      assert.equal(new Set([...response.body.data, ...second.body.data].map(row => `${row.kind || ""}:${row._id}`)).size, total);
      assert.equal((await request(app).get(`/${path}?limit=1000`)).body.data.length, 100);
      assert.equal((await request(app).get(`/${path}?page=0`)).status, 400);
    }
  });
  await t.test("provider organisation pages use batch reads, preserve assignment scope and expose subsequent pages", async () => {
    const reads = []; const client = mongoose.connection.getClient();
    const listener = event => { if (["find", "aggregate"].includes(event.commandName)) reads.push(event.commandName); };
    client.on("commandStarted", listener);
    const response = await request(app).get("/mine"); client.off("commandStarted", listener);
    assert.equal(response.status, 200); assert.equal(response.body.data.length, 100); assert.equal(response.body.total, 105);
    assert.ok(reads.length <= 4, JSON.stringify(reads));
    const second = await request(app).get("/mine?page=2"); assert.equal(second.body.data.length, 5);
    assert.ok([...response.body.data, ...second.body.data].every(row => row.kind === "hospital"));
    actor = { id: system.id, role: system.role };
    assert.equal((await request(app).get("/mine")).body.total, 108);
    actor = { id: provider.id, role: provider.role };
  });
  await t.test("latest observations preserve observedAt precedence and retrievedAt fallback without loading full histories", async () => {
    const now = Date.now(); const hospital = hospitals[0];
    await AvailabilityObservation.create([
      { hospital: hospital._id, facility: "ICU", status: "available", quantity: 9, verificationStatus: "verified", observedAt: new Date(now - 500000), retrievedAt: new Date(now - 1000) },
      { hospital: hospital._id, facility: "ICU", status: "unavailable", quantity: 0, verificationStatus: "verified", observedAt: null, retrievedAt: new Date(now - 100000) },
      { hospital: hospital._id, facility: "Emergency Department", status: "available", verificationStatus: "verified", observedAt: new Date(now - 10000) },
    ]);
    const [view] = await withHospitalData([hospital.toObject()]);
    assert.equal(view.facilities.find(row => row.facility === "ICU").status, "unavailable");
    assert.equal(view.facilities.find(row => row.facility === "ICU").count, 0);
    assert.equal(view.bedsAvailable, null); assert.equal(view.emergencyStatus, "available");
    const filtered = await request(app).get("/hospitals?status=available&limit=1");
    assert.equal(filtered.status, 200); assert.equal(filtered.body.total, 1); assert.equal(filtered.body.data[0]._id, hospital.id);
  });
  await t.test("future observations cannot hide the latest legitimate evidence in either timestamp branch", async () => {
    const now = Date.now(); const hospital = hospitals[1];
    await AvailabilityObservation.create([
      { hospital: hospital._id, facility: "ICU", status: "available", quantity: 4, verificationStatus: "verified", observedAt: new Date(now - 10000) },
      { hospital: hospital._id, facility: "ICU", status: "unavailable", quantity: 0, verificationStatus: "verified", observedAt: new Date(now + 600000) },
      { hospital: hospital._id, facility: "Emergency Department", status: "available", verificationStatus: "verified", observedAt: null, retrievedAt: new Date(now - 10000) },
      { hospital: hospital._id, facility: "Emergency Department", status: "unavailable", verificationStatus: "verified", observedAt: null, retrievedAt: new Date(now + 600000) },
    ]);
    const [view] = await withHospitalData([hospital.toObject()]);
    assert.equal(view.facilities.find(row => row.facility === "ICU").status, "available");
    assert.equal(view.facilities.find(row => row.facility === "ICU").count, 4);
    assert.equal(view.emergencyStatus, "available");
  });
  await t.test("public evidence excludes internal journals at the database boundary and shares source reads", async () => {
    const hospital = hospitals[2], source = new mongoose.Types.ObjectId();
    const sentinel = "INTERNAL_REVIEW_SHOULD_NOT_BE_FETCHED";
    await DataSource.collection.insertOne({ _id: source, name: "Fixture source", type: "manual_verification", sourceKey: "projection-fixture", url: "https://example.test" });
    await HospitalFieldClaim.collection.insertOne({ hospital: hospital._id, field: "phone", value: "02212345678", source, verificationStatus: "verified", confidence: "HIGH", observedAt: new Date(), reviewHistory: [{ note: sentinel }], evidenceText: "Public source excerpt" });
    await FacilitySourceClaim.collection.insertOne({ hospital: hospital._id, facility: "ICU", capability: "yes", source, verificationStatus: "verified", confidence: "HIGH", observedAt: new Date(), internalHistory: [sentinel] });
    await HospitalFieldConflict.collection.insertOne({ hospital: hospital._id, field: "phone", status: "resolved", claims: [new mongoose.Types.ObjectId()], history: [{ value: sentinel }] });
    await AvailabilityObservation.collection.insertOne({ hospital: hospital._id, facility: "ICU", status: "unavailable", quantity: 0, verificationStatus: "verified", observedAt: new Date(), source });
    const client = mongoose.connection.getClient(), replies = [], sourceReads = [];
    const started = event => { if (event.command.find === "datasources") sourceReads.push(event); };
    const succeeded = event => { if (["find", "aggregate"].includes(event.commandName)) replies.push(JSON.stringify(event.reply)); };
    client.on("commandStarted", started); client.on("commandSucceeded", succeeded);
    let view;
    try { [view] = await withHospitalData([hospital.toObject()]); }
    finally { client.off("commandStarted", started); client.off("commandSucceeded", succeeded); }
    assert.equal(sourceReads.length, 1);
    assert.ok(replies.every(reply => !reply.includes(sentinel)));
    assert.equal(view.fieldProvenance.phone.source.name, "Fixture source");
    assert.equal(view.fieldProvenance.phone.evidenceText, "Public source excerpt");
    assert.deepEqual(view.fieldConflicts, [{ field: "phone", status: "resolved", sourceCount: 1 }]);
    const icu = view.facilities.find(row => row.facility === "ICU");
    assert.equal(icu.count, 0); assert.equal(icu.capabilityProvenance.source.name, "Fixture source");
  });
  await t.test("cursor clients can explicitly avoid exact count queries without changing default totals", async () => {
    const client = mongoose.connection.getClient(), commands = [];
    const listener = event => { if (event.command.aggregate === "hospitals") commands.push(event); };
    client.on("commandStarted", listener);
    let response;
    try { response = await request(app).get("/hospitals?pagination=cursor&includeTotal=false&limit=2"); }
    finally { client.off("commandStarted", listener); }
    assert.equal(response.status, 200); assert.equal(response.body.total, null);
    assert.equal(response.body.data.length, 2); assert.ok(response.body.nextCursor);
    assert.equal(commands.length, 1, "the page and evidence use one command");
    assert.equal(commands[0].command.pipeline.some(stage => stage.$unionWith), false, "includeTotal=false must omit the count branch");
    assert.equal((await request(app).get("/hospitals?pagination=cursor&limit=2")).body.total, 105);
    assert.equal((await request(app).get("/hospitals?includeTotal=false")).status, 400);
  });
  await t.test("public hospital responses exclude administrative lifecycle fields and cannot cache availability", async () => {
    await Hospital.updateOne({ _id: hospitals[0]._id }, { $set: { archiveReason: "Internal administrative context", archivedBy: system._id, archiveLeaseToken: "PRIVATE_HOSPITAL_LEASE" } });
    const response = await request(app).get("/hospitals?limit=1");
    assert.equal(response.status, 200); assert.equal(response.headers["cache-control"], "no-store");
    for (const field of ["admins", "archiveReason", "archivedBy", "archiveAttempts", "archivePending", "archiveLeaseToken", "__v"]) assert.equal(Object.hasOwn(response.body.data[0], field), false, field);
    assert.equal(response.body.data[0].bedsAvailable, null);
  });
  await t.test("joined reads match the batch composer for both timestamp branches, conflicts and source evidence", async () => {
    const filter = { _id: { $in: hospitals.slice(0, 3).map(h => h._id) } };
    const baseline = await Hospital.find(filter).select("-admins").sort({ name: 1, _id: 1 }).lean();
    const expected = await withHospitalData(baseline);
    const result = await readHospitalPage({ filter, projection: "-admins", limit: 3 });
    assert.deepEqual(result.data, expected);
    assert.equal(result.total, 3);
    assert.ok(result.data.every(row => ["__facilities", "__observed", "__retrieved", "__conflicts", "__claims", "__facilityClaims"].every(key => !Object.hasOwn(row, key))));
    const replies = [], client = mongoose.connection.getClient();
    const listener = event => { if (event.commandName === "aggregate") replies.push(JSON.stringify(event.reply)); };
    client.on("commandSucceeded", listener);
    try { await readHospitalPage({ filter, projection: "-admins", limit: 3 }); }
    finally { client.off("commandSucceeded", listener); }
    assert.ok(replies.every(reply => !reply.includes("INTERNAL_REVIEW_SHOULD_NOT_BE_FETCHED")));
  });
  await t.test("joined hospital page uses the directory index and limits rows before looking up evidence", async () => {
    await Hospital.init();
    const pipeline = hospitalPagePipeline({ filter: { archivedAt: null, approvalStatus: { $nin: ["pending", "rejected"] } },
      projection: "-admins", limit: 2, includeTotal: false });
    const plan = await Hospital.aggregate(pipeline).explain("executionStats");
    const stats = plan.stages[0].$cursor.executionStats;
    assert.equal(stats.nReturned, 2);
    assert.ok(stats.totalDocsExamined <= 4, JSON.stringify(stats));
    assert.ok(pipeline.findIndex(stage => stage.$limit) < pipeline.findIndex(stage => stage.$lookup));
  });
  await t.test("joined reads never revive expired or unverified availability or trust future observations", async () => {
    const now = Date.now();
    await AvailabilityObservation.create([
      { hospital: hospitals[3]._id, facility: "ICU", status: "available", quantity: 15, verificationStatus: "verified", observedAt: new Date(now - 31 * 60000) },
      { hospital: hospitals[4]._id, facility: "ICU", status: "available", quantity: 12, verificationStatus: "verified", observedAt: new Date(now - 60000) },
      { hospital: hospitals[4]._id, facility: "ICU", status: "available", quantity: 8, verificationStatus: "unverified", observedAt: new Date(now - 1000) },
      { hospital: hospitals[5]._id, facility: "ICU", status: "available", quantity: 7, verificationStatus: "verified", observedAt: new Date(now + 60000) },
    ]);
    const filter = { _id: { $in: hospitals.slice(3, 6).map(h => h._id) } };
    const base = await Hospital.find(filter).select("-admins").sort({ name: 1, _id: 1 }).lean();
    const result = await readHospitalPage({ filter, projection: "-admins", includeTotal: false });
    assert.deepEqual(result.data, await withHospitalData(base));
    assert.ok(result.data.every(row => row.bedsAvailable === null && row.emergencyStatus === "unknown"));
    for (const row of result.data) for (const facility of row.facilities) {
      assert.equal(facility.status, "unknown"); assert.equal(facility.count, null);
    }
  });
  await t.test("joined provider reads exclude archived parents, private fields and unapproved/inactive providers in one command", async () => {
    const parent = await Hospital.create({ name: "Hidden parent", archivedAt: new Date() });
    const rows = await ResourceProvider.create([
      { name: "Visible diagnostic", kind: "diagnostic", sourceName: "Fixture", approvalStatus: "approved", email: "private@example.test", archiveLeaseToken: "PRIVATE_LEASE" },
      { name: "Legacy diagnostic", kind: "diagnostic", sourceName: "Fixture" },
      { name: "Archived child", kind: "diagnostic", sourceName: "Fixture", hospital: parent._id },
      { name: "Pending diagnostic", kind: "diagnostic", sourceName: "Fixture", approvalStatus: "pending" },
      { name: "Rejected diagnostic", kind: "diagnostic", sourceName: "Fixture", approvalStatus: "rejected" },
      { name: "Inactive diagnostic", kind: "diagnostic", sourceName: "Fixture", active: false },
    ]);
    const client = mongoose.connection.getClient(), commands = [];
    const listener = event => { if (["find", "aggregate", "distinct"].includes(event.commandName)) commands.push(event); };
    client.on("commandStarted", listener);
    let actual;
    try { actual = await readPublicResources({ kind: "diagnostic" }); }
    finally { client.off("commandStarted", listener); }
    assert.equal(commands.length, 1);
    assert.deepEqual(actual.map(row => String(row._id)).sort(), rows.slice(0, 2).map(row => row.id).sort());
    assert.ok(actual.every(row => !Object.hasOwn(row, "email") && !Object.hasOwn(row, "archiveLeaseToken") && !Object.hasOwn(row, "__archivedParent")));
    await Hospital.updateOne({ _id: parent._id }, { $set: { archivedAt: null } });
    assert.equal((await readPublicResources({ kind: "diagnostic" })).length, 3, "parent lifecycle changes are reflected immediately");
  });
});
