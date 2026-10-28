import test from 'node:test';
import assert from 'node:assert/strict';
import { guardedBackupFixtureUri } from '../scripts/rehearseLocalBackup.js';
test('backup rehearsal refuses application databases and remote or ambiguous targets', () => {
 assert.equal(guardedBackupFixtureUri(), 'mongodb://127.0.0.1:27017/medreach_backup_fixture_test');
 for (const uri of ['mongodb://127.0.0.1:27017/medreach', 'mongodb://remote.invalid:27017/medreach_backup_fixture_test',
  'mongodb://localhost:27017/medreach_backup_fixture_test', 'mongodb://127.0.0.1/medreach_backup_fixture_test',
  'mongodb://user:pass@127.0.0.1:27017/medreach_backup_fixture_test', 'mongodb://127.0.0.1:27017/medreach_backup_fixture_test?dbName=medreach']) assert.throws(() => guardedBackupFixtureUri(uri));
});
