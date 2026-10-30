import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { User } from "../src/models/User.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { ResourceInventory } from "../src/models/ResourceInventory.js";
import { InventoryObservation } from "../src/models/InventoryObservation.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { DiagnosticRequest } from "../src/models/DiagnosticRequest.js";
import { ResourceReservation } from "../src/models/ResourceReservation.js";
import { DiagnosticDailyCapacity } from "../src/models/DiagnosticDailyCapacity.js";
import { withCapacityTransaction, holdInventory, holdDiagnosticTests, transitionReservations, configureInventoryReservations, configureDiagnosticCapacity } from "../src/services/capacityReservations.js";
import { createRequestWithInventory, updateRequestWithInventory } from "../src/services/capacityRequestFlows.js";
import { createDiagnosticRequest, transitionDiagnosticRequest, indiaDate } from "../src/services/diagnosticRequests.js";
import { createEmergencyRequest } from "../src/services/emergencyRequestService.js";
import { expireCapacityHolds } from "../src/services/capacityExpiry.js";
import { updateInventory, publicInventorySnapshot } from "../src/services/inventoryService.js";
import { archiveProviderOrganization } from "../src/services/providerLifecycle.js";

const uri = process.env.MEDREACH_CAPACITY_TEST_MONGO_URI;
test("transactional capacity and request integrity on an isolated replica set", { skip: !uri, timeout: 120000 }, async t => {
  const parsed = new URL(uri);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.protocol, "mongodb:"); assert.equal(parsed.pathname, "/medreach_capacity_test");
  const previousFlag = process.env.DIAGNOSTIC_CAPACITY_ENABLED;
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  assert.equal((await mongoose.connection.db.admin().command({ hello: 1 })).setName, "medreach-capacity-test");
  await mongoose.connection.dropDatabase();
  t.after(async () => {
    if (previousFlag === undefined) delete process.env.DIAGNOSTIC_CAPACITY_ENABLED; else process.env.DIAGNOSTIC_CAPACITY_ENABLED = previousFlag;
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  });
  for (const Model of [Hospital, ResourceProvider, User, ProviderMembership, ResourceInventory, InventoryObservation, AuditLog,
    EmergencyRequest, DiagnosticRequest, ResourceReservation, DiagnosticDailyCapacity]) {
    await Model.createCollection(); await Model.createIndexes();
  }
  const [admin, patient, outsider] = await User.create([
    { name: "Capacity Provider", email: "capacity-provider@example.test", role: "provider_admin" },
    { name: "Capacity Patient", email: "capacity-patient@example.test", role: "user" },
    { name: "Other Provider", email: "capacity-other@example.test", role: "provider_admin" },
  ]);
  const hospital = await Hospital.create({ name: "Capacity Synthetic Hospital", approvalStatus: "approved" });
  const centre = await ResourceProvider.create({ kind: "diagnostic", name: "Capacity Synthetic Centre", sourceName: "Synthetic test fixture", approvalStatus: "approved", active: true });
  await ProviderMembership.create([
    { user: admin._id, organization: hospital._id, kind: "hospital", assignedBy: admin._id },
    { user: admin._id, organization: centre._id, kind: "diagnostic", assignedBy: admin._id },
  ]);
  const actor = { id: String(admin._id), role: "provider_admin", providerIds: [String(centre._id)], hospitalIds: [String(hospital._id)] };
  const inventory = async (capacity = 1, extra = {}) => {
    await ResourceReservation.deleteMany({}); await ResourceInventory.deleteMany({}); await InventoryObservation.deleteMany({});
    return ResourceInventory.create({ kind: "hospital", organization: hospital._id, resourceKey: "general_beds", unit: "beds",
      capacity, occupied: 0, blocked: 0, held: 0, available: capacity, version: 1, updatedBy: admin._id,
      observedAt: new Date(), classification: "provider_confirmed", reportingMethod: "provider_report", reservationsEnabled: true, ...extra });
  };
  const bedValues = () => ({ requestId: `CAP-${new mongoose.Types.ObjectId()}`, hospital: hospital._id, emergencyType: "general",
    requiredFacility: "Emergency Department", contactPhone: "+919876543210", isEmergency: false, expiresAt: new Date(Date.now() + 7200000) });
  const allocation = { kind: "hospital", organizationId: hospital._id, resourceKey: "general_beds", quantity: 1, actorId: patient._id };

  await t.test("two patients cannot allocate the same last bed; failed requests do not persist", async () => {
    await inventory();
    const before = await EmergencyRequest.countDocuments();
    const results = await Promise.allSettled([createRequestWithInventory(EmergencyRequest, bedValues(), allocation), createRequestWithInventory(EmergencyRequest, bedValues(), allocation)]);
    assert.equal(results.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(results.find(value => value.status === "rejected").reason.code, "CAPACITY_FULL");
    assert.equal(await EmergencyRequest.countDocuments(), before + 1);
    const row = await ResourceInventory.findOne({}); assert.equal(row.available, 0); assert.equal(row.held, 1);
    const held = await ResourceReservation.findOne({});
    await withCapacityTransaction(session => holdInventory({ ...allocation, session, requestType: "hospital", requestId: held.requestId }));
    assert.equal((await ResourceInventory.findOne({})).held, 1);
  });
  await t.test("confirmation does not deduct twice; admission and discharge are idempotent", async () => {
    const held = await ResourceReservation.findOne({});
    for (const action of ["confirm", "confirm", "admit", "admit"]) await withCapacityTransaction(session => transitionReservations({ session, requestType: "hospital", requestId: held.requestId, action, actorId: admin._id }));
    let row = await ResourceInventory.findOne({}); assert.equal(row.occupied, 1); assert.equal(row.held, 0); assert.equal(row.available, 0);
    await assert.rejects(updateRequestWithInventory({ Model: EmergencyRequest,
      row: { _id: held.requestId, capacityAllocation: { mode: "admitted" } }, filter: { _id: held.requestId }, update: { $set: { status: "COMPLETED" } }, status: "COMPLETED", actorId: admin._id,
    }), error => error.code === "CAPACITY_ADMISSION_OPEN");
    assert.equal((await ResourceInventory.findOne({})).occupied, 1);
    for (const action of ["discharge", "discharge"]) await withCapacityTransaction(session => transitionReservations({ session, requestType: "hospital", requestId: held.requestId, action, actorId: admin._id }));
    row = await ResourceInventory.findOne({}); assert.equal(row.occupied, 0); assert.equal(row.available, 1);
  });
  await t.test("expired holds release capacity and expire the request exactly once", async () => {
    await inventory();
    const row = await createRequestWithInventory(EmergencyRequest, bedValues(), allocation);
    const now = new Date(Date.now() + 11 * 60000);
    await Promise.all([expireCapacityHolds({ now }), expireCapacityHolds({ now })]);
    assert.equal((await EmergencyRequest.findById(row._id)).status, "EXPIRED");
    const current = await ResourceInventory.findOne({}); assert.equal(current.held, 0); assert.equal(current.available, 1);
    assert.equal((await ResourceReservation.findOne({})).state, "expired");
  });
  await t.test("demo and stale inventory stay unknown; emergency submission is never blocked by zero beds", async () => {
    for (const extra of [{ classification: "demo" }, { observedAt: new Date(Date.now() - 31 * 60000) }, { available: null }]) {
      const row = await inventory(1, extra);
      const result = await createRequestWithInventory(EmergencyRequest, bedValues(), allocation);
      assert.equal(result.capacityAllocation.mode, "coordination");
      assert.equal((await ResourceInventory.findById(row._id)).held, 0);
      assert.equal(publicInventorySnapshot(row).available, null);
    }
    await inventory(0);
    const result = await createEmergencyRequest({ hospitalId: hospital._id, emergencyType: "general", requiredFacility: "ICU", contactPhone: "+919876543210", isEmergency: true }, { id: String(patient._id), role: "user" });
    assert.equal(result.request.capacityAllocation.mode, "coordination");
    assert.equal(await ResourceReservation.countDocuments(), 0);
  });
  await t.test("provider isolation and managed held values cannot be forged", async () => {
    const row = await inventory(3);
    await assert.rejects(configureInventoryReservations({ kind: "hospital", organizationId: hospital._id, resourceKey: "general_beds", input: { enabled: false, expectedVersion: 1 }, actor: { id: String(outsider._id) } }), error => error.status === 403);
    await createRequestWithInventory(EmergencyRequest, bedValues(), allocation);
    const latest = await ResourceInventory.findById(row._id);
    await assert.rejects(updateInventory({ kind: "hospital", organizationId: hospital._id, resourceKey: "general_beds", actor,
      input: { expectedVersion: latest.version, capacity: 3, occupied: 0, blocked: 0, held: 0, observedAt: new Date().toISOString(), reportingMethod: "provider_report" } }), error => error.code === "MANAGED_HOLDS");
    assert.equal((await ResourceInventory.findById(row._id)).held, 1);
    const system = await User.create({ name: "Capacity System Admin", email: "capacity-system@example.test", role: "system_admin" });
    await assert.rejects(archiveProviderOrganization({ kind: "hospital", id: hospital._id, actor: { id: String(system._id) }, reason: "Archive safety check" }), error => error.code === "ACTIVE_CAPACITY_ALLOCATIONS");
    assert.equal((await Hospital.findById(hospital._id)).archivedAt, null);
  });
  process.env.DIAGNOSTIC_CAPACITY_ENABLED = "true";
  const date = indiaDate(new Date(Date.now() + 86400000));
  const diagnostic = (overrides = {}) => ({ user: { id: String(patient._id), role: "user" }, body: { providerId: String(centre._id), tests: ["CBC"],
    patientName: "Synthetic Patient", contactPhone: "+919876543210", preferredDate: date, preferredTime: "MORNING", consent: true, urgency: "ROUTINE", ...overrides } });
  await t.test("30 concurrent routine patients fill one test and date; patient 31 cannot book", async () => {
    await DiagnosticDailyCapacity.create({ organization: centre._id, test: "CBC", date, capacity: 30, urgentCapacity: 0,
      classification: "platform_policy", verifiedAt: new Date(), version: 1 });
    const results = await Promise.allSettled(Array.from({ length: 31 }, () => createDiagnosticRequest(diagnostic())));
    assert.equal(results.filter(value => value.status === "fulfilled").length, 30);
    assert.equal(results.find(value => value.status === "rejected").reason.code, "CAPACITY_FULL");
    assert.equal(await DiagnosticRequest.countDocuments({ provider: centre._id, tests: "CBC", preferredDate: date }), 30);
    assert.equal((await DiagnosticDailyCapacity.findOne({ test: "CBC", date })).held, 30);
  });
  await t.test("full dates permit emergency review and other dates; no partial multi-test booking", async () => {
    const urgent = await createDiagnosticRequest(diagnostic({ urgency: "URGENT" }));
    assert.equal(urgent.record.capacityAllocation.mode, "coordination");
    assert.equal(urgent.record.capacityAllocation.reason, "EMERGENCY_CAPACITY_REVIEW_REQUIRED");
    const count = await ResourceReservation.countDocuments();
    await assert.rejects(createDiagnosticRequest(diagnostic({ tests: ["CBC", "LIPID_PROFILE"] })), error => error.code === "CAPACITY_FULL");
    assert.equal(await ResourceReservation.countDocuments(), count);
    assert.equal(await DiagnosticDailyCapacity.countDocuments({ test: "LIPID_PROFILE", date }), 0);
    const next = await createDiagnosticRequest(diagnostic({ preferredDate: indiaDate(new Date(Date.now() + 2 * 86400000)) }));
    assert.equal(next.record.capacityAllocation.mode, "held");
    const confirmed = await transitionDiagnosticRequest({ user: actor, params: { id: urgent.record.id }, body: {
      status: "CONFIRMED", expectedVersion: 0, acceptedTests: ["CBC"], appointmentAt: `${date}T10:00:00+05:30`, providerResponse: "The centre arranged an additional emergency appointment with the duty team.",
    } });
    assert.equal(confirmed.status, "CONFIRMED");
    assert.equal((await DiagnosticDailyCapacity.findOne({ test: "CBC", date })).held, 30);
  });
  await t.test("cancellation reopens one slot; confirmed appointments survive the hold expiry worker", async () => {
    const row = await DiagnosticRequest.findOne({ preferredDate: date, urgency: "ROUTINE" });
    await transitionDiagnosticRequest({ user: { id: String(patient._id) }, get: () => undefined, params: { reference: row.reference }, body: { expectedVersion: row.version } }, { cancel: true });
    assert.equal((await DiagnosticDailyCapacity.findOne({ test: "CBC", date })).held, 29);
    const another = await createDiagnosticRequest(diagnostic());
    await transitionDiagnosticRequest({ user: actor, params: { id: another.record.id }, body: { expectedVersion: 0, status: "CONFIRMED", acceptedTests: ["CBC"], appointmentAt: `${date}T11:00:00+05:30` } });
    await expireCapacityHolds({ now: new Date(Date.now() + 11 * 60000), limit: 100 });
    assert.equal((await DiagnosticRequest.findById(another.record._id)).status, "CONFIRMED");
    const reserved = await ResourceReservation.findOne({ requestId: another.record._id }); assert.equal(reserved.state, "confirmed");
  });
  await t.test("capacity cannot exceed 30 or cross organisation boundaries", async () => {
    await assert.rejects(configureDiagnosticCapacity({ organizationId: centre._id, actor, input: { test: "CBC", date, capacity: 31, urgentCapacity: 0, expectedVersion: 1 } }), error => error.status === 400);
    await assert.rejects(configureDiagnosticCapacity({ organizationId: centre._id, actor: { id: String(outsider._id) }, input: { test: "CBC", date, capacity: 30, urgentCapacity: 0, expectedVersion: 1 } }), error => error.status === 403);
  });
  await t.test("daily reads preserve unknown counts and reject invalid date shapes", async () => {
    const app = createApp();
    const path = `/api/capacity/diagnostic/${centre._id}/daily`;
    let response = await request(app).get(`${path}?date=${date}`).expect(200);
    assert.equal(response.body.data.find(row => row.test === "CBC").routineRemaining, 29);
    await DiagnosticDailyCapacity.collection.updateOne({ organization: centre._id, test: "CBC", date }, { $set: { held: null } });
    response = await request(app).get(`${path}?date=${date}`).expect(200);
    assert.equal(response.body.data.find(row => row.test === "CBC").routineRemaining, null);
    await request(app).get(`${path}?date=2027-02-30`).expect(400);
    await request(app).get(`${path}?date[$gt]=2026-01-01`).expect(400);
  });
});
