import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
const uri = process.env.MEDREACH_MIGRATIONS_TEST_MONGO_URI;
const safe = /^mongodb:\/\/(?:127\.0\.0\.1|localhost):27017\/medreach_migrations_test$/.test(uri || "");
const target = "mongodb://127.0.0.1:27017/medreach_restore_verify_test";
function drill(source, destination) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../scripts/verifyLocalRestore.js", import.meta.url))], {
      env: { ...process.env, NODE_ENV: "test", EMAIL_ENABLED: "false", MEDREACH_BACKUP_SOURCE_URI: source, MEDREACH_RESTORE_VERIFY_URI: destination }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject); child.once("exit", (code) => resolve({ code, output }));
  });
}
test("local restore wrapper rejects canonical or remote endpoints", async () => {
  for (const source of ["mongodb://127.0.0.1:27017/medreach", "mongodb://remote:27017/medreach_migrations_test"]) {
    assert.equal((await drill(source, target)).code, 1);
  }
});
test("local isolated backup restores documents and indexes and refuses a populated target", { skip: !safe, timeout: 30000 }, async () => {
  const client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const sourceDb = client.db("medreach_migrations_test"), targetDb = client.db("medreach_restore_verify_test");
  // Never reset a database the test did not start with empty.
  const sourceEmpty = (await sourceDb.listCollections().toArray()).length === 0;
  const targetEmpty = (await targetDb.listCollections().toArray()).length === 0;
  if (!sourceEmpty || !targetEmpty) { await client.close(); assert.fail("Both isolated drill databases must initially be empty"); }
  try {
    await sourceDb.collection("restorefixture").insertOne({ _id: "synthetic", marker: "restore-drill-only", version: 1 });
    await sourceDb.collection("restorefixture").createIndex({ marker: 1 }, { unique: true });
    const result = await drill(uri, target);
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(await targetDb.collection("restorefixture").findOne({ _id: "synthetic" }), await sourceDb.collection("restorefixture").findOne({ _id: "synthetic" }));
    assert.ok((await targetDb.collection("restorefixture").indexes()).some((index) => index.unique && index.key.marker === 1));
    const refused = await drill(uri, target);
    assert.equal(refused.code, 1);
    assert.match(refused.output, /Restore target must be empty/);
    assert.equal(await sourceDb.collection("restorefixture").countDocuments(), 1);
  } finally {
    await sourceDb.dropDatabase(); await targetDb.dropDatabase(); await client.close();
  }
});
