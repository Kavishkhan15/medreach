import test from "node:test";
import assert from "node:assert/strict";
import { assertLocalAuditTarget, auditBackendData, classifyDataRecord } from "../src/services/dataQualityAudit.js";
import { assertInventoryDemoTarget, inventoryDemoFixtures } from "../src/services/inventoryDemo.js";

test("audit target rejects remote, ambiguous and noncanonical targets without exposing credentials", () => {
  assert.equal(assertLocalAuditTarget("mongodb://127.0.0.1:27017/medreach"), "medreach");
  for (const uri of ["mongodb+srv://secret:password@cluster.example/medreach", "mongodb://127.0.0.1:27017/production", "mongodb://localhost:27017/medreach?replicaSet=remote", "mongodb://localhost:27017,remote.example/medreach"]) {
    assert.throws(() => assertLocalAuditTarget(uri), (error) => !error.message.includes("password") && !error.message.includes("secret"));
  }
});
test("data classification requires explicit evidence and does not equate verified badges with provider confirmation", () => {
  assert.equal(classifyDataRecord({ verificationStatus: "verified" }), "unknown");
  assert.equal(classifyDataRecord({ demo: true, classification: "provider_confirmed" }), "demo");
  assert.equal(classifyDataRecord({ demoAccount: true }), "demo");
  assert.equal(classifyDataRecord({ classification: "provider_confirmed" }), "provider_confirmed");
  assert.equal(classifyDataRecord({ sourceName: "Historical directory" }), "historical_imported");
  assert.equal(classifyDataRecord({}), "unknown");
});
test("read-only audit handles an empty dataset without creating collections", async () => {
  let writes = 0;
  const db = { databaseName: "medreach", listCollections: () => ({ toArray: async () => [] }), collection: () => { writes += 1; throw new Error("Unexpected access"); } };
  const report = await auditBackendData(db);
  assert.equal(report.readOnly, true); assert.equal(report.migrationApplied, false);
  assert.equal(report.collectionCounts.users, 0); assert.equal(report.systemAdminLockoutRisk, true); assert.equal(writes, 0);
});
test("demo fixtures cannot target canonical, remote, email-enabled or production databases", () => {
  const approved = { NODE_ENV: "development", EMAIL_ENABLED: "false" };
  assert.equal(assertInventoryDemoTarget("mongodb://127.0.0.1:27017/medreach_demo_inventory", approved), "medreach_demo_inventory");
  for (const uri of ["mongodb://127.0.0.1:27017/medreach", "mongodb://remote.example:27017/medreach_demo_inventory"]) assert.throws(() => assertInventoryDemoTarget(uri, approved));
  for (const env of [{ NODE_ENV: "production", EMAIL_ENABLED: "false" }, { NODE_ENV: "test", EMAIL_ENABLED: "true" }, { NODE_ENV: "development" }]) assert.throws(() => assertInventoryDemoTarget("mongodb://127.0.0.1:27017/medreach_demo_inventory", env));
});
test("six synthetic scenarios preserve demo classification, zero versus unknown and capacity equations", () => {
  const fixtures = inventoryDemoFixtures(new Date("2026-10-25T12:00:00Z"));
  assert.equal(fixtures.length, 6);
  for (const row of fixtures) {
    assert.match(row.hospital.name, /^DEMO Synthetic/); assert.equal(row.hospital.classification, "demo");
    assert.deepEqual(row.inventories.map((r) => r.capacity), [50, 15]);
    for (const inv of row.inventories) {
      assert.equal(inv.classification, "demo"); assert.equal(inv.reportingMethod, "demo_fixture");
      assert.equal(inv.available, [inv.occupied, inv.blocked, inv.held].some((v) => v === null) ? null : inv.capacity - inv.occupied - inv.blocked - inv.held);
    }
  }
  assert.equal(fixtures.find((f) => f.scenario === "general_full").inventories[0].available, 0);
  assert.equal(fixtures.find((f) => f.scenario === "stale_unknown").inventories[1].available, null);
});
