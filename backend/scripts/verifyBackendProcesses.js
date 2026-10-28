/** Isolated, real-process readiness check. Never targets the application database. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readdir, open, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

export const TEST_DATABASE = 'medreach_process_readiness_test';
export function guardedTestUri(raw = `mongodb://127.0.0.1:27017/${TEST_DATABASE}`) {
  const url = new URL(raw);
  assert.equal(url.protocol, 'mongodb:', 'Only direct MongoDB loopback connections are allowed');
  assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname), 'Only numeric loopback is allowed');
  assert.equal(url.pathname, `/${TEST_DATABASE}`, 'Only the dedicated process test database is allowed');
  assert.ok(!url.username && !url.password && !url.search && !url.hash, 'Credentials and connection options are forbidden');
  return url.href;
}
export function isolatedProcessEnvironment(inherited = process.env, uri = guardedTestUri()) {
  return { PATH: inherited.PATH || '', NODE_ENV: 'production', EMAIL_ENABLED: 'false', BACKEND_METRICS_ENABLED: 'true',
    MONGODB_URI: guardedTestUri(uri), MONGO_URI: guardedTestUri(uri), MEDREACH_E2E_MONGO_URI: guardedTestUri(uri),
    JWT_SECRET: randomBytes(48).toString('hex'), EMAIL_PROVIDER: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '',
    GOOGLE_SMTP_USER: '', GOOGLE_APP_PASSWORD: '', GMAIL_USER: '', GMAIL_APP_PASSWORD: '', RESEND_API_KEY: '',
    RESEND_WEBHOOK_SECRET: '', EMAIL_ENVELOPE_KEY: '', EMAIL_ENVELOPE_PREVIOUS_KEY: '',
    OPERATIONS_WEBHOOK_URL: '', OPERATIONS_WEBHOOK_SECRET: '', AI_PROVIDER: 'rule_based', AI_API_KEY: '',
    GEMINI_ENABLED: 'false', GEMINI_API_KEY: '', ROUTING_PROVIDER: 'none', ROUTING_API_KEY: '', ROUTING_BASE_URL: '',
    TRUST_PROXY: 'false', MONGO_SELECTION_TIMEOUT_MS: '1000' };
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function available(port) {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); });
  await new Promise(resolve => server.close(resolve));
}
async function eventually(check, message, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await check()) return; await pause(200); }
  throw new Error(message);
}
export async function verifyBackendProcesses() {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Run with native Node 24 or newer');
  const uri = guardedTestUri(process.env.MEDREACH_PROCESS_TEST_URI);
  const children = [];
  const owner = randomUUID();
  const lockPath = '/tmp/medreach-process-readiness.lock';
  const lock = await open(lockPath, 'wx');
  let mongoose, ownsDatabase = false, failure;
  const report = { startedAt: new Date().toISOString(), node: process.version, database: TEST_DATABASE,
    apiPorts: [4411, 4412], syntheticHospitals: 36, checks: {}, measurements: [] };
  const childEnv = isolatedProcessEnvironment(process.env, uri);
  function start(entry, port, overrides = {}) {
    const child = spawn(process.execPath, [entry], { cwd: root, env: { ...childEnv, PORT: String(port ?? 4411), ...overrides }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', () => {});
    // Drain output without exposing secrets or patient data, even on failure.
    child.readinessSignals = { listening: false, startupFailed: false };
    child.stdout.on('data', chunk => { if (String(chunk).includes('API listening on')) child.readinessSignals.listening = true; });
    child.stderr.on('data', chunk => { if (String(chunk).includes('Failed to start')) child.readinessSignals.startupFailed = true; });
    children.push(child); return child;
  }
  async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  }
  async function request(port, path, options = {}) {
    return fetch(`http://127.0.0.1:${port}${path}`, { ...options, signal: AbortSignal.timeout(6000) });
  }
  try {
    await Promise.all(report.apiPorts.map(available));
    Object.assign(process.env, childEnv);
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
    assert.equal(mongoose.connection.name, TEST_DATABASE);
    assert.equal((await mongoose.connection.db.listCollections().toArray()).length, 0, 'Test database must be absent/empty; refusing to delete existing data');
    await mongoose.connection.db.collection('_process_readiness_owner').insertOne({ _id: owner });
    ownsDatabase = true;
    // Import schemas, then explicitly create indexes only inside this owned database.
    for (const name of await readdir(resolve(root, 'src/models'))) if (name.endsWith('.js')) await import(pathToFileURL(resolve(root, 'src/models', name)));
    await import('../src/services/sharedRateLimitStore.js');
    for (const Model of Object.values(mongoose.models)) await Model.createIndexes();
    const { Hospital, ResourceInventory, BackgroundJob, WorkerHeartbeat, BackendLatencyBucket } = mongoose.models;
    const hospitals = await Hospital.create(Array.from({ length: 36 }, (_, i) => ({ name: `Synthetic Process Hospital ${String(i).padStart(2, '0')}`,
      approvalStatus: 'approved', city: 'Synthetic City', locality: 'Process Test', location: { type: 'Point', coordinates: [72.8 + i / 1000, 19.1] } })));
    await ResourceInventory.create(hospitals.map(h => ({ kind: 'hospital', organization: h._id, resourceKey: 'beds', unit: 'beds',
      capacity: 10, available: 10, occupied: 0, blocked: 0, held: 0, version: 1, classification: 'demo', reportingMethod: 'demo_fixture', observedAt: new Date() })));
    let first = start('src/server.js', 4411);
    start('src/server.js', 4412);
    await eventually(async () => {
      try { return (await Promise.all(report.apiPorts.map(async p => (await request(p, '/health/ready')).status))).every(s => s === 200); } catch { return false; }
    }, 'Both API processes did not become ready');
    report.checks.twoApisReady = true;
    assert.equal(await WorkerHeartbeat.countDocuments(), 0, 'API processes must not start workers');
    report.checks.apiProcessesDoNotStartWorkers = true;
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      const response = await request(report.apiPorts[i % 2], '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@process-test.invalid', password: 'invalid-process-test-password' }) });
      statuses.push(response.status); await response.arrayBuffer();
    }
    assert.deepEqual(statuses, [...Array(10).fill(401), 429, 429]);
    report.checks.sharedLoginLimit = { allowedInvalidAttempts: 10, blockedAttempts: 2, statuses };
    const firstNotificationWorker = start('src/workers/notification.js'); start('src/workers/notification.js'); start('src/workers/expiry.js'); start('src/workers/recovery.js');
    const [{ notificationTasks }, { expiryTasks }, { recoveryTasks }] = await Promise.all([
      import('../src/workers/notification.js'), import('../src/workers/expiry.js'), import('../src/workers/recovery.js'),
    ]);
    const expectedTypes = [...new Set([...notificationTasks, ...expiryTasks, ...recoveryTasks].map(task => task.type))];
    await eventually(async () => {
      const rows = await WorkerHeartbeat.find().lean();
      const completed = await BackgroundJob.distinct('type', { status: 'completed' });
      return rows.filter(r => r.role === 'notification').length === 2 && rows.length === 4 && expectedTypes.every(t => completed.includes(t));
    }, 'Workers did not heartbeat and complete every scheduled task', 40000);
    const indexes = await Promise.all([BackgroundJob.collection.indexes(), WorkerHeartbeat.collection.indexes()]);
    for (const [i, key] of ['key', 'workerId'].entries()) assert.ok(indexes[i].some(index => index.unique && index.key[key] === 1 && Object.keys(index.key).length === 1));
    const jobs = await BackgroundJob.find().lean();
    assert.equal(new Set(jobs.map(j => j.key)).size, jobs.length);
    assert.ok(jobs.filter(j => j.status === 'completed').every(j => j.attempts === 1));
    assert.equal(jobs.filter(j => ['exhausted'].includes(j.status)).length, 0);
    report.checks.workerCoordination = { heartbeats: await WorkerHeartbeat.countDocuments(), completedTypes: expectedTypes,
      completedJobs: jobs.filter(j => j.status === 'completed').length, duplicateJobKeys: 0, completedJobsRequiringRetry: 0 };
    // Kill a worker without its shutdown handler, then verify a replacement joins.
    const previousWorkerIds = await WorkerHeartbeat.distinct('workerId');
    const killed = once(firstNotificationWorker, 'exit'); firstNotificationWorker.kill('SIGKILL'); await killed;
    start('src/workers/notification.js');
    await eventually(async () => (await WorkerHeartbeat.find({ role: 'notification', workerId: { $nin: previousWorkerIds } }).lean()).some(row => Date.now() - new Date(row.heartbeatAt).getTime() < 15000), 'Replacement notification worker did not heartbeat');
    report.checks.workerCrashAndReplacement = { signal: 'SIGKILL', newHeartbeatObserved: true, scope: 'empty queue; in-flight side effects are covered separately' };
    await stop(first);
    const survivor = await request(4412, '/api/hospitals'); assert.equal(survivor.status, 200); await survivor.arrayBuffer();
    first = start('src/server.js', 4411);
    await eventually(async () => { try { return (await request(4411, '/health/ready')).status === 200; } catch { return false; } }, 'Restarted API did not become ready');
    report.checks.apiRestartAndSurvivingReplica = true;
    for (const concurrency of [1, 10, 30]) {
      const durations = []; let cursor = 0, errors = 0;
      const began = performance.now();
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (cursor < 100) {
          const i = cursor++; const started = performance.now();
          try { const response = await request(report.apiPorts[i % 2], '/api/hospitals?limit=12');
            const body = await response.json(); if (response.status !== 200 || body.total !== 36 || body.data?.length !== 12) errors++;
          } catch { errors++; }
          durations.push(performance.now() - started);
        }
      }));
      const elapsedMs = performance.now() - began; durations.sort((a, b) => a - b);
      report.measurements.push({ concurrency, requests: 100, p50Ms: +durations[49].toFixed(2), p95Ms: +durations[94].toFixed(2),
        throughputPerSecond: +(100000 / elapsedMs).toFixed(2), errors });
      assert.equal(errors, 0, `Directory load errors at concurrency ${concurrency}`);
    }
    await eventually(async () => await BackendLatencyBucket.countDocuments({ kind: 'request' }) >= 2, 'API telemetry did not flush shared buckets');
    report.checks.sharedMetrics = {
      requestBuckets: await BackendLatencyBucket.countDocuments({ kind: 'request' }),
      databaseBuckets: await BackendLatencyBucket.countDocuments({ kind: 'database' }),
      poolBuckets: await BackendLatencyBucket.countDocuments({ kind: 'pool' }),
      source: 'opt-in production API/worker processes after reviewed fixture indexes',
    };
    assert.ok(report.checks.sharedMetrics.databaseBuckets > 0);
    assert.ok(report.checks.sharedMetrics.poolBuckets > 0);
    // A separate child fails configuration before making any database connection.
    const malformed = start('src/server.js', 0, { MONGODB_URI: 'invalid-process-test-uri', MONGO_URI: 'invalid-process-test-uri' });
    await eventually(async () => malformed.exitCode !== null, 'Malformed URI child failed to stop', 10000);
    assert.equal(malformed.exitCode, 1);
    assert.equal(malformed.readinessSignals.startupFailed, true);
    assert.equal(malformed.readinessSignals.listening, false);
    assert.equal((await request(4412, '/health/ready')).status, 200);
    report.checks.malformedDatabaseConfigurationFailsClosed = true;
    report.finishedAt = new Date().toISOString(); report.ok = true;
  } catch (error) {
    failure = error;
  } finally {
    const stopResults = await Promise.allSettled(children.map(stop));
    let cleanupError;
    try {
      if (ownsDatabase && mongoose?.connection.readyState === 1) {
        assert.equal(mongoose.connection.name, TEST_DATABASE);
        assert.ok(await mongoose.connection.db.collection('_process_readiness_owner').findOne({ _id: owner }), 'Ownership marker missing; refusing cleanup');
        await mongoose.connection.db.dropDatabase();
        report.cleanedUpOwnedDatabase = true;
      }
    } catch (error) { cleanupError = error; }
    finally {
      for (const cleanup of [() => mongoose?.disconnect(), () => lock.close(), () => unlink(lockPath)]) {
        try { await cleanup(); } catch (error) { cleanupError ||= error; }
      }
    }
    failure ||= cleanupError;
    if (!stopResults.every(r => r.status === 'fulfilled')) failure ||= new Error('Failed to stop an owned child process');
  }
  if (failure) throw failure;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await verifyBackendProcesses();
    if (process.env.MEDREACH_PROCESS_REPORT_PATH) await writeFile(process.env.MEDREACH_PROCESS_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { console.error(`Process verification failed: ${error.message}`); process.exitCode = 1; }
}
