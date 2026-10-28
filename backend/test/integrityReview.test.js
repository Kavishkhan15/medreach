import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { RELATIONSHIP_CHECKS, evaluateRelationship, collectIntegrityReview, buildRepairManifest } from "../src/services/integrityReview.js";

const oid = () => new mongoose.Types.ObjectId();
test("relationship review distinguishes optional guest references from missing required targets", () => {
  const row = { _id: oid(), hospital: oid() };
  assert.equal(evaluateRelationship("emergencyrequests", row, RELATIONSHIP_CHECKS.emergencyrequests[1]), null);
  const finding = evaluateRelationship("emergencyrequests", row, RELATIONSHIP_CHECKS.emergencyrequests[0]);
  assert.equal(finding.issue, "missing_target"); assert.equal(finding.storedReference, String(row.hospital));
  assert.equal(finding.proposedChange, null); assert.equal(finding.executable, false);
  assert.equal(evaluateRelationship("emergencyrequests", { _id: row._id }, RELATIONSHIP_CHECKS.emergencyrequests[0]).issue, "missing_required_reference");
  assert.equal(evaluateRelationship("emergencyrequests", { ...row, hospital: String(row.hospital) }, RELATIONSHIP_CHECKS.emergencyrequests[0]).issue, "invalid_reference_type");
});
test("preallocated application organisations are valid until approval; wrong provider kinds are flagged", () => {
  const row = { _id: oid(), organization: oid(), kind: "hospital", status: "pending" };
  const rule = RELATIONSHIP_CHECKS.providerapplications.at(-1);
  assert.equal(evaluateRelationship("providerapplications", row, rule), null);
  assert.equal(evaluateRelationship("providerapplications", { ...row, status: "approved" }, rule).issue, "missing_target");
  assert.equal(evaluateRelationship("bloodrequests", { _id: oid(), provider: oid() }, RELATIONSHIP_CHECKS.bloodrequests[0], { kind: "ambulance" }).issue, "provider_kind_mismatch");
});
test("active membership review preserves roles and flags inactive users without proposing promotion", () => {
  const row = { _id: oid(), user: oid(), active: true };
  const rule = RELATIONSHIP_CHECKS.providermemberships[0];
  const finding = evaluateRelationship("providermemberships", row, rule, { role: "system_admin", accountStatus: "active" });
  assert.equal(finding.issue, "active_membership_non_provider_role"); assert.equal(finding.severity, "high");
  assert.equal(finding.proposedChange, null);
  assert.equal(evaluateRelationship("providermemberships", row, rule, { role: "provider_admin", accountStatus: "suspended" }).issue, "active_membership_inactive_account");
  assert.equal(evaluateRelationship("providermemberships", { ...row, active: false }, rule, { role: "user" }), null);
});
test("unknown polymorphic references and mismatched inventory organisation are unresolved", () => {
  assert.equal(evaluateRelationship("requestnotifications", { _id: oid(), source: oid(), sourceType: "invented" }, RELATIONSHIP_CHECKS.requestnotifications[1]).issue, "unsupported_reference_type");
  assert.equal(evaluateRelationship("inventoryobservations", { _id: oid(), inventory: oid(), kind: "hospital", organization: oid(), resourceKey: "icu" }, RELATIONSHIP_CHECKS.inventoryobservations[0], { kind: "hospital", organization: oid(), resourceKey: "icu" }).issue, "inventory_scope_mismatch");
});

function readOnlyFixture(data) {
  // Only exposes read methods. Any attempted writes or index APIs fail immediately.
  return { databaseName: "fixture", listCollections: () => ({ toArray: async () => Object.keys(data).map(name => ({ name })) }),
    collection: name => ({ find: (query, { projection }) => {
      let rows = (data[name] || []).filter(row => Object.entries(query).every(([key, value]) => value?.$in
        ? value.$in.some(item => String(item) === String(row[key])) : String(value) === String(row[key])));
      rows = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => projection[key])));
      return { sort() { return this; }, batchSize() { return this; }, toArray: async () => rows, async *[Symbol.asyncIterator]() { yield* rows; } };
    } }) };
}
test("full read-only enumeration exceeds 50 samples, preserves data, excludes secrets and makes no executable repairs", async () => {
  const data = { emergencyrequests: Array.from({ length: 63 }, () => ({ _id: oid(), hospital: oid(), passwordHash: "SECRET", contactPhone: "PRIVATE", patientSummary: "PRIVATE" })) };
  const before = JSON.stringify(data);
  const now = new Date("2026-10-26T12:00:00Z");
  const review = await collectIntegrityReview(readOnlyFixture(data), { now, batchSize: 10 });
  assert.equal(review.findingCount, 63); assert.equal(review.affectedRecords, 63);
  assert.equal(review.coverage.find(row => row.collection === "emergencyrequests").recordsRead, 63);
  assert.equal(JSON.stringify(data), before);
  assert.doesNotMatch(JSON.stringify(review), /SECRET|PRIVATE|passwordHash|patientSummary|contactPhone/);
  const manifest = buildRepairManifest(review);
  assert.equal(manifest.executable, false); assert.equal(manifest.approved, false); assert.equal(manifest.entries.length, 63);
  assert.ok(manifest.entries.every(row => row.proposedChange === null && row.approval === null && row.rollback === null));
  assert.deepEqual(await collectIntegrityReview(readOnlyFixture(data), { now }), review);
});
test("empty databases and valid references do not create findings or collections", async () => {
  assert.equal((await collectIntegrityReview(readOnlyFixture({}))).findingCount, 0);
  const hospital = { _id: oid() };
  const data = { hospitals: [hospital], emergencyrequests: [{ _id: oid(), hospital: hospital._id }] };
  assert.equal((await collectIntegrityReview(readOnlyFixture(data))).findingCount, 0);
  await assert.rejects(collectIntegrityReview(readOnlyFixture({}), { batchSize: 0 }));
});
test("audit read failures stop review instead of returning a partial clean result", async () => {
  const db = readOnlyFixture({ emergencyrequests: [] });
  db.collection = () => { throw new Error("database interrupted"); };
  await assert.rejects(collectIntegrityReview(db), /database interrupted/);
});
test("exact-ID audit history provides pointers without restoring snapshots or guessing replacements", async () => {
  const missing = oid(), unrelated = oid();
  const data = { emergencyrequests: [{ _id: oid(), hospital: missing }], auditlogs: [
    { _id: oid(), entityType: "Hospital", entityId: missing, action: "delete", before: { name: "PRIVATE", passwordHash: "SECRET" } },
    { _id: oid(), entityType: "Hospital", entityId: unrelated, action: "create" },
  ] };
  const review = await collectIntegrityReview(readOnlyFixture(data));
  assert.equal(review.findings[0].exactTargetAuditHistory.length, 1);
  assert.equal(review.findings[0].exactTargetAuditHistory[0].auditId, String(data.auditlogs[0]._id));
  assert.equal(buildRepairManifest(review).entries[0].proposedChange, null);
  assert.doesNotMatch(JSON.stringify(review), /PRIVATE|SECRET/);
});
