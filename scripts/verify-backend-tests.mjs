import { spawn } from "node:child_process";

const databaseConfig = [
  ["MEDREACH_DIAGNOSTIC_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_diagnostic_requests_test", "medreach_diagnostic_requests_test"],
  ["MEDREACH_ENRICHMENT_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_enrichment_test", "medreach_enrichment_test"],
  ["MEDREACH_METRICS_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_metrics_test", "medreach_metrics_test"],
  ["MEDREACH_ADOPTION_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_adoption_test", "medreach_adoption_test"],
  ["MEDREACH_PROVIDER_ADOPTION_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_provider_adoption_test", "medreach_provider_adoption_test"],
  ["MEDREACH_ADOPTION_INDEXES_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_adoption_indexes_test", "medreach_adoption_indexes_test"],
  ["MEDREACH_ARCHIVAL_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_archival_test", "medreach_archival_test"],
  ["MEDREACH_INVENTORY_IMPORT_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_inventory_import_test", "medreach_inventory_import_test"],
  ["MEDREACH_INTEGRITY_MIGRATIONS_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_integrity_migrations_test", "medreach_integrity_migrations_test"],
  ["MEDREACH_PRIVILEGED_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_privileged_test", "medreach_privileged_test"],
  ["MEDREACH_PRIVACY_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_privacy_test", "medreach_privacy_test"],
  ["MEDREACH_BACKUP_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_backup_fixture_test", "medreach_backup_fixture_test"],
  ["MEDREACH_PRODUCTION_MIGRATION_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_production_migration_test", "medreach_production_migration_test"],
  ["MEDREACH_COVERAGE_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_coverage_test", "medreach_coverage_test"],
  ["MEDREACH_REQUEST_EFFECTS_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_request_effects_test", "medreach_request_effects_test"],
  ["MEDREACH_MIGRATIONS_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_migrations_test", "medreach_migrations_test"],
  ["MEDREACH_INVENTORY_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_inventory_test", "medreach_inventory_test"],
  ["MEDREACH_INVENTORY_DEMO_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_inventory_demo_test", "medreach_inventory_demo_test"],
  ["MEDREACH_NOTIFICATION_LIFECYCLE_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_notification_lifecycle_test", "medreach_notification_lifecycle_test"],
  ["MEDREACH_BACKGROUND_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_background_jobs_test", "medreach_background_jobs_test"],
  ["MEDREACH_COORDINATION_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_coordination_test", "medreach_coordination_test"],
  ["MEDREACH_SCALE_PERFORMANCE_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_scale_performance_test", "medreach_scale_performance_test"],
  ["MEDREACH_SCALING_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_scaling_test", "medreach_scaling_test"],
  ["MEDREACH_OPERATIONS_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_operations_test", "medreach_operations_test"],
  ["MEDREACH_PERFORMANCE_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_performance_test", "medreach_performance_test"],
  ["MEDREACH_MANUAL_CREDENTIALS_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_provider_credentials_test", "medreach_provider_credentials_test"],
  ["MEDREACH_ROLE_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_roles_test", "medreach_roles_test"],
  ["MEDREACH_LOCAL_SECURITY_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_local_security_test", "medreach_local_security_test"],
  ["MEDREACH_RELIABILITY_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_reliability_contracts_test", "medreach_reliability_contracts_test"],
  ["MEDREACH_WORKFLOW_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_workflow_verification", "medreach_workflow_verification"],
  ["MEDREACH_GUEST_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_emergency_guest_test", "medreach_emergency_guest_test"],
  ["MEDREACH_EMAIL_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_google_email_test", "medreach_google_email_test"],
  ["MEDREACH_CAREERS_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_careers_test", "medreach_careers_test"],
  ["MEDREACH_BASE_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_test", "medreach_test"],
  ["MEDREACH_AUTH_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_auth_test", "medreach_auth_test"],
  ["MEDREACH_PRODUCT_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_product_integration", "medreach_product_integration"],
  ["MEDREACH_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_fusion_integration", "medreach_fusion_integration"],
  ["MEDREACH_MUMBAI_TEST_MONGO_URI", "mongodb://127.0.0.1:27017/medreach_mumbai_network_test", "medreach_mumbai_network_test"],
];

function databaseName(uri, variable) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`${variable} must be a valid MongoDB URI`);
  }
  if (parsed.protocol !== "mongodb:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error(`${variable} must use an explicitly isolated loopback MongoDB database`);
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!name || name.includes("/")) throw new Error(`${variable} must include one database name`);
  return name;
}

const testPort = process.env.MEDREACH_TEST_MONGO_PORT || "27017";
if (!/^\d+$/.test(testPort) || Number(testPort) < 1 || Number(testPort) > 65535) {
  throw new Error("MEDREACH_TEST_MONGO_PORT must be a port between 1 and 65535");
}
const testEnv = { ...process.env, NODE_ENV: "test", EMAIL_ENABLED: "false", AI_PROVIDER: "rule_based" };
for (const [variable, fallback, expectedDatabase] of databaseConfig) {
  const uri = process.env[variable] || fallback.replace(":27017/", `:${testPort}/`);
  const actualDatabase = databaseName(uri, variable);
  if (actualDatabase !== expectedDatabase) {
    throw new Error(`${variable} must target the isolated database ${expectedDatabase}; received ${actualDatabase}`);
  }
  testEnv[variable] = uri;
  console.log(`DB gate enabled: ${variable} -> ${actualDatabase}`);
}
testEnv.MONGODB_URI = testEnv.MEDREACH_BASE_TEST_MONGO_URI;
testEnv.MONGO_URI = testEnv.MEDREACH_BASE_TEST_MONGO_URI;

const child = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap"], {
  cwd: new URL("../backend/", import.meta.url),
  env: testEnv,
  stdio: ["inherit", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  output += chunk;
  process.stderr.write(chunk);
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => {
    if (signal) reject(new Error(`Backend tests terminated by ${signal}`));
    else resolve(code ?? 1);
  });
});

if (exitCode !== 0) process.exit(exitCode);

const skipped = [...output.matchAll(/^# skipped (\d+)$/gm)].at(-1);
if (!skipped || !/^# tests \d+$/m.test(output)) {
  console.error("Backend verification failed: complete TAP totals were not reported.");
  process.exit(1);
}
if (skipped && Number(skipped[1]) > 0) {
  console.error(`Backend verification failed: ${skipped[1]} test(s) were skipped.`);
  process.exit(1);
}
if (/^ok \d+ - .+ # SKIP(?:\s|$)/m.test(output)) {
  console.error("Backend verification failed: at least one test was skipped.");
  process.exit(1);
}

console.log("Backend verification passed with every database-gated suite enabled.");
