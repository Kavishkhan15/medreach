import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { assertIndexTarget, migrateOperationsIndexes, migrationVersion } from "../scripts/migrateOperationsIndexes.js";
import { verifyWorkerIndexes } from "../src/services/workerRuntime.js";

const uri = process.env.MEDREACH_MIGRATIONS_TEST_MONGO_URI;
const safe = /^mongodb:\/\/(?:127\.0\.0\.1|localhost):27017\/medreach_migrations_test$/.test(uri || "");
test("operational migration refuses canonical writes and unsafe targets", () => {
  for (const target of [undefined, "mongodb://remote:27017/medreach_migrations_test", "mongodb://127.0.0.1:27018/medreach_migrations_test", "mongodb://127.0.0.1:27017/medreach_migrations_test?x=1"]) assert.throws(() => assertIndexTarget(target));
  assert.equal(assertIndexTarget("mongodb://127.0.0.1:27017/medreach"), "medreach");
  for (const options of [{ apply: true, nodeEnv: "test", emailEnabled: "false" }, { apply: true, nodeEnv: "production", emailEnabled: "false" }]) assert.throws(() => assertIndexTarget("mongodb://127.0.0.1:27017/medreach", options));
  assert.throws(() => assertIndexTarget("mongodb://127.0.0.1:27017/medreach_migrations_test", { apply: true, nodeEnv: "test", emailEnabled: "true" }));
});
test("dry run is read only; duplicate preflight and additive ledger application", { skip: !safe, timeout: 30000 }, async () => {
  const options = { uri, nodeEnv: "test", emailEnabled: "false", log: () => {} };
  const connect = () => mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  await connect();
  assert.equal(mongoose.connection.name, "medreach_migrations_test");
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  try {
    const report = await migrateOperationsIndexes(options);
    assert.equal(report.mode, "dry-run");
    assert.deepEqual(await mongoose.connection.db.listCollections().toArray(), []);
    const jobs = mongoose.connection.db.collection("backgroundjobs");
    await jobs.insertMany([{ key: "collision" }, { key: "collision" }]);
    await mongoose.disconnect();
    await assert.rejects(() => migrateOperationsIndexes({ ...options, apply: true }), /INDEX_DUPLICATES_FOUND/);
    assert.equal(await mongoose.connection.db.collection("indexmigrationledger").countDocuments(), 0);
    // Clean only the collision fixture in this exact isolated test database.
    await mongoose.connection.db.collection("backgroundjobs").deleteMany({ key: "collision" });
    await mongoose.connection.db.collection("backgroundjobs").createIndex({ fixture: 1 }, { name: "preserved_fixture" });
    await mongoose.disconnect();
    await migrateOperationsIndexes({ ...options, apply: true });
    await verifyWorkerIndexes();
    const ledger = await mongoose.connection.db.collection("indexmigrationledger").findOne({ _id: migrationVersion });
    assert.equal(ledger.status, "completed");
    assert.ok((await mongoose.connection.db.collection("backgroundjobs").indexes()).some((index) => index.name === "preserved_fixture"));
    await mongoose.disconnect();
    assert.equal((await migrateOperationsIndexes({ ...options, apply: true })).alreadyApplied, true);
  } finally {
    if (!mongoose.connection.readyState) await connect();
    assert.equal(mongoose.connection.name, "medreach_migrations_test");
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});
