import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import express from "express";
import request from "supertest";
import inventoryRouter from "../src/routes/inventory.js";
import { errorHandler } from "../src/middleware/error.js";
import { ResourceInventory } from "../src/models/ResourceInventory.js";
import { InventoryObservation } from "../src/models/InventoryObservation.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { User } from "../src/models/User.js";
import { AuthToken } from "../src/models/AuthToken.js";
import { signSessionToken } from "./helpers/session.js";
import { updateInventory, getPublicInventory, getInventoryHistory, reconcileInventoryJournal } from "../src/services/inventoryService.js";
const uri = process.env.MEDREACH_INVENTORY_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/medreach_inventory_test$/.test(uri));
test("inventory API, isolation, concurrency, failure and recovery", { skip: !isolated, timeout: 90000 }, async (t) => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await Promise.all([ResourceInventory, InventoryObservation, AuditLog, ProviderMembership, Hospital, ResourceProvider, User, AuthToken].map((Model) => Model.init()));
  const [provider, other, system, patient, legacy] = await User.create(["provider_admin", "provider_admin", "system_admin", "user", "hospital_admin"].map((role, i) => ({ name: `Isolated ${role}`, email: `${i}@inventory.example`, role, accountStatus: "active" })));
  const [hospital, unrelated, pending] = await Hospital.create([{ name: "Isolated inventory hospital", approvalStatus: "approved" }, { name: "Other isolated hospital", approvalStatus: "approved" }, { name: "Pending isolated hospital", approvalStatus: "pending" }]);
  const bank = await ResourceProvider.create({ name: "Isolated bank", kind: "blood_bank", sourceName: "Isolated test", approvalStatus: "approved" });
  await ProviderMembership.create([{ user: provider._id, organization: hospital._id, kind: "hospital", assignedBy: system._id }, { user: provider._id, organization: bank._id, kind: "blood_bank", assignedBy: system._id }]);
  const actor = { id: String(provider._id) }, base = { kind: "hospital", organizationId: String(hospital._id), resourceKey: "general_beds", actor };
  const data = (version, change = {}) => ({ expectedVersion: version, capacity: 50, occupied: 10, blocked: 0, held: 0, observedAt: new Date().toISOString(), reportingMethod: "manual_inventory", ...change });
  const app = express(); app.use(express.json()); app.use("/api/inventory", inventoryRouter); app.use(errorHandler);
  const auth = (user) => signSessionToken(user).then((token) => ({ Authorization: `Bearer ${token}` }));
  await t.test("public unknown, request validation and direct API permission checks", async () => {
    const empty = await request(app).get(`/api/inventory/hospital/${hospital._id}`);
    assert.equal(empty.status, 200); assert.equal(empty.body.data.length, 2); assert.equal(empty.body.data[0].available, null);
    assert.equal((await request(app).get(`/api/inventory/hospital/${pending._id}`)).status, 404);
    assert.equal((await request(app).put(`/api/inventory/hospital/${hospital._id}/general_beds`).send(data(0))).status, 401);
    for (const user of [other, system, patient, legacy]) assert.equal((await request(app).put(`/api/inventory/hospital/${hospital._id}/general_beds`).set(await auth(user)).send(data(0))).status, 403);
    assert.equal((await request(app).put(`/api/inventory/hospital/${unrelated._id}/general_beds`).set(await auth(provider)).send(data(0))).status, 403);
    const created = await request(app).put(`/api/inventory/hospital/${hospital._id}/general_beds`).set(await auth(provider)).send(data(0));
    assert.equal(created.status, 200, JSON.stringify(created.body)); assert.equal(created.body.inventory.available, 40);
    assert.equal(await AuditLog.countDocuments({ entityType: "ResourceInventory" }), 1);
    assert.equal(await InventoryObservation.countDocuments(), 1);
  });
  await t.test("two admins updating the same version result in exactly one committed change", async () => {
    const results = await Promise.allSettled([updateInventory({ ...base, input: data(1, { occupied: 20 }) }), updateInventory({ ...base, input: data(1, { occupied: 30 }) })]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
    assert.equal((await ResourceInventory.findOne({ organization: hospital._id })).version, 2);
  });
  await t.test("older observations cannot overwrite current inventory", async () => {
    await assert.rejects(updateInventory({ ...base, input: data(2, { observedAt: new Date(Date.now() - 10000).toISOString() }) }), (error) => error.code === "STALE_OBSERVATION");
    assert.equal((await ResourceInventory.findOne({ organization: hospital._id })).version, 2);
  });
  await t.test("history write failure commits durable journal, history stays visible, retries do not duplicate", async () => {
    const original = InventoryObservation.updateOne;
    InventoryObservation.updateOne = async () => { throw new Error("Simulated history interruption"); };
    try {
      const result = await updateInventory({ ...base, input: data(2) });
      assert.equal(result.inventory.version, 3); assert.equal(result.historyPending, true);
      const history = await getInventoryHistory({ ...base }); assert.equal(history.data[0].version, 3);
      await assert.rejects(updateInventory({ ...base, input: data(2) }), (error) => error.status === 409);
    } finally { InventoryObservation.updateOne = original; }
    assert.equal((await reconcileInventoryJournal()).recovered, 1);
    assert.equal((await reconcileInventoryJournal()).recovered, 0);
    assert.equal(await InventoryObservation.countDocuments(), 3);
    assert.equal(await AuditLog.countDocuments({ entityType: "ResourceInventory" }), 3);
  });
  await t.test("partial materialization recovery and concurrent workers preserve unique event records", async () => {
    const original = AuditLog.updateOne;
    AuditLog.updateOne = async () => { throw new Error("Simulated audit outage"); };
    try { assert.equal((await updateInventory({ ...base, input: data(3) })).historyPending, true); }
    finally { AuditLog.updateOne = original; }
    assert.equal(await InventoryObservation.countDocuments(), 4);
    await Promise.all([reconcileInventoryJournal(), reconcileInventoryJournal()]);
    assert.equal(await InventoryObservation.countDocuments(), 4);
    assert.equal(await AuditLog.countDocuments({ entityType: "ResourceInventory" }), 4);
    assert.equal((await ResourceInventory.findOne({ organization: hospital._id }).select("+pendingEvents")).pendingEvents.length, 0);
  });
  await t.test("confirmed zero, unknown and expiry preserve safe public semantics", async () => {
    await updateInventory({ ...base, input: data(4, { occupied: 50 }) });
    assert.equal((await getPublicInventory(base)).data.find((r) => r.resourceKey === "general_beds").available, 0);
    assert.equal((await getPublicInventory({ ...base, now: new Date(Date.now() + 31 * 60000) })).data.find((r) => r.resourceKey === "general_beds").available, null);
    await updateInventory({ ...base, input: data(5, { occupied: null }) });
    assert.equal((await getPublicInventory(base)).data.find((r) => r.resourceKey === "general_beds").available, null);
    assert.equal((await getPublicInventory(base)).data.some((r) => "updatedBy" in r || "pendingEvents" in r), false);
  });
  await t.test("concurrent creation is unique and generic provider resources are supported", async () => {
    const target = { kind: "blood_bank", organizationId: String(bank._id), resourceKey: "o_positive_red_cells", actor };
    const results = await Promise.allSettled([updateInventory({ ...target, input: data(0, { unit: "units", capacity: 30 }) }), updateInventory({ ...target, input: data(0, { unit: "units", capacity: 30 }) })]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
    assert.equal(await ResourceInventory.countDocuments({ organization: bank._id }), 1);
    assert.equal((await getPublicInventory(target)).data[0].unit, "units");
    assert.equal((await getPublicInventory(target)).data[0].available, 20);
  });
  await t.test("availability expiring during the database read is withheld at response time", async (t) => {
    const startedAt = Date.now();
    const target = { ...base, resourceKey: "slow_read" };
    const created = await updateInventory({ ...target, input: data(0, { unit: "beds", observedAt: new Date(startedAt - 1800000 + 1000).toISOString() }) });
    t.mock.timers.enable({ apis: ["Date"], now: startedAt });
    const originalFind = ResourceInventory.find;
    t.mock.method(ResourceInventory, "find", function (...args) {
      const query = originalFind.apply(this, args), originalLean = query.lean;
      query.lean = async function (...leanArgs) {
        const result = await originalLean.apply(this, leanArgs);
        t.mock.timers.tick(2000);
        return result;
      };
      return query;
    });
    const result = (await getPublicInventory(target)).data.find(row => row.resourceKey === target.resourceKey);
    assert.equal(result.available, null);
    assert.equal(result.capacity, null);
    assert.equal(result.freshness, "outdated");
    const stored = await ResourceInventory.findById(created.inventory._id).lean();
    assert.equal(stored.available, 40, "read protection does not mutate the underlying record");
  });
  await t.test("public hospital inventory performs one organisation lookup", async (t) => {
    let lookups = 0;
    const original = Hospital.findOne;
    t.mock.method(Hospital, "findOne", function (...args) { lookups++; return original.apply(this, args); });
    const result = await getPublicInventory(base);
    assert.ok(result.data.length >= 2);
    assert.equal(lookups, 1, "avoid reading the same hospital twice before fetching inventory");
  });
  await t.test("inventory lifecycle checks exclude archived, inactive and missing-parent providers while retaining history", async () => {
    const parent = await Hospital.create({ name: "Isolated lifecycle parent", approvalStatus: "approved" });
    const child = await ResourceProvider.create({ name: "Isolated lifecycle diagnostic", kind: "diagnostic", hospital: parent._id, active: true, sourceName: "Isolated test", approvalStatus: "approved" });
    const target = { kind: "diagnostic", organizationId: child.id };
    assert.deepEqual((await getPublicInventory(target)).data, []);
    await Hospital.updateOne({ _id: parent._id }, { $set: { archivedAt: new Date() } });
    await assert.rejects(getPublicInventory(target), error => error.status === 404);
    assert.deepEqual((await getInventoryHistory({ ...target, resourceKey: "appointments", actor: { id: system.id } })).data, []);
    await ResourceProvider.updateOne({ _id: child._id }, { $set: { hospital: new mongoose.Types.ObjectId() } });
    await assert.rejects(getPublicInventory(target), error => error.status === 404);
    await ResourceProvider.updateOne({ _id: child._id }, { $unset: { hospital: 1 }, $set: { active: false } });
    await assert.rejects(getPublicInventory(target), error => error.status === 404);
    await ResourceProvider.updateOne({ _id: child._id }, { $set: { active: true, archivedAt: new Date() } });
    await assert.rejects(getPublicInventory(target), error => error.status === 404);
    assert.deepEqual((await getInventoryHistory({ ...target, resourceKey: "appointments", actor: { id: system.id } })).data, []);
    await assert.rejects(getPublicInventory({ kind: "hospital", organizationId: parent.id }), error => error.status === 404);
  });
  await t.test("full durable recovery backlog rejects further writes without discarding history", async () => {
    const current = await ResourceInventory.findOne({ organization: hospital._id }).select("+pendingEvents").lean();
    const journal = Array.from({ length: 100 }, (_, i) => ({ _id: new mongoose.Types.ObjectId(), actor: provider._id, version: i + 100, occurredAt: new Date(), before: null, after: { version: i + 100, classification: "provider_confirmed", reportingMethod: "manual_inventory" } }));
    await ResourceInventory.updateOne({ _id: current._id }, { $set: { pendingEvents: journal } });
    await assert.rejects(updateInventory({ ...base, input: data(6) }), (error) => error.status === 503);
    const unchanged = await ResourceInventory.findById(current._id).select("+pendingEvents").lean();
    assert.equal(unchanged.version, 6); assert.equal(unchanged.pendingEvents.length, 100);
    await ResourceInventory.updateOne({ _id: current._id }, { $set: { pendingEvents: [] } });
  });
  await t.test("database reconnection retains current state and observation history", async () => {
    await mongoose.disconnect(); await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    assert.equal((await ResourceInventory.findOne({ organization: hospital._id })).version, 6);
    assert.equal((await getInventoryHistory({ ...base })).data.length, 6);
    await assert.rejects(getInventoryHistory({ ...base, limit: [1] }), (error) => error.status === 400);
  });
  await t.test("journal retries have a per-event budget, backoff, exclusive claims and explicit operator recovery", async () => {
    const target = { ...base, resourceKey: "recovery_test" };
    const original = AuditLog.updateOne;
    let failures = 0;
    AuditLog.updateOne = async () => { failures++; throw new Error("private outage details must not persist"); };
    const started = Date.now();
    try {
      const result = await updateInventory({ ...target, input: data(0, { unit: "beds" }) });
      assert.equal(result.historyPending, true);
      let record = await ResourceInventory.findOne({ resourceKey: target.resourceKey }).select("+pendingEvents").lean();
      assert.equal(record.pendingEvents[0].recoveryAttempts, 0, "inline failure does not consume automatic retries");
      for (let attempt = 1; attempt <= 5; attempt++) {
        const now = new Date(started + attempt * 60000);
        const outcomes = await Promise.all(Array.from({ length: 8 }, () => reconcileInventoryJournal({ now })));
        assert.equal(outcomes.reduce((sum, row) => sum + row.failed, 0), 1, `one attempt across eight workers at retry ${attempt}`);
        record = await ResourceInventory.findOne({ resourceKey: target.resourceKey }).select("+pendingEvents").lean();
        assert.equal(record.pendingEvents[0].recoveryAttempts, attempt);
        assert.equal(record.pendingEvents[0].recoveryLeaseToken, undefined);
        assert.equal(record.pendingEvents[0].errorCode, "INVENTORY_RECOVERY_FAILED");
        assert.equal((await reconcileInventoryJournal({ now })).failed, 0, "backoff prevents an immediate retry");
      }
      assert.ok(record.pendingEvents[0].exhaustedAt instanceof Date);
      assert.equal(failures, 6, "one inline failure plus five persisted recovery attempts");
      const terminal = await reconcileInventoryJournal({ now: new Date(started + 20 * 60000) });
      assert.equal(terminal.failed, 0); assert.equal(terminal.recovered, 0); assert.equal(terminal.exhausted, 1);
      assert.equal(failures, 6, "new scheduled jobs do not reset the exhausted event budget");
      const history = await getInventoryHistory(target);
      assert.equal(history.data[0].historyPending, true); assert.equal(history.data[0].recoveryAttempts, 5);
      assert.ok(history.data[0].exhaustedAt); assert.equal(history.data[0].snapshot.available, 40);
      assert.equal((await getPublicInventory(target)).data.find(row => row.resourceKey === target.resourceKey).available, 40);
      assert.equal(JSON.stringify(history).includes("private outage"), false);
      await assert.rejects(reconcileInventoryJournal({ recoverExhausted: true }), error => error.status === 403);
      await assert.rejects(reconcileInventoryJournal({ recoverExhausted: true, actor }), error => error.status === 403);
      const manual = await reconcileInventoryJournal({ now: new Date(started + 21 * 60000), recoverExhausted: true, actor: { id: system.id } });
      assert.equal(manual.failed, 1); assert.equal(manual.exhausted, 1);
      record = await ResourceInventory.findOne({ resourceKey: target.resourceKey }).select("+pendingEvents").lean();
      assert.equal(record.pendingEvents[0].recoveryAttempts, 5, "manual attempt preserves the exhausted automatic budget");
    } finally { AuditLog.updateOne = original; }
    const recovered = await reconcileInventoryJournal({ now: new Date(started + 22 * 60000), recoverExhausted: true, actor: { id: system.id } });
    assert.equal(recovered.recovered, 1); assert.equal(recovered.exhausted, 0);
    const record = await ResourceInventory.findOne({ resourceKey: target.resourceKey }).select("+pendingEvents").lean();
    assert.equal(record.pendingEvents.length, 0); assert.equal(record.version, 1); assert.equal(record.available, 40);
    assert.equal(await InventoryObservation.countDocuments({ inventory: record._id }), 1);
    assert.equal(await AuditLog.countDocuments({ entityId: record._id, entityType: "ResourceInventory" }), 1);
  });
  await t.test("a crash on the last recovery claim becomes exhausted without automatic replay", async () => {
    const target = { ...base, resourceKey: "crashed_recovery" };
    const original = InventoryObservation.updateOne;
    InventoryObservation.updateOne = async () => { throw new Error("History interrupted"); };
    try { assert.equal((await updateInventory({ ...target, input: data(0, { unit: "beds" }) })).historyPending, true); }
    finally { InventoryObservation.updateOne = original; }
    const record = await ResourceInventory.findOne({ resourceKey: target.resourceKey }).select("+pendingEvents").lean();
    await ResourceInventory.updateOne({ _id: record._id }, { $set: {
      "pendingEvents.0.recoveryAttempts": 5, "pendingEvents.0.recoveryLeaseToken": "dead-worker",
      "pendingEvents.0.recoveryLeaseUntil": new Date(Date.now() - 1),
    } });
    const result = await reconcileInventoryJournal();
    assert.equal(result.recovered, 0); assert.equal(result.exhausted, 1);
    assert.equal(await InventoryObservation.countDocuments({ inventory: record._id }), 0);
    const history = await getInventoryHistory(target);
    assert.equal(history.data[0].errorCode, "INVENTORY_RECOVERY_LEASE_EXPIRED");
    assert.equal(history.data[0].recoveryAttempts, 5); assert.ok(history.data[0].exhaustedAt);
    assert.equal((await reconcileInventoryJournal({ recoverExhausted: true, actor: { id: system.id } })).recovered, 1);
  });
  await t.test("a stale projection worker cannot clear or overwrite a newer recovery claim", async () => {
    const target = { ...base, resourceKey: "fenced_recovery" };
    const originalObservation = InventoryObservation.updateOne, originalAudit = AuditLog.updateOne;
    InventoryObservation.updateOne = async () => { throw new Error("Initial interruption"); };
    try { await updateInventory({ ...target, input: data(0, { unit: "beds" }) }); }
    finally { InventoryObservation.updateOne = originalObservation; }
    let release, entered, blocked = false;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    InventoryObservation.updateOne = function (...args) {
      if (!blocked) { blocked = true; entered(); return gate.then(() => originalObservation.apply(this, args)); }
      return originalObservation.apply(this, args);
    };
    const now = new Date(); let first;
    try {
      first = reconcileInventoryJournal({ now }); await started;
      AuditLog.updateOne = async () => { throw Object.assign(new Error("New claim audit outage"), { code: "AUDIT_UNAVAILABLE" }); };
      assert.equal((await reconcileInventoryJournal({ now: new Date(now.getTime() + 61000) })).failed, 1);
      AuditLog.updateOne = originalAudit;
      release(); const stale = await first;
      assert.equal(stale.recovered, 0); assert.equal(stale.failed, 1);
      const current = await ResourceInventory.findOne({ resourceKey: target.resourceKey }).select("+pendingEvents").lean();
      assert.equal(current.pendingEvents.length, 1); assert.equal(current.pendingEvents[0].recoveryAttempts, 2);
      assert.equal(current.pendingEvents[0].errorCode, "AUDIT_UNAVAILABLE");
      assert.equal((await reconcileInventoryJournal({ now: new Date(now.getTime() + 65000) })).recovered, 1);
      assert.equal(await InventoryObservation.countDocuments({ inventory: current._id }), 1);
      assert.equal(await AuditLog.countDocuments({ entityId: current._id, entityType: "ResourceInventory" }), 1);
    } finally {
      release(); if (first) await first;
      InventoryObservation.updateOne = originalObservation; AuditLog.updateOne = originalAudit;
    }
  });
  await t.test("recovery metadata write outages propagate rather than reporting an empty success", async () => {
    const target = { ...base, resourceKey: "metadata_recovery" };
    const originalObservation = InventoryObservation.updateOne, originalInventory = ResourceInventory.updateOne;
    InventoryObservation.updateOne = async () => { throw new Error("History unavailable"); };
    const now = new Date();
    try {
      await updateInventory({ ...target, input: data(0, { unit: "beds" }) });
      ResourceInventory.updateOne = function (filter, update, ...args) {
        if (update.$set?.["pendingEvents.$.errorCode"]) throw new Error("Recovery metadata unavailable");
        return originalInventory.call(this, filter, update, ...args);
      };
      await assert.rejects(reconcileInventoryJournal({ now }), /Recovery metadata unavailable/);
    } finally { InventoryObservation.updateOne = originalObservation; ResourceInventory.updateOne = originalInventory; }
    const current = await ResourceInventory.findOne({ resourceKey: target.resourceKey }).select("+pendingEvents").lean();
    assert.equal(current.pendingEvents.length, 1); assert.equal(current.pendingEvents[0].recoveryAttempts, 1);
    assert.ok(current.pendingEvents[0].recoveryLeaseToken);
    assert.equal((await reconcileInventoryJournal({ now: new Date(now.getTime() + 61000) })).recovered, 1);
  });
  await t.test("history pagination, membership revocation, forged kind and inactive account fail closed", async () => {
    const first = await getInventoryHistory({ ...base, limit: 2 }); assert.deepEqual(first.data.map((r) => r.version), [6, 5]);
    assert.deepEqual((await getInventoryHistory({ ...base, limit: 2, before: first.nextCursor })).data.map((r) => r.version), [4, 3]);
    await assert.rejects(getInventoryHistory({ ...base, actor: { id: String(other._id) } }), (error) => error.status === 403);
    await assert.rejects(updateInventory({ ...base, kind: "diagnostic", organizationId: String(bank._id), resourceKey: "slots", input: data(0, { unit: "appointments" }) }), (error) => error.status === 403);
    await User.updateOne({ _id: provider._id }, { $set: { accountStatus: "suspended" } });
    await assert.rejects(updateInventory({ ...base, input: data(6) }), (error) => error.status === 403);
    await User.updateOne({ _id: provider._id }, { $set: { accountStatus: "active" } });
    await ProviderMembership.updateOne({ user: provider._id, organization: hospital._id }, { $set: { active: false } });
    await assert.rejects(updateInventory({ ...base, input: data(6) }), (error) => error.status === 403);
  });
});
