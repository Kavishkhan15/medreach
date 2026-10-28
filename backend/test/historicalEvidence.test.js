import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { scanMongoArchive, crosswalkHistoricalEvidence } from '../scripts/crosswalkHistoricalEvidence.js';
function archive(documents) {
 const bson = mongoose.mongo.BSON.serialize;
 const magic = Buffer.alloc(4); magic.writeUInt32LE(0x8199e26d);
 const end = Buffer.alloc(4); end.writeInt32LE(-1);
 return Buffer.concat([magic, bson({ version: '0.1' }), end, bson({ db: 'medreach', collection: 'hospitals', EOF: false, CRC: 0 }), ...documents.map(bson), end, bson({ db: 'medreach', collection: 'hospitals', EOF: true, CRC: 0 }), end]);
}
test('read-only archive scan associates BSON records only with explicit namespace framing', () => {
 const id = new mongoose.Types.ObjectId(); const scanned = [];
 const data = archive([{ _id: id, secret: 'do not export' }]);
 assert.equal(scanMongoArchive(data, row => scanned.push(row)).documents, 1);
 assert.equal(scanned[0].collection, 'hospitals'); assert.equal(scanned[0].document._id.toString(), id.toString());
 assert.throws(() => scanMongoArchive(data.subarray(0, data.length - 2), () => {}), /TRUNCATED/);
 assert.throws(() => scanMongoArchive(Buffer.alloc(10), () => {}), /UNSUPPORTED/);
});
test('historical crosswalk exports exact-ID hashes only and leaves all candidates unapproved', async () => {
 const root = await mkdtemp(join(tmpdir(), 'medreach-crosswalk-'));
 try {
  await mkdir(join(root, '.migration-backups'));
  const id = new mongoose.Types.ObjectId(), absent = new mongoose.Types.ObjectId();
  const bytes = gzipSync(archive([{ _id: id, name: 'secret organisation', contact: 'private@example.invalid' }]));
  await writeFile(join(root, '.migration-backups', 'snapshot.archive.gz'), bytes);
  const manifestPath = join(root, 'manifest.json'), artifactInventoryPath = join(root, 'inventory.json');
  await writeFile(manifestPath, JSON.stringify({ executable: false, entries: [id, absent].map((value, i) => ({ findingId: String(i), issue: 'missing_target', targetCollection: 'hospitals', storedReference: value.toString() })) }));
  await writeFile(artifactInventoryPath, JSON.stringify({ files: [{ path: '.migration-backups/snapshot.archive.gz', sha256: createHash('sha256').update(bytes).digest('hex') }] }));
  const result = await crosswalkHistoricalEvidence({ projectRoot: root, manifestPath, artifactInventoryPath });
  assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0].originalId, id.toString());
  assert.equal(result.candidates[0].potentialResolution, 'restore_original_record'); assert.equal(result.candidates[0].executable, false);
  assert.equal(result.noExactSnapshotFound.length, 1); assert.equal(result.executable, false);
  assert.ok(!JSON.stringify(result).includes('secret organisation')); assert.ok(!JSON.stringify(result).includes('private@example.invalid'));
  await writeFile(join(root, '.migration-backups', 'snapshot.archive.gz'), Buffer.from('changed'));
  await assert.rejects(() => crosswalkHistoricalEvidence({ projectRoot: root, manifestPath, artifactInventoryPath }), /CHECKSUM_CHANGED/);
 } finally { await rm(root, { recursive: true, force: true }); }
});
