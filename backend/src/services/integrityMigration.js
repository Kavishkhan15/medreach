import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mongo } from "mongoose";
import { RELATIONSHIP_CHECKS, evaluateRelationship } from "./integrityReview.js";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const oid = value => typeof value === "string" && /^[a-f0-9]{24}$/.test(value);
const error = code => new Error(code);
export function assertIntegrityMigrationTarget(uri, apply, values = process.env) {
  const match = /^mongodb:\/\/(?:127\.0\.0\.1|localhost):27017\/(medreach|medreach_integrity_migrations_test)$/.exec(uri || "");
  if (!match || (apply && (match[1] !== "medreach_integrity_migrations_test" || values.NODE_ENV !== "test" || values.EMAIL_ENABLED !== "false"))) throw error("INTEGRITY_TARGET_REFUSED");
  return match[1];
}
export function validateIntegrityPlan(manifest, { apply = false } = {}) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries) || manifest.entries.length > 20000) throw error("INVALID_MANIFEST");
  if (apply && manifest.approved !== true) throw error("MANIFEST_APPROVAL_REQUIRED");
  const repairs = [], unresolved = [], seen = new Set(), repairDocuments = new Set();
  for (const row of manifest.entries) {
    const rule = RELATIONSHIP_CHECKS[row.collection]?.find(check => check.field === row.field);
    if (!rule || !/^[a-f0-9]{64}$/.test(row.findingId || "") || !oid(row.recordId)) throw error("INVALID_RELATIONSHIP");
    if (typeof rule.target === "string" && rule.target !== row.targetCollection) throw error("INVALID_TARGET_COLLECTION");
    const key = `${row.collection}:${row.recordId}:${row.field}`;
    if (seen.has(key)) throw error("DUPLICATE_MUTATION"); seen.add(key);
    if (row.resolution === "unresolved" && row.proposedChange === null) {
      if (row.storedReference !== null && (typeof row.storedReference !== "string" || row.storedReference.length > 2000)) throw error("INVALID_UNRESOLVED_REFERENCE");
      unresolved.push(row); continue;
    }
    if (row.storedReference !== null && !oid(row.storedReference)) throw error("INVALID_REPAIR_REFERENCE");
    const evidence = row.evidence, approval = row.approval;
    if (manifest.approved !== true || row.resolution !== "repair" || !oid(row.proposedChange?.reference)
      || !approval || !oid(approval.reviewerId) || !Number.isFinite(Date.parse(approval.approvedAt)) || typeof approval.reason !== "string" || approval.reason.length < 10 || approval.reason.length > 500
      || !evidence || typeof evidence.artifactPath !== "string" || !/^[a-f0-9]{64}$/.test(evidence.sha256 || "")
      || evidence.recordId !== row.recordId || evidence.field !== row.field || evidence.originalReference !== row.storedReference || evidence.intendedReference !== row.proposedChange.reference
      || !row.rollback || row.rollback.reference !== row.storedReference) throw error("REPAIR_EVIDENCE_AND_APPROVAL_REQUIRED");
    if (!/^[a-f0-9]{64}$/.test(row.preconditionHash || "")) throw error("REPAIR_PRECONDITION_REQUIRED");
    const documentKey = `${row.collection}:${row.recordId}`;
    if (repairDocuments.has(documentKey)) throw error("MULTI_FIELD_REPAIR_REQUIRES_GROUPED_REVIEW");
    repairDocuments.add(documentKey);
    repairs.push(row);
  }
  return { checksum: hash(manifest), repairs, unresolved };
}
async function validateCurrentRepair(db, row, source) {
  const rule = RELATIONSHIP_CHECKS[row.collection].find(check => check.field === row.field);
  const targetCollection = typeof rule.target === "function" ? rule.target(source || {}) : rule.target;
  if (!source || targetCollection !== row.targetCollection) throw error("REPAIR_SOURCE_SCOPE_CONFLICT");
  const value = source[row.field];
  const preconditionHash = hash({ recordId: String(source._id), field: row.field, present: Object.hasOwn(source, row.field), valueType: value?._bsontype === "ObjectId" ? "ObjectId" : typeof value, value: value == null ? null : String(value), updatedAt: source.updatedAt ?? null });
  if (preconditionHash !== row.preconditionHash || (value == null ? null : String(value)) !== row.storedReference) throw error("REPAIR_PRECONDITION_CONFLICT");
  const target = await db.collection(targetCollection).findOne({ _id: new mongo.ObjectId(row.proposedChange.reference) });
  const repaired = { ...source, [row.field]: new mongo.ObjectId(row.proposedChange.reference) };
  if (!target || target.archivedAt || target.active === false || evaluateRelationship(row.collection, repaired, rule, target)) throw error("REPAIR_TARGET_SCOPE_CONFLICT");
  if (targetCollection === "resourceproviders" && target.hospital && !await db.collection("hospitals").findOne({ _id: target.hospital, archivedAt: null })) throw error("REPAIR_TARGET_SCOPE_CONFLICT");
  if (["datasources", "hospitalfieldclaims", "facilitysourceclaims"].includes(targetCollection) && source.hospital && target.hospital && String(source.hospital) !== String(target.hospital)) throw error("REPAIR_TARGET_SCOPE_CONFLICT");
}
export async function inspectIntegrityMigration(db, manifest) {
  const plan = validateIntegrityPlan(manifest), checks = [];
  for (const row of plan.repairs) {
    const artifact = await readFile(row.evidence.artifactPath);
    if (createHash("sha256").update(artifact).digest("hex") !== row.evidence.sha256) throw error("EVIDENCE_CHECKSUM_MISMATCH");
    const source = await db.collection(row.collection).findOne({ _id: new mongo.ObjectId(row.recordId) });
    const rule = RELATIONSHIP_CHECKS[row.collection].find(check => check.field === row.field);
    const targetCollection = typeof rule.target === "function" ? rule.target(source || {}) : rule.target;
    if (!source || targetCollection !== row.targetCollection) throw error("REPAIR_SOURCE_SCOPE_CONFLICT");
    const marker = source.integrityRepairJournal?.find(item => item.operation === `${plan.checksum}:${row.findingId}`);
    if (marker && String(source[row.field]) === row.proposedChange.reference) { checks.push({ recordId: row.recordId, alreadyApplied: true }); continue; }
    await validateCurrentRepair(db, row, source);

    checks.push({ recordId: row.recordId, alreadyApplied: false });
  }
  return { ...plan, checks };
}
export async function applyIntegrityMigration(db, manifest, { approvedChecksum, backupVerified = false } = {}) {
  if (db.databaseName !== "medreach_integrity_migrations_test") throw error("INTEGRITY_TARGET_REFUSED");
  validateIntegrityPlan(manifest, { apply: true });
  const plan = await inspectIntegrityMigration(db, manifest);
  if (!backupVerified || approvedChecksum !== plan.checksum) throw error("BACKUP_AND_EXACT_PLAN_APPROVAL_REQUIRED");
  const ledger = db.collection("integritymigrationledger");
  const previous = await ledger.findOne({ _id: plan.checksum });
  if (previous?.status === "complete") return { alreadyApplied: true, checksum: plan.checksum };
  // A crash retains this lock for explicit investigation; never automatically steal it.
  if (previous) throw error("INTEGRITY_MIGRATION_LOCKED");
  await ledger.insertOne({ _id: plan.checksum, status: "applying", startedAt: new Date(), repairs: plan.repairs.length, unresolved: plan.unresolved.length });
  try {
    for (const row of plan.repairs) {
      const operation = `${plan.checksum}:${row.findingId}`;
      const journal = { operation, field: row.field, before: row.storedReference, after: row.proposedChange.reference, reviewerId: row.approval.reviewerId, reason: row.approval.reason, evidenceSha256: row.evidence.sha256, at: new Date() };
      const source = await db.collection(row.collection).findOne({ _id: new mongo.ObjectId(row.recordId) });
      if (source?.integrityRepairJournal?.some(item => item.operation === operation) && String(source[row.field]) === row.proposedChange.reference) continue;
      await validateCurrentRepair(db, row, source);
      journal.beforePresent = Object.hasOwn(source, row.field);
      journal.beforeValue = source[row.field] ?? null;
      journal.beforeUpdatedAt = source.updatedAt ?? null;
      journal.afterValue = new mongo.ObjectId(row.proposedChange.reference);
      const result = await db.collection(row.collection).updateOne({ _id: new mongo.ObjectId(row.recordId), [row.field]: Object.hasOwn(source, row.field) ? source[row.field] : { $exists: false },
        ...(Object.hasOwn(source || {}, "updatedAt") ? { updatedAt: source.updatedAt } : { updatedAt: { $exists: false } }), "integrityRepairJournal.operation": { $ne: operation },
        $and: [
          ...[row.field, "updatedAt"].map(key => ({ [key]: { $exists: Object.hasOwn(source, key) } })),
          ...["kind", "organization", "resourceKey", "hospital", "sourceType", "sourceModel", "active", "status"].filter(key => key !== row.field).map(key => Object.hasOwn(source, key) ? { [key]: source[key] } : { [key]: { $exists: false } }),
        ] },
      { $set: { [row.field]: new mongo.ObjectId(row.proposedChange.reference), updatedAt: new Date() }, $push: { integrityRepairJournal: journal } });
      if (result.modifiedCount !== 1) throw error("REPAIR_WRITE_CONFLICT");
      await ledger.updateOne({ _id: plan.checksum }, { $push: { rollbackRecords: { collection: row.collection, recordId: row.recordId, ...journal } } });
    }
    for (const row of plan.unresolved) await db.collection("historicalreferencereviews").updateOne({ _id: row.findingId }, { $setOnInsert: {
      classification: "unresolved_historical_reference", collection: row.collection, recordId: row.recordId, field: row.field, storedReference: row.storedReference, planChecksum: plan.checksum, reviewedAt: new Date(),
    } }, { upsert: true });
    await ledger.updateOne({ _id: plan.checksum }, { $set: { status: "complete", completedAt: new Date() } });
    return { checksum: plan.checksum, repairs: plan.repairs.length, unresolved: plan.unresolved.length };
  } catch (cause) {
    await ledger.updateOne({ _id: plan.checksum }, { $set: { status: "requires_review", failedAt: new Date(), errorCode: "INTEGRITY_APPLY_INTERRUPTED" } });
    throw cause;
  }
}
