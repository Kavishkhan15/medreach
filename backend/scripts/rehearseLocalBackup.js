/** Actual encrypted dump/restore of owned synthetic fixtures; never the application DB. */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { createEncryptedBackup, verifyEncryptedRestore } from './verifiedBackup.js';
export function guardedBackupFixtureUri(value = 'mongodb://127.0.0.1:27017/medreach_backup_fixture_test') {
 const url = new URL(value);
 if (url.protocol !== 'mongodb:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash || url.pathname !== '/medreach_backup_fixture_test' || !url.port) throw Error('BACKUP_REHEARSAL_TARGET_REFUSED');
 return url.href;
}
export async function rehearseLocalBackup({ sourceUri = guardedBackupFixtureUri(), outputDirectory = '/tmp/medreach-local-staging' } = {}) {
 sourceUri = guardedBackupFixtureUri(sourceUri);
 const targetUri = sourceUri.replace('/medreach_backup_fixture_test', '/medreach_backup_restore_test');
 const [source, target] = [sourceUri, targetUri].map(uri => new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 3000, maxPoolSize: 2 }));
 const lockPath = '/tmp/medreach-owned-backup-rehearsal.lock';
 const lock = await open(lockPath, 'wx', 0o600);
 const owner = randomUUID(); const directory = await mkdtemp(join(tmpdir(), 'medreach-owned-backup-'));
 const previous = { key: process.env.MEDREACH_BACKUP_ENCRYPTION_KEY, email: process.env.EMAIL_ENABLED };
 let owned = false, result, failure; const started = Date.now();
 try {
  await Promise.all([source.connect(), target.connect()]);
  for (const client of [source, target]) if ((await client.db().listCollections().toArray()).length) throw Error('BACKUP_REHEARSAL_REQUIRES_EMPTY_DATABASES');
  await source.db().collection('_staging_owner').insertOne({ _id: owner }); owned = true;
  const hospital = new mongoose.Types.ObjectId(), inventory = new mongoose.Types.ObjectId(), request = new mongoose.Types.ObjectId();
  await source.db().collection('hospitals').insertOne({ _id: hospital, name: 'Synthetic restore hospital', classification: 'demo' });
  await source.db().collection('resourceinventories').insertOne({ _id: inventory, organization: hospital, resourceKey: 'general_beds', capacity: 50, available: null, classification: 'demo', observedAt: null });
  await source.db().collection('emergencyrequests').insertOne({ _id: request, hospital, status: 'requested', classification: 'demo' });
  await source.db().collection('resourceinventories').createIndex({ organization: 1, resourceKey: 1 }, { unique: true });
  process.env.MEDREACH_BACKUP_ENCRYPTION_KEY = randomBytes(32).toString('base64'); process.env.EMAIL_ENABLED = 'false';
  const receiptPath = join(directory, 'receipt.json');
  await createEncryptedBackup({ uri: sourceUri, database: 'medreach_backup_fixture_test', archivePath: join(directory, 'fixture.enc'), receiptPath, sourceQuiesced: true });
  const receipt = await verifyEncryptedRestore({ sourceUri, targetUri, receiptPath });
  const restored = target.db();
  if (!await restored.collection('hospitals').findOne({ _id: hospital }) || !await restored.collection('emergencyrequests').findOne({ _id: request, hospital }) || !await restored.collection('resourceinventories').findOne({ _id: inventory, organization: hospital, available: { $type: 10 } })) throw Error('BACKUP_REHEARSAL_RELATIONSHIP_CHECK_FAILED');
  const report = { schemaVersion: 1, environment: 'isolated-local-staging', verifiedAt: receipt.verifiedAt, encrypted: true, contentAndIndexesVerified: true,
   syntheticRecords: 3, relationshipsVerified: true, unknownAvailabilityPreserved: true, outgoingMessagesEnabled: false,
   restoreDurationMs: receipt.restoreDurationMs, recoverableAgeMs: receipt.recoverableAgeMs, totalDrillDurationMs: Date.now() - started,
   limitation: 'Synthetic local drill; no production backup retention, production-scale recovery target or HTTP restore read verified',
   recoveryMaterialRetained: false };
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const reportPath = resolve(outputDirectory, `backup-rehearsal-${Date.now()}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  result = { ...report, reportPath };
 } catch (error) { failure = error; } finally {
  let cleanupError;
  if (owned) {
   // Never clear preexisting or foreign records, even if restore failed.
   for (const client of [source, target]) try {
    if (await client.db().collection('_staging_owner').findOne({ _id: owner })) await client.db().dropDatabase();
   } catch (error) { cleanupError ||= error; }
  }
  for (const cleanup of [() => source.close(), () => target.close(), () => rm(directory, { recursive: true, force: true }), () => lock.close(), () => unlink(lockPath)]) {
   try { await cleanup(); } catch (error) { cleanupError ||= error; }
  }
  for (const [name, value] of [['MEDREACH_BACKUP_ENCRYPTION_KEY', previous.key], ['EMAIL_ENABLED', previous.email]]) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  failure ||= cleanupError;
 }
 if (failure) throw failure;
 return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try { console.log(JSON.stringify(await rehearseLocalBackup({ sourceUri: process.env.MEDREACH_BACKUP_FIXTURE_URI, outputDirectory: process.env.MEDREACH_STAGING_REPORT_DIRECTORY }), null, 2)); }
 catch { console.error(JSON.stringify({ event: 'backup_rehearsal_failed' })); process.exitCode = 1; }
}
