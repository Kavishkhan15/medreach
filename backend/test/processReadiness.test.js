import test from 'node:test';
import assert from 'node:assert/strict';
import { guardedTestUri, TEST_DATABASE } from '../scripts/verifyBackendProcesses.js';

test('process readiness URI guard permits only the dedicated numeric loopback database', () => {
  assert.equal(guardedTestUri(), `mongodb://127.0.0.1:27017/${TEST_DATABASE}`);
  assert.equal(guardedTestUri(`mongodb://[::1]:27017/${TEST_DATABASE}`), `mongodb://[::1]:27017/${TEST_DATABASE}`);
  for (const uri of ['mongodb://127.0.0.1:27017/medreach', 'mongodb://127.0.0.1:27017/medreach_test',
    `mongodb://example.com/${TEST_DATABASE}`, `mongodb://localhost/${TEST_DATABASE}`,
    `mongodb+srv://127.0.0.1/${TEST_DATABASE}`, `mongodb://user:pass@127.0.0.1/${TEST_DATABASE}`,
    `mongodb://127.0.0.1/${TEST_DATABASE}?dbName=medreach`, `mongodb://127.0.0.1/${TEST_DATABASE}#unsafe`,
    `mongodb://127.0.0.1,example.com/${TEST_DATABASE}`]) assert.throws(() => guardedTestUri(uri));
});

test('isolated staging removes inherited provider credentials and alert endpoints', async () => {
  const { isolatedProcessEnvironment } = await import('../scripts/verifyBackendProcesses.js');
  const inherited = { PATH: '/usr/bin', RESEND_API_KEY: 'sensitive', OPERATIONS_WEBHOOK_URL: 'https://remote.invalid',
    OTHER_SECRET: 'sensitive', MONGO_URI: 'mongodb://remote.invalid/production', EMAIL_ENABLED: 'true', GEMINI_ENABLED: 'true' };
  const env = isolatedProcessEnvironment(inherited);
  assert.equal(env.PATH, '/usr/bin'); assert.equal(env.OTHER_SECRET, undefined);
  assert.equal(env.MONGO_URI, `mongodb://127.0.0.1:27017/${TEST_DATABASE}`);
  for (const key of ['RESEND_API_KEY', 'OPERATIONS_WEBHOOK_URL', 'OPERATIONS_WEBHOOK_SECRET', 'AI_API_KEY']) assert.equal(env[key], '');
  assert.equal(env.EMAIL_ENABLED, 'false'); assert.equal(env.GEMINI_ENABLED, 'false');
  assert.equal(env.BACKEND_METRICS_ENABLED, 'true');
  assert.ok(env.JWT_SECRET.length >= 64);
  assert.notEqual(env.JWT_SECRET, isolatedProcessEnvironment(inherited).JWT_SECRET);
});
