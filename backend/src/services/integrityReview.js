// Native-driver reads only. Importing this module never loads models or env.js.
import { createHash } from "node:crypto";
import { mongo } from "mongoose";
import { classifyDataRecord } from "./dataQualityAudit.js";

const org = { hospital: "hospitals", blood_bank: "resourceproviders", diagnostic: "resourceproviders", ambulance: "resourceproviders" };
const sources = { EmergencyRequest: "emergencyrequests", BloodRequest: "bloodrequests", AmbulanceBooking: "ambulancebookings", RequestNotification: "requestnotifications", EmergencyCoordination: "emergencycoordinations", bed: "emergencyrequests", blood: "bloodrequests", ambulance: "ambulancebookings" };
const ref = (field, target, required = false, kind) => ({ field, target, required, kind });
export const RELATIONSHIP_CHECKS = {
  providermemberships: [ref("user", "users", true), ref("assignedBy", "users", true), ref("organization", row => org[row.kind], true, row => row.kind)],
  resourceproviders: [ref("hospital", "hospitals")],
  emergencyrequests: [ref("hospital", "hospitals", true), ref("user", "users")],
  bloodrequests: [ref("provider", "resourceproviders", false, () => "blood_bank"), ref("user", "users")],
  ambulancebookings: [ref("provider", "resourceproviders", true, () => "ambulance"), ref("user", "users"), ref("emailDelivery", "emaildeliveries")],
  jobs: [ref("hospital", "hospitals"), ref("provider", "resourceproviders"), ref("createdBy", "users", true), ref("reviewedBy", "users")],
  jobapplications: [ref("job", "jobs", true), ref("applicant", "users", true), ref("reviewedBy", "users")],
  providerapplications: [ref("requester", "users"), ref("account", "users"), ref("reviewedBy", "users"), ref("organization", row => org[row.kind], row => row.status === "approved", row => row.kind)],
  availabilityobservations: [ref("hospital", "hospitals", true), ref("source", "datasources"), ref("verifiedBy", "users")],
  datasources: [ref("hospital", "hospitals")],
  hospitalfacilities: [ref("hospital", "hospitals", true), ref("source", "datasources")],
  hospitalfieldclaims: [ref("hospital", "hospitals", true), ref("source", "datasources", true), ref("assertedBy", "users"), ref("reviewedBy", "users")],
  facilitysourceclaims: [ref("hospital", "hospitals", true), ref("source", "datasources", true), ref("assertedBy", "users"), ref("reviewedBy", "users")],
  hospitalfieldconflicts: [ref("hospital", "hospitals", true), ref("selectedClaim", "hospitalfieldclaims")],
  ownershipclaims: [ref("hospital", "hospitals", true), ref("requester", "users", true), ref("providerAccount", "users"), ref("reviewedBy", "users")],
  organizationapplications: [ref("hospital", "hospitals"), ref("provider", "resourceproviders"), ref("applicant", "users", true), ref("reviewedBy", "users")],
  bloodcampaigns: [ref("createdBy", "users")],
  resourceinventories: [ref("organization", row => org[row.kind], true, row => row.kind), ref("updatedBy", "users")],
  inventoryobservations: [ref("inventory", "resourceinventories", true), ref("organization", row => org[row.kind], true, row => row.kind), ref("updatedBy", "users", true)],
  requestnotifications: [ref("recipient", "users", true), ref("source", row => sources[row.sourceType], true)],
  emaildeliveries: [ref("recipientUser", "users"), ref("resolvedBy", "users"), ref("sourceId", row => sources[row.sourceModel])],
  emergencycoordinations: [ref("source", row => sources[row.sourceType], true), ref("organization", row => org[row.kind], false, row => row.kind), ref("acknowledgedBy", "users")],
};
const id = value => value?.toHexString?.() ?? (value == null ? null : String(value));
const objectId = value => value?._bsontype === "ObjectId";
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateRelationship(collection, row, rule, target) {
  // Pending applications preallocate an organisation ID before any organisation exists.
  if (collection === "providerapplications" && rule.field === "organization" && row.status !== "approved") return null;
  const value = row[rule.field];
  const required = typeof rule.required === "function" ? rule.required(row) : rule.required;
  const targetCollection = typeof rule.target === "function" ? rule.target(row) : rule.target;
  let issue;
  if (value == null) { if (required) issue = "missing_required_reference"; }
  else if (!targetCollection) issue = "unsupported_reference_type";
  else if (!objectId(value)) issue = "invalid_reference_type";
  else if (!target) issue = "missing_target";
  else if (rule.kind && targetCollection === "resourceproviders" && target.kind !== rule.kind(row)) issue = "provider_kind_mismatch";
  else if (collection === "providermemberships" && rule.field === "user" && row.active === true && target.role !== "provider_admin") issue = "active_membership_non_provider_role";
  else if (collection === "providermemberships" && rule.field === "user" && row.active === true && target.accountStatus !== "active") issue = "active_membership_inactive_account";
  else if (collection === "inventoryobservations" && rule.field === "inventory" && (target.kind !== row.kind || id(target.organization) !== id(row.organization) || target.resourceKey !== row.resourceKey)) issue = "inventory_scope_mismatch";
  if (!issue) return null;
  const evidence = { collection, recordId: id(row._id), field: rule.field, storedReference: id(value), targetCollection: targetCollection ?? null,
    issue, classification: classifyDataRecord(row), targetExists: Boolean(target),
    ...(target && rule.field === "user" ? { targetRole: target.role ?? null, targetAccountStatus: target.accountStatus ?? null } : {}) };
  return { findingId: digest(evidence), ...evidence, severity: collection === "providermemberships" && row.active === true ? "high" : "review",
    resolution: "unresolved", proposedChange: null, executable: false,
    evidenceRequired: "Original import mapping or attributable audit history identifying the exact intended record; verify that target and organisation scope still exist. Names alone are insufficient.",
    preconditionHash: digest({ recordId: id(row._id), field: rule.field, present: Object.hasOwn(row, rule.field), valueType: objectId(value) ? "ObjectId" : typeof value, value: id(value), updatedAt: row.updatedAt ?? null }) };
}

