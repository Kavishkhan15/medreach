import test from "node:test";
import assert from "node:assert/strict";
import { validateIntegrityPlan, assertIntegrityMigrationTarget } from "../src/services/integrityMigration.js";
const oldId = "6ac28cd398836512dc7f645a", newId = "6ac28cd398836512dc7f645b";
const unresolved = () => ({ schemaVersion: 1, database: "medreach", approved: false, entries: [{ findingId: "a".repeat(64), collection: "emergencyrequests", recordId: oldId, field: "hospital", storedReference: newId, targetCollection: "hospitals", resolution: "unresolved", proposedChange: null }] });
test("unresolved manifests never become executable repairs", () => {
  const plan = validateIntegrityPlan(unresolved());
  assert.equal(plan.repairs.length, 0); assert.equal(plan.unresolved.length, 1);
  assert.throws(() => validateIntegrityPlan(unresolved(), { apply: true }), /APPROVAL/);
});
test("repair planning requires explicit per-entry evidence, reviewer, original value and rollback", () => {
  const manifest = unresolved(); manifest.approved = true;
  const row = manifest.entries[0]; row.resolution = "repair"; row.proposedChange = { reference: oldId };
  assert.throws(() => validateIntegrityPlan(manifest), /EVIDENCE/);
  row.approval = { reviewerId: oldId, approvedAt: "2026-10-26T12:00:00Z", reason: "Verified exact original import mapping" };
  row.evidence = { artifactPath: "/review/import-map.json", sha256: "b".repeat(64), recordId: oldId, field: "hospital", originalReference: newId, intendedReference: oldId };
  row.rollback = { reference: newId };
  row.preconditionHash = "c".repeat(64);
  const plan = validateIntegrityPlan(manifest);
  assert.equal(plan.repairs.length, 1);
  row.evidence.intendedReference = newId;
  assert.throws(() => validateIntegrityPlan(manifest), /EVIDENCE/);
});
test("repair planning rejects arbitrary collections, fields, duplicate mutations and unrelated assignments", () => {
  for (const change of [{ collection: "users", field: "role" }, { field: "$where" }, { field: "__proto__" }, { targetCollection: "users" }]) {
    const manifest = unresolved(); Object.assign(manifest.entries[0], change);
    assert.throws(() => validateIntegrityPlan(manifest));
  }
  const manifest = unresolved(); manifest.entries.push({ ...manifest.entries[0] });
  assert.throws(() => validateIntegrityPlan(manifest), /DUPLICATE/);
});
test("migration apply is isolated by exact database and explicit email-disabled test configuration", () => {
  assert.equal(assertIntegrityMigrationTarget("mongodb://127.0.0.1:27017/medreach", false, {}), "medreach");
  assert.throws(() => assertIntegrityMigrationTarget("mongodb://127.0.0.1:27017/medreach", true, { NODE_ENV: "test", EMAIL_ENABLED: "false" }));
  assert.equal(assertIntegrityMigrationTarget("mongodb://127.0.0.1:27017/medreach_integrity_migrations_test", true, { NODE_ENV: "test", EMAIL_ENABLED: "false" }), "medreach_integrity_migrations_test");
  for (const uri of ["mongodb+srv://secret:password@cluster/medreach", "mongodb://localhost:27017/medreach?replicaSet=x"]) assert.throws(() => assertIntegrityMigrationTarget(uri, false, {}));
});

test("malformed historical primitives remain reviewable only as unresolved references", () => {
  const manifest = unresolved(); manifest.entries[0].storedReference = "historical-invalid-id";
  assert.equal(validateIntegrityPlan(manifest).unresolved.length, 1);
  manifest.entries[0].resolution = "repair"; manifest.entries[0].proposedChange = { reference: oldId };
  assert.throws(() => validateIntegrityPlan(manifest), /INVALID_REPAIR_REFERENCE/);
});
