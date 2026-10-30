import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createInventoryDemo } from "../src/services/inventoryDemo.js";
import { auditBackendData } from "../src/services/dataQualityAudit.js";

const uri = process.env.MEDREACH_INVENTORY_DEMO_TEST_MONGO_URI;
const allowed = Boolean(uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):[0-9]+\/medreach_inventory_demo_test$/.test(uri));
test("isolated native-driver demo fixtures and read-only data audit", { skip: !allowed, timeout: 30000 }, async (t) => {
  const client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
  await client.connect();
  const db = client.db("medreach_inventory_demo_test");
  await db.dropDatabase();
  t.after(async () => { await db.dropDatabase(); await client.close(); });
  const config = { NODE_ENV: "test", EMAIL_ENABLED: "false" };
  let report;
  await t.test("creates six synthetic hospitals and twelve classified inventories without accounts", async () => {
    report = await createInventoryDemo(db, { uri, config });
    assert.deepEqual(report.created, { hospitals: 6, inventories: 12, capabilities: 6 });
    assert.equal(await db.collection("users").countDocuments(), 0);
    assert.equal(await db.collection("providermemberships").countDocuments(), 0);
    assert.equal(await db.collection("resourceinventories").countDocuments({ classification: "demo", reportingMethod: "demo_fixture" }), 12);
    assert.equal(await db.collection("resourceinventories").countDocuments({ resourceKey: "general_beds", capacity: 30 }), 6);
    assert.equal(await db.collection("resourceinventories").countDocuments({ resourceKey: "icu_beds", capacity: 10 }), 6);
  });
  await t.test("rerun preserves identifiers, changes to existing values and observation timestamps", async () => {
    const before = await db.collection("resourceinventories").findOne({ resourceKey: "general_beds" });
    await db.collection("resourceinventories").updateOne({ _id: before._id }, { $set: { occupied: 3, available: 27, version: 2 } });
    const again = await createInventoryDemo(db, { uri, config, now: new Date(Date.now() + 60000) });
    assert.deepEqual(again.created, { hospitals: 0, inventories: 0, capabilities: 0 });
    const after = await db.collection("resourceinventories").findOne({ _id: before._id });
    assert.equal(after.version, 2); assert.equal(after.available, 27); assert.deepEqual(after.observedAt, before.observedAt);
  });
  await t.test("parallel fixture invocations converge without duplicate organisations", async () => {
    await Promise.all([createInventoryDemo(db, { uri, config }), createInventoryDemo(db, { uri, config })]);
    assert.equal(await db.collection("hospitals").countDocuments(), 6);
    assert.equal(await db.collection("resourceinventories").countDocuments(), 12);
  });
  await t.test("identity collision refuses every write", async () => {
    const before = await db.collection("hospitals").findOne({});
    await db.collection("hospitals").updateOne({ _id: before._id }, { $set: { demo: false } });
    await assert.rejects(createInventoryDemo(db, { uri, config }), /collides/);
    assert.equal(await db.collection("resourceinventories").countDocuments(), 12);
    await db.collection("hospitals").updateOne({ _id: before._id }, { $set: { demo: true } });
  });
  await t.test("unrelated accounts block fixture writes and retain their values", async () => {
    const result = await db.collection("users").insertOne({ role: "user", email: "private@example.test", passwordHash: "must-not-leak" });
    await assert.rejects(createInventoryDemo(db, { uri, config }), /unrelated records/);
    assert.equal((await db.collection("users").findOne({ _id: result.insertedId })).passwordHash, "must-not-leak");
  });
  await t.test("audit reports duplicates, broken dependencies, demo classification and privacy without writes", async () => {
    const user = await db.collection("users").findOne({});
    const missing = new mongoose.mongo.ObjectId();
    await db.collection("providermemberships").insertOne({ user: user._id, organization: missing, kind: "hospital", active: true });
    const organization = await db.collection("hospitals").findOne({});
    await db.collection("resourceproviders").insertMany([{ name: "Private test name", city: "City", kind: "diagnostic", hospital: organization._id, sourceName: "Historical directory", email: "do-not-print@example.test" }, { name: "Private test name", city: "City", kind: "diagnostic", hospital: missing }]);
    const before = await Promise.all([db.collection("hospitals").find({}).toArray(), db.collection("users").find({}).toArray()]);
    const audit = await auditBackendData(db);
    assert.equal(audit.collectionCounts.hospitals, 6); assert.equal(audit.dataClassifications.resourceinventories.demo, 12);
    assert.equal(audit.membershipDependencies.missingHospital.count, 1); assert.equal(audit.membershipDependencies.providerMissingHospital.count, 1);
    assert.equal(audit.duplicates.providersByKindNameCity.groups, 1); assert.equal(audit.relatedOrganizations.length, 2);
    const encoded = JSON.stringify(audit);
    for (const secret of ["private@example.test", "must-not-leak", "do-not-print@example.test", "Private test name"]) assert.equal(encoded.includes(secret), false);
    assert.deepEqual(await Promise.all([db.collection("hospitals").find({}).toArray(), db.collection("users").find({}).toArray()]), before);
  });
});
