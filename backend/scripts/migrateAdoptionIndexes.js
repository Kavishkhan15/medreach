import mongoose from "mongoose";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { productionManifest, migrateProductionIndexes } from "./migrateProductionIndexes.js";
import { IntegrationCredential } from "../src/models/IntegrationCredential.js";
import { OrganizationUsage } from "../src/models/OrganizationUsage.js";
import { ProviderGroup, ProviderOnboarding, ProviderOffboarding } from "../src/models/providerAdoptionModels.js";
export const adoptionMigrationVersion = "2026-10-27-provider-adoption-indexes-v3";
export async function adoptionManifest() { return [...await productionManifest(), IntegrationCredential, OrganizationUsage, ProviderGroup, ProviderOnboarding, ProviderOffboarding]; }
export function migrateAdoptionIndexes(options) { return migrateProductionIndexes({ ...options, migrationVersion: adoptionMigrationVersion, manifestFactory: adoptionManifest }); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2), supported = ["--dry-run", "--apply", "--allow-unique-bootstrap", "--approve-expiry-indexes"];
    if (args.some(arg => !supported.includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("MIGRATION_ARGUMENTS_INVALID");
    const apply = args.includes("--apply");
    await migrateAdoptionIndexes({ uri: process.env.MEDREACH_MIGRATION_URI, expectedDatabase: process.env.MEDREACH_MIGRATION_DATABASE, apply,
      approvedChecksum: process.env.MEDREACH_MIGRATION_APPROVED_CHECKSUM, allowUniqueBootstrap: args.includes("--allow-unique-bootstrap"), approveExpiryIndexes: args.includes("--approve-expiry-indexes"),
      backup: apply ? JSON.parse(await readFile(process.env.MEDREACH_MIGRATION_BACKUP_RECEIPT, "utf8")) : undefined });
  } catch (error) { console.error(/^MIGRATION_[A-Z_]+$/.test(error.message) ? error.message : "MIGRATION_FAILED_CHECK_PRIVATE_DIAGNOSTICS"); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
}
