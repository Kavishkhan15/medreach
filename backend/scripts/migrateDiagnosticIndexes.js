import mongoose from "mongoose";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { DiagnosticRequest } from "../src/models/DiagnosticRequest.js";
import { migrateProductionIndexes } from "./migrateProductionIndexes.js";

export const diagnosticMigrationVersion = "2026-10-29-diagnostic-request-indexes-v1";
export const diagnosticManifest = async () => [DiagnosticRequest];
export function migrateDiagnosticIndexes(options) {
  return migrateProductionIndexes({ ...options, migrationVersion: diagnosticMigrationVersion, manifestFactory: diagnosticManifest });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !["--dry-run", "--apply", "--allow-unique-bootstrap"].includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) throw Error("MIGRATION_ARGUMENTS_INVALID");
    const apply = args.includes("--apply");
    await migrateDiagnosticIndexes({ uri: process.env.MEDREACH_MIGRATION_URI, expectedDatabase: process.env.MEDREACH_MIGRATION_DATABASE,
      apply, allowUniqueBootstrap: args.includes("--allow-unique-bootstrap"), approvedChecksum: process.env.MEDREACH_MIGRATION_APPROVED_CHECKSUM,
      backup: apply ? JSON.parse(await readFile(process.env.MEDREACH_MIGRATION_BACKUP_RECEIPT, "utf8")) : undefined });
  } catch (error) { console.error(/^MIGRATION_[A-Z_]+$/.test(error.message) ? error.message : "MIGRATION_FAILED_CHECK_PRIVATE_DIAGNOSTICS"); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
}
