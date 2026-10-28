import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { assertIntegrityMigrationTarget, inspectIntegrityMigration, applyIntegrityMigration } from "../src/services/integrityMigration.js";
import { validateVerifiedBackupReceipt } from "./verifiedBackup.js";
import { targetIdentity } from "./migrateProductionIndexes.js";
// A review tool, not an automatic repair. Canonical/remote application is refused.
let client;
try {
  const apply = process.argv.includes("--apply");
  if (process.argv.slice(2).some(value => !["--apply", "--dry-run"].includes(value)) || (apply && process.argv.includes("--dry-run"))) throw new Error("INTEGRITY_ARGUMENTS_INVALID");
  const uri = process.env.MEDREACH_INTEGRITY_MIGRATION_URI || "mongodb://127.0.0.1:27017/medreach";
  const database = assertIntegrityMigrationTarget(uri, apply);
  const manifest = JSON.parse(await readFile(process.env.MEDREACH_INTEGRITY_MANIFEST, "utf8"));
  if (manifest.database !== database) throw new Error("INTEGRITY_MANIFEST_TARGET_MISMATCH");
  client = new mongoose.mongo.MongoClient(uri, { maxPoolSize: 2, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(database);
  const plan = await inspectIntegrityMigration(db, manifest);
  const report = { checksum: plan.checksum, database, mode: apply ? "apply" : "dry-run", repairs: plan.repairs.length, unresolved: plan.unresolved.length, checks: plan.checks };
  if (apply) {
    const receipt = JSON.parse(await readFile(process.env.MEDREACH_INTEGRITY_BACKUP_RECEIPT, "utf8"));
    await validateVerifiedBackupReceipt(receipt, { database, targetFingerprint: targetIdentity(uri, database).fingerprint, reportChecksum: plan.checksum });
    report.result = await applyIntegrityMigration(db, manifest, { approvedChecksum: process.env.MEDREACH_INTEGRITY_APPROVED_CHECKSUM, backupVerified: true });
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(/^[A-Z_]{5,100}$/.test(error.message) ? error.message : "INTEGRITY_MIGRATION_FAILED_REVIEW_PRIVATE_DIAGNOSTICS");
  process.exitCode = 1;
} finally { await client?.close(); }
