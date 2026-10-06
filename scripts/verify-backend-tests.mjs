import { spawn } from "node:child_process";

const databaseConfig = [
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
  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) {
    throw new Error(`${variable} must use mongodb:// or mongodb+srv://`);
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!name || name.includes("/")) throw new Error(`${variable} must include one database name`);
  return name;
}

const testEnv = { ...process.env, NODE_ENV: "test", EMAIL_ENABLED: "false" };
for (const [variable, fallback, expectedDatabase] of databaseConfig) {
  const uri = process.env[variable] || fallback;
  const actualDatabase = databaseName(uri, variable);
  if (actualDatabase !== expectedDatabase) {
    throw new Error(`${variable} must target the isolated database ${expectedDatabase}; received ${actualDatabase}`);
  }
  testEnv[variable] = uri;
  console.log(`DB gate enabled: ${variable} -> ${actualDatabase}`);
}
testEnv.MONGODB_URI = testEnv.MEDREACH_BASE_TEST_MONGO_URI;
testEnv.MONGO_URI = testEnv.MEDREACH_BASE_TEST_MONGO_URI;

const child = spawn(process.execPath, ["--test", "--test-concurrency=1"], {
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
if (skipped && Number(skipped[1]) > 0) {
  console.error(`Backend verification failed: ${skipped[1]} test(s) were skipped.`);
  process.exit(1);
}
if (/^ok \d+ - .+ # SKIP(?:\s|$)/m.test(output)) {
  console.error("Backend verification failed: at least one test was skipped.");
  process.exit(1);
}

console.log("Backend verification passed with every database-gated suite enabled.");
