import mongoose from "mongoose";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Exercise the existing backup verifier only with isolated synthetic datasets.
// No .env loading: both endpoints must be explicitly supplied by the operator.
const source = process.env.MEDREACH_BACKUP_SOURCE_URI;
const target = process.env.MEDREACH_RESTORE_VERIFY_URI;
const sourcePattern = /^mongodb:\/\/(?:127\.0\.0\.1|localhost):27017\/(?:medreach_demo_inventory|medreach_migrations_test)$/;
const targetPattern = /^mongodb:\/\/(?:127\.0\.0\.1|localhost):27017\/medreach_restore_verify_test$/;
try {
  if (!["development", "test"].includes(process.env.NODE_ENV) || process.env.EMAIL_ENABLED !== "false" ||
      !sourcePattern.test(source || "") || !targetPattern.test(target || "")) {
    throw new Error("Use explicit isolated loopback source and disposable medreach_restore_verify_test target, development/test mode and EMAIL_ENABLED=false");
  }
  const client = new mongoose.mongo.MongoClient(target, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    if ((await client.db("medreach_restore_verify_test").listCollections().toArray()).length) throw new Error("Restore target must be empty; choose a reviewed disposable database and clear it separately");
  } finally { await client.close(); }
  const verifier = fileURLToPath(new URL("../../scripts/verify-mongo-backup.mjs", import.meta.url));
  const child = spawn(process.execPath, [verifier], { stdio: "inherit", env: process.env });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject); child.once("exit", (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
