import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const migrationVersion = "2026-10-26-operations-indexes-v1";
const modelNames = ["RateLimitBucket", "BackgroundJob", "WorkerHeartbeat", "ResourceInventory", "InventoryObservation",
  "EmailWebhookEvent", "EmergencyCoordination", "OperationalIncident", "RequestNotification",
  "EmailDelivery", "EmergencyRequest", "BloodRequest", "AmbulanceBooking", "JobApplication", "OrganizationApplication"];

export function assertIndexTarget(uri, { apply = false, nodeEnv = process.env.NODE_ENV, emailEnabled = process.env.EMAIL_ENABLED } = {}) {
  // No credentials, query parameters, alternate ports, encoded names or remote hosts.
  const match = /^mongodb:\/\/(?:127\.0\.0\.1|localhost):27017\/(medreach|medreach_migrations_test|medreach_demo_inventory)$/.exec(uri || "");
  if (!match) throw new Error("INDEX_TARGET_REFUSED: explicit supported local database URI required");
  if (apply && (match[1] === "medreach" || !["test", "development"].includes(nodeEnv) || emailEnabled !== "false")) {
    throw new Error("INDEX_APPLY_REFUSED: isolated local test/demo, development/test mode and EMAIL_ENABLED=false required");
  }
  return match[1];
}

export async function operationsManifest() {
  const models = [];
  for (const name of modelNames) models.push((await import(`../src/models/${name}.js`))[name]);
  return models;
}

async function duplicateGroups(collection, fields, options) {
  const match = { ...(options.partialFilterExpression || {}) };
  if (options.sparse) match.$or = Object.keys(fields).map((field) => ({ [field]: { $exists: true } }));
  const groups = await collection.aggregate([
    { $match: match },
    { $group: { _id: Object.fromEntries(Object.keys(fields).map((field, index) => [`k${index}`, { $ifNull: [`$${field}`, null] }])), count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $count: "groups" },
  ], { allowDiskUse: true }).toArray();
  return groups[0]?.groups || 0;
}

export async function migrateOperationsIndexes({ uri, apply = false, nodeEnv, emailEnabled, log = console.log } = {}) {
  const database = assertIndexTarget(uri, { apply, nodeEnv, emailEnabled });
  const models = await operationsManifest();
  // Disable model initialisation writes even in development and in dry runs.
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000, maxPoolSize: 2 });
  const manifest = models.map((Model) => ({ collection: Model.collection.collectionName, indexes: Model.schema.indexes() }));
  const checksum = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  const report = { version: migrationVersion, database, mode: apply ? "apply" : "dry-run", checksum, collections: [], duplicateGroups: 0 };
  for (const Model of models) {
    const existing = await Model.collection.indexes().catch((error) => { if (error.code === 26) return []; throw error; });
    const planned = [];
    for (const [fields, options] of Model.schema.indexes()) {
      const duplicates = options.unique ? await duplicateGroups(Model.collection, fields, options) : 0;
      report.duplicateGroups += duplicates;
      planned.push({ fields, options, duplicateGroups: duplicates });
    }
    report.collections.push({ name: Model.collection.collectionName, existing: existing.map(({ name, key }) => ({ name, key })), planned });
  }
  // Report every unique collision before any ledger, collection or index write.
  log(JSON.stringify(report, null, 2));
  if (!apply) return report;
  if (report.duplicateGroups) throw new Error("INDEX_DUPLICATES_FOUND: resolve reviewed collisions before applying; no data was changed");
  const ledger = mongoose.connection.db.collection("indexmigrationledger");
  const previous = await ledger.findOne({ _id: migrationVersion });
  if (previous?.checksum && previous.checksum !== checksum) throw new Error("INDEX_MANIFEST_CHANGED: use a new migration version");
  if (previous?.status === "completed") return { ...report, alreadyApplied: true };
  // _id is the unique lock; an interrupted applying record requires operator review.
  if (!previous) await ledger.insertOne({ _id: migrationVersion, checksum, status: "applying", startedAt: new Date(), completedCollections: [] });
  else {
    const lock = await ledger.updateOne({ _id: migrationVersion, status: "failed", checksum }, { $set: { status: "applying", startedAt: new Date() } });
    if (!lock.modifiedCount) throw new Error("INDEX_MIGRATION_LOCKED: inspect interrupted/concurrent application");
  }
  try {
    for (const Model of models) {
      // Additive only: never syncIndexes, drop indexes, delete or update application data.
      await Model.createIndexes();
      await ledger.updateOne({ _id: migrationVersion, status: "applying", checksum }, { $addToSet: { completedCollections: Model.collection.collectionName } });
    }
    await ledger.updateOne({ _id: migrationVersion, status: "applying", checksum }, { $set: { status: "completed", completedAt: new Date() } });
    return report;
  } catch (error) {
    await ledger.updateOne({ _id: migrationVersion, checksum }, { $set: { status: "failed", failedAt: new Date(), errorCode: Number.isInteger(error.code) ? error.code : "INDEX_APPLY_FAILED" } });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.slice(2).some((arg) => !["--apply", "--dry-run"].includes(arg)) || (process.argv.includes("--apply") && process.argv.includes("--dry-run"))) throw new Error("Use --dry-run (default) or --apply");
    await migrateOperationsIndexes({ uri: process.env.MEDREACH_INDEX_MONGO_URI, apply: process.argv.includes("--apply") });
  } catch (error) {
    console.error(error.message.startsWith("INDEX_") ? error.message : "INDEX_MIGRATION_FAILED: review target and database diagnostics"); process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}
