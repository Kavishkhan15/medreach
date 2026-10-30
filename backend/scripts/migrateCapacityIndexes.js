import mongoose from "mongoose";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { ResourceReservation } from "../src/models/ResourceReservation.js";
import { DiagnosticDailyCapacity } from "../src/models/DiagnosticDailyCapacity.js";
import { DiagnosticRequest } from "../src/models/DiagnosticRequest.js";
import { migrateProductionIndexes } from "./migrateProductionIndexes.js";

export const capacityManifest = async () => [ResourceReservation, DiagnosticDailyCapacity, DiagnosticRequest];
export const migrateCapacityIndexes = options => migrateProductionIndexes({ ...options,
  migrationVersion: "2026-10-30-capacity-reservations-v1", manifestFactory: capacityManifest });
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !["--dry-run", "--apply", "--allow-unique-bootstrap"].includes(arg)) || args.includes("--dry-run") && args.includes("--apply")) throw Error("MIGRATION_ARGUMENTS_INVALID");
    const apply = args.includes("--apply");
    await migrateCapacityIndexes({ uri: process.env.MEDREACH_MIGRATION_URI, expectedDatabase: process.env.MEDREACH_MIGRATION_DATABASE,
      apply, allowUniqueBootstrap: args.includes("--allow-unique-bootstrap"), approvedChecksum: process.env.MEDREACH_MIGRATION_APPROVED_CHECKSUM,
      backup: apply ? JSON.parse(await readFile(process.env.MEDREACH_MIGRATION_BACKUP_RECEIPT, "utf8")) : undefined });
  } catch (error) { console.error(/^MIGRATION_[A-Z_]+$/.test(error.message) ? error.message : "MIGRATION_FAILED_CHECK_PRIVATE_DIAGNOSTICS"); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
}
