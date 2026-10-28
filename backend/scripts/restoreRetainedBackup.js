/** Source-independent recovery into an explicitly isolated, empty target. */
import { createDecipheriv } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { contentDigest, fileSha256 } from "./verifiedBackup.js";

export function validateRecoveryTarget(uri) {
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_backup_restore_test$/.test(uri || "")) throw Error("RECOVERY_TARGET_REFUSED");
  if (process.env.EMAIL_ENABLED !== "false") throw Error("RECOVERY_EMAIL_MUST_BE_DISABLED");
}

export async function restoreRetainedBackup({ targetUri, receiptPath, expectedReceiptSha256, maxArchiveBytes = 1024 ** 3, timeoutMs = 180000 } = {}) {
  validateRecoveryTarget(targetUri);
  if (!/^[a-f0-9]{64}$/.test(expectedReceiptSha256 || "") || !Number.isSafeInteger(maxArchiveBytes) || maxArchiveBytes < 1 || maxArchiveBytes > 32 * 1024 ** 3 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 1800000) throw Error("RECOVERY_CONFIGURATION_INVALID");
  if (await fileSha256(receiptPath) !== expectedReceiptSha256) throw Error("RECOVERY_RECEIPT_CHANGED");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  if (receipt.schemaVersion !== 1 || receipt.restoreVerified !== true || receipt.encrypted !== true || receipt.algorithm !== "aes-256-gcm" || !/^[-a-zA-Z0-9_]+$/.test(receipt.database || "") || !receipt.content || !Object.keys(receipt.content).length) throw Error("RECOVERY_VERIFIED_RECEIPT_REQUIRED");
  const info = await stat(receipt.archivePath);
  if (info.size < 13 || info.size > maxArchiveBytes) throw Error("RECOVERY_ARCHIVE_SIZE_REFUSED");
  if (await fileSha256(receipt.archivePath) !== receipt.archiveSha256) throw Error("RECOVERY_ARCHIVE_CHANGED");
  const key = Buffer.from(process.env.MEDREACH_BACKUP_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32 || Buffer.from(receipt.authTag || "", "base64").length !== 16) throw Error("RECOVERY_KEY_OR_TAG_INVALID");
  const client = new mongoose.mongo.MongoClient(targetUri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 2 });
  const directory = await mkdtemp(join(tmpdir(), "medreach-authenticated-restore-"));
  let child; const started = Date.now();
  try {
    await client.connect();
    if ((await client.db().listCollections().toArray()).length) throw Error("RECOVERY_TARGET_NOT_EMPTY");
    const iv = Buffer.alloc(12), handle = await open(receipt.archivePath, "r");
    try { await handle.read(iv, 0, 12, 0); } finally { await handle.close(); }
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(Buffer.from(receipt.authTag, "base64"));
    const authenticatedArchive = join(directory, "authenticated.archive.gz");
    // Authenticate the complete encrypted stream before mongorestore may write
    // any plaintext. A wrong key/tag never leaves a partial target database.
    await pipeline(createReadStream(receipt.archivePath, { start: 12 }), decipher, createWriteStream(authenticatedArchive, { flags: "wx", mode: 0o600 }));
    if ((await client.db().listCollections().toArray()).length) throw Error("RECOVERY_TARGET_NOT_EMPTY");
    const root = new URL(targetUri); root.pathname = "/";
    child = spawn("mongorestore", ["--uri", root.href, `--archive=${authenticatedArchive}`, "--gzip", "--stopOnError", "--nsFrom", `${receipt.database}.*`, "--nsTo", "medreach_backup_restore_test.*", "--quiet"], { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.resume();
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => { child.kill("SIGKILL"); reject(Error("RECOVERY_TOOL_TIMEOUT")); }, timeoutMs);
      deadline.unref?.();
      child.once("error", () => { clearTimeout(deadline); reject(Error("RECOVERY_TOOL_UNAVAILABLE")); });
      child.once("exit", code => { clearTimeout(deadline); code === 0 ? resolve() : reject(Error("RECOVERY_TOOL_FAILED")); });
    });
    const content = await contentDigest(client, "medreach_backup_restore_test");
    if (JSON.stringify(content) !== JSON.stringify(receipt.content)) throw Error("RECOVERY_CONTENT_MISMATCH");
    return { schemaVersion: 1, sourceDatabaseRequired: false, authenticatedBeforeWrites: true, contentAndIndexesVerified: true, verifiedAt: new Date().toISOString(), archiveSha256: receipt.archiveSha256, receiptSha256: expectedReceiptSha256, restoreDurationMs: Date.now() - started, content };
  } catch (error) { child?.kill(); throw error; }
  finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await restoreRetainedBackup({ targetUri: process.env.MEDREACH_RESTORE_VERIFY_URI, receiptPath: process.env.MEDREACH_BACKUP_RECEIPT, expectedReceiptSha256: process.env.MEDREACH_TRUSTED_RECEIPT_SHA256 });
    console.log(JSON.stringify({ event: "retained_backup_recovery_verified", restoreDurationMs: result.restoreDurationMs }));
  } catch (error) { console.error(/^RECOVERY_[A-Z_]+$/.test(error.message) ? error.message : "RECOVERY_FAILED"); process.exitCode = 1; }
}
