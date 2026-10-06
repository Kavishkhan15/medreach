import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import mongoose from "mongoose";

const sourceUri = process.env.MEDREACH_MIGRATION_SOURCE_URI;
const targetUri = process.env.MEDREACH_MIGRATION_TARGET_URI;
function parsePrivateUri(value) {
  if (!value) return null;
  try { return new URL(value); }
  catch { throw new Error("Invalid migration connection URI; check the private configuration"); }
}
const source = parsePrivateUri(sourceUri);
const target = parsePrivateUri(targetUri);
if (!source || !target) throw new Error("Set MEDREACH_MIGRATION_SOURCE_URI and MEDREACH_MIGRATION_TARGET_URI privately before migration");
if (!["mongodb:", "mongodb+srv:"].includes(source.protocol) || target.protocol !== "mongodb+srv:" ||
    !target.hostname.endsWith(".mongodb.net")) throw new Error("Destination must be a MongoDB Atlas SRV URI");
const sourceName = decodeURIComponent(source.pathname.slice(1));
const targetName = decodeURIComponent(target.pathname.slice(1));
if (!sourceName || !targetName || [sourceName, targetName].some((name) => /[/\s]/.test(name) || ["admin", "local", "config"].includes(name))) {
  throw new Error("Both URIs must identify an application database");
}
if (source.host === target.host && sourceName === targetName) throw new Error("Source and destination must be different databases");

async function snapshot(db) {
  const result = {};
  for (const { name, type } of await db.listCollections().toArray()) {
    if (type === "view" || name.startsWith("system.")) continue;
    const collection = db.collection(name);
    const digest = createHash("sha256");
    let count = 0;
    for await (const doc of collection.find().sort({ _id: 1 })) {
      digest.update(mongoose.mongo.BSON.EJSON.stringify(doc, { relaxed: false }));
      count++;
    }
    result[name] = { count, digest: digest.digest("hex"),
      indexes: (await collection.indexes()).map(({ name, key, unique, sparse, expireAfterSeconds, partialFilterExpression }) =>
        ({ name, key, unique, sparse, expireAfterSeconds, partialFilterExpression })).sort((a, b) => a.name.localeCompare(b.name)) };
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
async function runTool(name, args) {
  const child = spawn(name, args, { stdio: "ignore" });
  const code = await new Promise((resolveCode, reject) => {
    child.once("error", reject);
    child.once("close", resolveCode);
  });
  if (code !== 0) throw new Error(`${name} failed; the destination may contain a partial copy. The source and backup are preserved.`);
}

let sourceConnection;
let targetConnection;
let privateDirectory;
try {
  sourceConnection = await mongoose.createConnection(sourceUri, { autoIndex: false, serverSelectionTimeoutMS: 10000 }).asPromise();
  targetConnection = await mongoose.createConnection(targetUri, { autoIndex: false, serverSelectionTimeoutMS: 10000 }).asPromise();
  if ((await targetConnection.db.listCollections().toArray()).length) throw new Error("Atlas destination must be empty; refusing to overwrite or merge existing data");
  const before = await snapshot(sourceConnection.db);
  if (!Object.values(before).some(({ count }) => count > 0)) throw new Error("Source is empty; refusing migration");
  const backupDirectory = resolve(process.env.MEDREACH_MIGRATION_BACKUP_DIR || ".migration-backups");
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const archive = join(backupDirectory, `medreach-${Date.now()}.archive.gz`);
  privateDirectory = await mkdtemp(join(tmpdir(), "medreach-migration-config-"));
  const sourceConfig = join(privateDirectory, "source.yml");
  const targetConfig = join(privateDirectory, "target.yml");
  await writeFile(sourceConfig, JSON.stringify({ uri: sourceUri }), { mode: 0o600 });
  // A database in mongorestore's connection URI filters archive namespaces
  // before renaming. Connect without that filter and explicitly map the dump.
  const restoreUri = new URL(targetUri);
  restoreUri.pathname = "/";
  await writeFile(targetConfig, JSON.stringify({ uri: restoreUri.toString() }), { mode: 0o600 });
  console.log("Creating a backup of every application collection. Pause application writes before running this tool.");
  await runTool("mongodump", [`--config=${sourceConfig}`, `--archive=${archive}`, "--gzip"]);
  await chmod(archive, 0o600);
  console.log(`Backup retained at ${archive}`);
  if (JSON.stringify(before) !== JSON.stringify(await snapshot(sourceConnection.db))) throw new Error("Source changed during backup; pause writes and try again with a new empty target");
  await runTool("mongorestore", [`--config=${targetConfig}`, `--archive=${archive}`, "--gzip", "--stopOnError",
    `--nsInclude=${sourceName}.*`, `--nsFrom=${sourceName}.*`, `--nsTo=${targetName}.*`]);
  const after = await snapshot(targetConnection.db);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Atlas contents or indexes differ from the backup source. Keep the application on the source until reviewed.");
  console.log(`Verified ${Object.keys(after).length} collections and ${Object.values(after).reduce((sum, row) => sum + row.count, 0)} documents, including BSON content and indexes. Set the backend MONGODB_URI to the Atlas URI when ready.`);
} catch (error) {
  // Driver errors can contain hosts or credentials. Report only operational
  // errors generated by this tool, never raw connection exceptions.
  const safe = /^(Atlas destination|Source is empty|Source changed|Atlas contents|mongodump failed|mongorestore failed)/.test(error.message);
  console.error(safe ? error.message : "Migration failed. Check private connection settings and MongoDB Database Tools; the source remains unchanged.");
  process.exitCode = 1;
} finally {
  await sourceConnection?.close();
  await targetConnection?.close();
  if (privateDirectory) await rm(privateDirectory, { recursive: true, force: true });
}