export async function collectIntegrityReview(db, { now = new Date(), batchSize = 100 } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("Invalid audit batch size");
  const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name));
  const findings = [], coverage = [];
  for (const [collection, rules] of Object.entries(RELATIONSHIP_CHECKS)) {
    if (!names.has(collection)) { coverage.push({ collection, recordsRead: 0, present: false }); continue; }
    const projection = Object.fromEntries(["_id", "updatedAt", "kind", "status", "active", "resourceKey", "organization", "sourceType", "sourceModel", "demo", "demoAccount", "classification", "sourceName", "sourceUrl", "sourceIds", ...rules.map(rule => rule.field)].map(field => [field, 1]));
    let recordsRead = 0, batch = [];
    const inspect = async rows => {
      const requests = new Map();
      for (const row of rows) for (const rule of rules) {
        const target = typeof rule.target === "function" ? rule.target(row) : rule.target;
        if (target && objectId(row[rule.field])) {
          if (!requests.has(target)) requests.set(target, new Map());
          requests.get(target).set(id(row[rule.field]), row[rule.field]);
        }
      }
      const targets = new Map();
      for (const [collectionName, ids] of requests) {
        const result = names.has(collectionName) ? await db.collection(collectionName).find({ _id: { $in: [...ids.values()] } }, { projection: { _id: 1, role: 1, accountStatus: 1, kind: 1, organization: 1, resourceKey: 1 }, maxTimeMS: 30000 }).toArray() : [];
        targets.set(collectionName, new Map(result.map(row => [id(row._id), row])));
      }
      for (const row of rows) for (const rule of rules) {
        const target = typeof rule.target === "function" ? rule.target(row) : rule.target;
        const finding = evaluateRelationship(collection, row, rule, targets.get(target)?.get(id(row[rule.field])));
        if (finding) findings.push(finding);
      }
    };
    for await (const row of db.collection(collection).find({}, { projection, maxTimeMS: 30000 }).sort({ _id: 1 }).batchSize(batchSize)) {
      recordsRead++; batch.push(row);
      if (batch.length === batchSize) { await inspect(batch); batch = []; }
    }
    if (batch.length) await inspect(batch);
    coverage.push({ collection, recordsRead, present: true });
  }
  findings.sort((a, b) => a.findingId.localeCompare(b.findingId));
  // Exact target IDs only: historical audit rows are evidence pointers, never proof
  // of an intended replacement. Do not expose stored before/after document contents.
  const modelNames = { users: "User", hospitals: "Hospital", resourceproviders: "ResourceProvider", jobs: "Job", datasources: "DataSource" };
  const historyCache = new Map();
  for (const finding of findings) {
    if (finding.issue !== "missing_target" || !modelNames[finding.targetCollection] || !names.has("auditlogs")) continue;
    const cacheKey = `${finding.targetCollection}:${finding.storedReference}`;
    if (!historyCache.has(cacheKey)) {
      const entries = await db.collection("auditlogs").find({ entityType: modelNames[finding.targetCollection], entityId: new mongo.ObjectId(finding.storedReference) },
        { projection: { _id: 1, action: 1, createdAt: 1 }, maxTimeMS: 30000 }).toArray();
      historyCache.set(cacheKey, entries.map(row => ({ auditId: id(row._id), action: row.action, recordedAt: row.createdAt ?? null })));
    }
    finding.exactTargetAuditHistory = historyCache.get(cacheKey);
  }
  return { schemaVersion: 1, generatedAt: now.toISOString(), database: db.databaseName, readOnly: true, migrationApplied: false,
    scope: "Declared scalar relationships only; not every nested/legacy reference or clinical field is validated. No name matching, restoration or reassignment is inferred.",
    consistency: "Live read-only reads, not a point-in-time snapshot; revalidate every finding before any future migration.",
    coverage, findingCount: findings.length, affectedRecords: new Set(findings.map(row => `${row.collection}:${row.recordId}`)).size,
    executableRepairs: 0, findings };
}

export function buildRepairManifest(review) {
  return { schemaVersion: 1, generatedAt: review.generatedAt, database: review.database, reviewDigest: digest(review),
    mode: "review_only", approved: false, executable: false, migrationApplied: false,
    decisionsRequired: ["Verify original evidence for each relationship", "Choose an evidence-supported repair or preserve unresolved history", "Approve a separate backed-up migration with current-value preconditions"],
    entries: review.findings.map(finding => ({ ...finding, approval: null, rollback: null })),
    warning: "This is a decision register, not an executable migration. No replacement IDs have been guessed. Fingerprints cover the relationship and updatedAt, not the complete document." };
}
