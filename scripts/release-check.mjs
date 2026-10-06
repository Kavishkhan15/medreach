import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const requiredEnvironment = [
  "MEDREACH_E2E_MONGO_URI",
  "MEDREACH_BACKUP_SOURCE_URI",
  "MEDREACH_RESTORE_VERIFY_URI",
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length > 0) {
  throw new Error(
    `Release check prerequisites are missing: ${missingEnvironment.join(", ")}. ` +
    "Use isolated e2e/restore_verify databases and see docs/deployment.md.",
  );
}

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (!packageJson.scripts?.["test:e2e"]) {
  throw new Error("The package script test:e2e is required before release:check can run");
}

async function run(label, command, args) {
  console.log(`\n=== ${label} ===`);
  const child = spawn(command, args, { cwd: root, env: process.env, stdio: "inherit" });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) reject(new Error(`${label} terminated by ${signal}`));
      else resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) throw new Error(`${label} failed with exit code ${exitCode}`);
}

await run("Backend tests, including MongoDB-gated suites", process.execPath, ["scripts/verify-backend-tests.mjs"]);
await run("Production dependency vulnerability gate", npm, ["audit", "--audit-level=high"]);
await run("Bootstrap, Tailwind, and Skeleton production builds", npm, ["run", "build:variants"]);
await run("Critical browser journeys in all three variants", npm, ["run", "test:e2e"]);
await run("MongoDB backup and restore drill", npm, ["run", "verify:mongo-backup"]);
await run("Patch whitespace validation", "git", ["diff", "--check"]);

console.log("\nRelease checks passed.");
