/** Metadata/checksums only. Never parses records or treats matching filenames as authority. */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, lstat, realpath, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
const skip = new Set(['node_modules', '.git', '.next', '.kiro', '.venv']);
export async function inventoryEvidenceArtifacts({ root = process.cwd(), directories = ['.migration-backups', 'data', 'output'], maxFiles = 20000 } = {}) {
  const base = await realpath(root); const files = []; let visited = 0;
  for (const directory of directories) {
    const target = resolve(base, directory);
    if (!target.startsWith(`${base}${sep}`)) throw Error('EVIDENCE_PATH_OUTSIDE_PROJECT');
    async function walk(path) {
      let stat; try { stat = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
      if (stat.isSymbolicLink()) return;
      if (++visited > maxFiles) throw Error('EVIDENCE_SCAN_LIMIT');
      if (stat.isDirectory()) { for (const item of await readdir(path)) if (!skip.has(item)) await walk(resolve(path, item)); return; }
      if (!stat.isFile() || !/\.(?:bson|archive(?:\.gz)?|dump|csv|ndjson|jsonl|zip)$|(?:backup|receipt|import|manifest).*\.json$/i.test(path)) return;
      const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk);
      const after = await lstat(path);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('EVIDENCE_FILE_CHANGED_DURING_SCAN');
      files.push({ path: relative(base, path), bytes: stat.size, modifiedAt: stat.mtime.toISOString(), sha256: hash.digest('hex'),
        authority: 'unverified', recordContentInspected: false, restorationPerformed: false });
    }
    await walk(target);
  }
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), readOnly: true, scannedDirectories: directories,
    authorityPolicy: 'Checksums identify artifacts only. No artifact is authoritative until its origin, database identity, scope and record evidence are verified.',
    files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await inventoryEvidenceArtifacts(); const output = process.env.MEDREACH_EVIDENCE_METADATA_PATH;
    if (!output) throw Error('EVIDENCE_OUTPUT_PATH_REQUIRED');
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ event: 'evidence_artifact_inventory', files: result.files.length, recordContentInspected: false }));
  } catch { console.error(JSON.stringify({ event: 'evidence_artifact_inventory_failed' })); process.exitCode = 1; }
}
