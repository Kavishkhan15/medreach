import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inventoryEvidenceArtifacts } from '../scripts/inventoryEvidenceArtifacts.js';
test('artifact inventory hashes allowed files without exporting contents or following symlinks', async () => {
 const root = await mkdtemp(join(tmpdir(), 'medreach-evidence-test-'));
 try {
  await mkdir(join(root, 'data')); await writeFile(join(root, 'data', 'import.csv'), 'private content');
  await writeFile(join(root, 'data', 'not-evidence.txt'), 'exclude'); await symlink('/etc/passwd', join(root, 'data', 'outside.csv'));
  const result = await inventoryEvidenceArtifacts({ root, directories: ['data'] });
  assert.equal(result.files.length, 1); assert.equal(result.files[0].path, 'data/import.csv');
  assert.equal(result.files[0].sha256, createHash('sha256').update('private content').digest('hex'));
  assert.equal(result.files[0].authority, 'unverified'); assert.equal(result.files[0].recordContentInspected, false);
  assert.ok(!JSON.stringify(result).includes('private content'));
  await assert.rejects(() => inventoryEvidenceArtifacts({ root, directories: ['../'] }), /OUTSIDE_PROJECT/);
  await assert.rejects(() => inventoryEvidenceArtifacts({ root, directories: ['data'], maxFiles: 1 }), /SCAN_LIMIT/);
 } finally { await rm(root, { recursive: true, force: true }); }
});
