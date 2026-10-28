import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEncryptedBackup, verifyEncryptedRestore, fileSha256 } from "../scripts/verifiedBackup.js";
import { restoreRetainedBackup } from "../scripts/restoreRetainedBackup.js";
const uri = process.env.MEDREACH_BACKUP_TEST_MONGO_URI;
const isolated = /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_backup_fixture_test$/.test(uri || "");
test("retained encrypted backup recovers without source and authenticates before writing", { skip: !isolated, timeout: 120000 }, async () => {
  const targetUri = uri.replace("medreach_backup_fixture_test", "medreach_backup_restore_test");
  const source = new mongoose.mongo.MongoClient(uri), target = new mongoose.mongo.MongoClient(targetUri);
  const directory = await mkdtemp(join(tmpdir(), "medreach-disaster-proof-"));
  const previous = { key: process.env.MEDREACH_BACKUP_ENCRYPTION_KEY, email: process.env.EMAIL_ENABLED }; let owned = false;
  try {
    await Promise.all([source.connect(), target.connect()]);
    for (const client of [source, target]) assert.equal((await client.db().listCollections().toArray()).length, 0);
    owned = true; process.env.EMAIL_ENABLED = "false"; process.env.MEDREACH_BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 83).toString("base64");
    await source.db().collection("inventory").insertOne({ resourceKey: "general_beds", available: null, classification: "demo" });
    await source.db().collection("inventory").createIndex({ resourceKey: 1 }, { unique: true });
    const receiptPath = join(directory, "receipt.json");
    await createEncryptedBackup({ uri, database: "medreach_backup_fixture_test", archivePath: join(directory, "retained.enc"), receiptPath, sourceQuiesced: true });
    await verifyEncryptedRestore({ sourceUri: uri, targetUri, receiptPath });
    const expectedReceiptSha256 = await fileSha256(receiptPath);
    await source.db().dropDatabase(); await target.db().dropDatabase();
    await assert.rejects(restoreRetainedBackup({ targetUri, receiptPath, expectedReceiptSha256: "0".repeat(64) }), /RECOVERY_RECEIPT_CHANGED/);
    process.env.MEDREACH_BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 84).toString("base64");
    await assert.rejects(restoreRetainedBackup({ targetUri, receiptPath, expectedReceiptSha256 }));
    assert.equal((await target.db().listCollections().toArray()).length, 0);
    process.env.MEDREACH_BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 83).toString("base64");
    const result = await restoreRetainedBackup({ targetUri, receiptPath, expectedReceiptSha256 });
    assert.equal(result.sourceDatabaseRequired, false); assert.equal(result.contentAndIndexesVerified, true);
    assert.equal((await target.db().collection("inventory").findOne()).available, null);
    await assert.rejects(restoreRetainedBackup({ targetUri, receiptPath, expectedReceiptSha256 }), /RECOVERY_TARGET_NOT_EMPTY/);
    assert.equal((await source.db().listCollections().toArray()).length, 0);
  } finally {
    if (owned) await Promise.all([source.db().dropDatabase(), target.db().dropDatabase()]);
    await Promise.all([source.close(), target.close()]); await rm(directory, { recursive: true, force: true });
    for (const [key, value] of [["MEDREACH_BACKUP_ENCRYPTION_KEY", previous.key], ["EMAIL_ENABLED", previous.email]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
