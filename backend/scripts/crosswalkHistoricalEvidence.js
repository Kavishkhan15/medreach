/** Reads historical BSON archive bytes only; never connects to MongoDB or writes repairs. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve, relative, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
const hash = value => createHash('sha256').update(value).digest('hex');
export function scanMongoArchive(buffer, onDocument) {
 if (buffer.length < 8 || buffer.readUInt32LE(0) !== 0x8199e26d) throw Error('EVIDENCE_ARCHIVE_FORMAT_UNSUPPORTED');
 let offset = 4, metadata = true, namespace, expectingHeader = false, documents = 0;
 while (offset < buffer.length) {
  if (offset + 4 > buffer.length) throw Error('EVIDENCE_ARCHIVE_TRUNCATED');
  const size = buffer.readInt32LE(offset);
  if (size === -1) { offset += 4; metadata = false; expectingHeader = true; namespace = null; continue; }
  if (size < 5 || size > 16 * 1024 * 1024 || offset + size > buffer.length) throw Error('EVIDENCE_ARCHIVE_BSON_INVALID');
  const bytes = buffer.subarray(offset, offset + size);
  const document = mongoose.mongo.BSON.deserialize(bytes);
  offset += size;
  if (metadata) continue;
  if (expectingHeader) {
   if (typeof document.db !== 'string' || typeof document.collection !== 'string' || typeof document.EOF !== 'boolean') throw Error('EVIDENCE_ARCHIVE_NAMESPACE_INVALID');
   namespace = document.EOF ? null : { database: document.db, collection: document.collection };
   expectingHeader = false; continue;
  }
  if (!namespace) throw Error('EVIDENCE_ARCHIVE_DOCUMENT_WITHOUT_NAMESPACE');
  onDocument({ ...namespace, document, bytes }); documents++;
 }
 return { documents, crcVerified: false };
}
export async function crosswalkHistoricalEvidence({ projectRoot = process.cwd(), manifestPath, artifactInventoryPath } = {}) {
 const root = resolve(projectRoot);
 const [manifest, inventory] = await Promise.all([manifestPath, artifactInventoryPath].map(async path => JSON.parse(await readFile(path, 'utf8'))));
 if (!Array.isArray(manifest.entries) || manifest.executable !== false || !Array.isArray(inventory.files)) throw Error('EVIDENCE_INPUT_INVALID');
 const desired = new Map();
 for (const entry of manifest.entries) if (entry.issue === 'missing_target' && /^[a-f\d]{24}$/i.test(entry.storedReference || '') && /^[a-zA-Z0-9_]+$/.test(entry.targetCollection || '')) {
  const key = `${entry.targetCollection}:${entry.storedReference}`;
  if (!desired.has(key)) desired.set(key, { originalId: entry.storedReference, collection: entry.targetCollection, findingIds: [], snapshots: [] });
  desired.get(key).findingIds.push(entry.findingId);
 }
 const scans = [];
 for (const file of inventory.files.filter(row => /\.archive\.gz$/.test(row.path))) {
  const path = resolve(root, file.path);
  if (!path.startsWith(`${root}${sep}`)) throw Error('EVIDENCE_PATH_OUTSIDE_PROJECT');
  const compressed = await readFile(path);
  if (hash(compressed) !== file.sha256) throw Error('EVIDENCE_ARTIFACT_CHECKSUM_CHANGED');
  let matched = 0;
  const result = scanMongoArchive(gunzipSync(compressed, { maxOutputLength: 128 * 1024 * 1024 }), ({ database, collection, document, bytes }) => {
   // Only an exact target ID in the expected collection can become a candidate.
   const id = document._id?.toHexString?.();
   const row = id && desired.get(`${collection}:${id}`);
   if (!row) return;
   row.snapshots.push({ artifactPath: relative(root, path), artifactSha256: file.sha256, sourceDatabase: database,
    matchingFieldsSha256: hash(bytes), hashScope: 'complete original BSON document bytes; no field values exported', authority: 'unverified' });
   matched++;
  });
  scans.push({ artifactPath: file.path, artifactSha256: file.sha256, documentsScanned: result.documents, exactIdMatches: matched, crcVerified: result.crcVerified });
 }
 const candidates = [...desired.values()].filter(row => row.snapshots.length).map(row => {
  const conflictingSnapshots = new Set(row.snapshots.map(s => s.matchingFieldsSha256)).size > 1 || new Set(row.snapshots.map(s => s.sourceDatabase)).size > 1;
  return { ...row, conflictingSnapshots, potentialResolution: conflictingSnapshots ? 'unresolved_conflicting_snapshots' : 'restore_original_record',
   executable: false, authorityVerified: false, approvalRequired: true,
   reason: 'Exact ID and collection only. Artifact origin, current database identity, dependencies, temporal meaning and backup validity still require review. No restoration or reassignment has been applied.' };
 });
 return { schemaVersion: 1, generatedAt: new Date().toISOString(), mode: 'read_only_review', executable: false, migrationApplied: false,
  manifestSha256: hash(await readFile(manifestPath)), missingTargetFindings: [...desired.values()].reduce((sum, row) => sum + row.findingIds.length, 0),
  distinctMissingTargetIds: desired.size, candidates: candidates.sort((a, b) => `${a.collection}:${a.originalId}`.localeCompare(`${b.collection}:${b.originalId}`)),
  noExactSnapshotFound: [...desired.values()].filter(row => !row.snapshots.length).map(({ originalId, collection, findingIds }) => ({ originalId, collection, findingIds })),
  scans, caveat: 'Archive BSON framing was parsed read-only; per-block archive CRC and provenance authority were not validated. A candidate is not an approved repair.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try {
  const [manifestPath, artifactInventoryPath, outputPath] = process.argv.slice(2);
  if (!manifestPath || !artifactInventoryPath || !outputPath) throw Error('EVIDENCE_ARGUMENTS_REQUIRED');
  const result = await crosswalkHistoricalEvidence({ manifestPath, artifactInventoryPath });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ event: 'historical_evidence_crosswalk', distinctMissingTargetIds: result.distinctMissingTargetIds,
   candidates: result.candidates.length, conflictingCandidates: result.candidates.filter(row => row.conflictingSnapshots).length, executableRepairs: 0 }));
 } catch { console.error(JSON.stringify({ event: 'historical_evidence_crosswalk_failed' })); process.exitCode = 1; }
}
