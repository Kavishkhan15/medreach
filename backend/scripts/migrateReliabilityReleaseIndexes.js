import mongoose from "mongoose";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { adoptionManifest } from "./migrateAdoptionIndexes.js";
import { migrateProductionIndexes } from "./migrateProductionIndexes.js";
import { HospitalEnrichment } from "../src/models/HospitalEnrichment.js";
import { BackendLatencyBucket } from "../src/models/BackendLatencyBucket.js";
export const reliabilityReleaseMigrationVersion = "2026-10-27-reliability-release-indexes-v4";
export async function reliabilityReleaseManifest() { return [...await adoptionManifest(), HospitalEnrichment, BackendLatencyBucket]; }
export function migrateReliabilityReleaseIndexes(options) { return migrateProductionIndexes({ ...options, migrationVersion: reliabilityReleaseMigrationVersion, manifestFactory: reliabilityReleaseManifest }); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2), supported = ["--dry-run", "--apply", "--allow-unique-bootstrap", "--approve-expiry-indexes"];
    if (args.some(arg => !supported.includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) throw Error("MIGRATION_ARGUMENTS_INVALID");
    const apply = args.includes("--apply");
    await migrateReliabilityReleaseIndexes({ uri: process.env.MEDREACH_MIGRATION_URI, expectedDatabase: process.env.MEDREACH_MIGRATION_DATABASE, apply,
      approvedChecksum: process.env.MEDREACH_MIGRATION_APPROVED_CHECKSUM, allowUniqueBootstrap: args.includes("--allow-unique-bootstrap"), approveExpiryIndexes: args.includes("--approve-expiry-indexes"),
      backup: apply ? JSON.parse(await readFile(process.env.MEDREACH_MIGRATION_BACKUP_RECEIPT, "utf8")) : undefined });
  } catch (error) { console.error(/^MIGRATION_[A-Z_]+$/.test(error.message) ? error.message : "MIGRATION_FAILED_CHECK_PRIVATE_DIAGNOSTICS"); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
}
