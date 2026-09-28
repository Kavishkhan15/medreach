import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";

const sourceUri = process.env.MEDREACH_BACKUP_SOURCE_URI;
const restoreUri = process.env.MEDREACH_RESTORE_VERIFY_URI;

if (!sourceUri || !restoreUri) {
  throw new Error("Set MEDREACH_BACKUP_SOURCE_URI and MEDREACH_RESTORE_VERIFY_URI");
}

function parseDatabase(uri, label) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`${label} must be a valid MongoDB URI`);
  }
  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) {
    throw new Error(`${label} must use mongodb:// or mongodb+srv://`);
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!name || name.includes("/")) throw new Error(`${label} must include one database name`);
  return name;
}

const sourceDatabase = parseDatabase(sourceUri, "MEDREACH_BACKUP_SOURCE_URI");
const restoreDatabase = parseDatabase(restoreUri, "MEDREACH_RESTORE_VERIFY_URI");
if (sourceDatabase === restoreDatabase) throw new Error("Source and restore verification databases must differ");
if (!/(?:^|[_-])restore[_-]verify(?:[_-]|$)/i.test(restoreDatabase)) {
  throw new Error("Restore target database name must contain the marker restore_verify");
}

// A database in the restore URI acts as an implicit namespace filter before
// --nsFrom/--nsTo is applied. Connect at cluster scope and retain the original
// database as authSource when credentials relied on that default.
const restoreToolUrl = new URL(restoreUri);
restoreToolUrl.pathname = "/";
if (restoreToolUrl.username && !restoreToolUrl.searchParams.has("authSource")) {
  restoreToolUrl.searchParams.set("authSource", restoreDatabase);
}
const restoreToolUri = restoreToolUrl.toString();

async function snapshot(uri) {
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10_000 }).asPromise();
  try {
    const collections = (await connection.db.listCollections({}, { nameOnly: false }).toArray())
      .filter(({ name, type }) => type === "collection" && !name.startsWith("system."))
      .sort((a, b) => a.name.localeCompare(b.name));
    const result = {};
    for (const { name } of collections) {
      const collection = connection.db.collection(name);
      const indexes = (await collection.indexes())
        .map(({ name: indexName, key, unique, sparse, expireAfterSeconds, partialFilterExpression }) => ({
          name: indexName,
          key,
          ...(unique === undefined ? {} : { unique }),
          ...(sparse === undefined ? {} : { sparse }),
          ...(expireAfterSeconds === undefined ? {} : { expireAfterSeconds }),
          ...(partialFilterExpression === undefined ? {} : { partialFilterExpression }),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      result[name] = { documents: await collection.countDocuments({}), indexes };
    }
    return result;
  } finally {
    await connection.close();
  }
}

async function resetRestoreDatabase() {
  const connection = await mongoose.createConnection(restoreUri, { serverSelectionTimeoutMS: 10_000 }).asPromise();
  try {
    await connection.db.dropDatabase();
  } finally {
    await connection.close();
  }
}

async function runTool(command, args) {
  const child = spawn(command, args, { stdio: "inherit" });
  return await new Promise((resolve, reject) => {
    child.once("error", (error) => {
      if (error.code === "ENOENT") reject(new Error(`${command} is required but was not found on PATH`));
      else reject(error);
    });
    child.once("close", (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`));
      else if (code !== 0) reject(new Error(`${command} failed with exit code ${code}`));
      else resolve();
    });
  });
}

const workingDirectory = await mkdtemp(join(tmpdir(), "medreach-backup-verify-"));
const archive = join(workingDirectory, "backup.archive.gz");

try {
  const before = await snapshot(sourceUri);
  if (Object.keys(before).length === 0) throw new Error("Source database has no collections; refusing a meaningless backup test");

  await runTool("mongodump", [`--uri=${sourceUri}`, `--archive=${archive}`, "--gzip"]);
  // mongorestore --drop only removes collections that exist in the incoming
  // archive. Reset this explicitly guarded database so repeated drills cannot
  // retain a collection removed from the source since the previous run.
  await resetRestoreDatabase();
  await runTool("mongorestore", [
    `--uri=${restoreToolUri}`,
    `--archive=${archive}`,
    "--gzip",
    "--drop",
    `--nsFrom=${sourceDatabase}.*`,
    `--nsTo=${restoreDatabase}.*`,
  ]);

  const afterSource = await snapshot(sourceUri);
  if (JSON.stringify(afterSource) !== JSON.stringify(before)) {
    throw new Error("Source database changed during the backup; retry from a stable snapshot");
  }
  const restored = await snapshot(restoreUri);
  if (JSON.stringify(restored) !== JSON.stringify(before)) {
    throw new Error("Restored collection counts or indexes do not match the source snapshot");
  }

  const documents = Object.values(restored).reduce((total, item) => total + item.documents, 0);
  console.log(`Backup/restore verification passed: ${Object.keys(restored).length} collection(s), ${documents} document(s).`);
} finally {
  await rm(workingDirectory, { recursive: true, force: true });
}
