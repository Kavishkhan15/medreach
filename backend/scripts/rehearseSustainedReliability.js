/** Finite single-host failure rehearsal. Never stops MongoDB or targets application data. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { readdir, open, unlink, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { isolatedProcessEnvironment, guardedTestUri } from './verifyBackendProcesses.js';
import { guardedSustainedUri, SUSTAINED_DATABASE, sustainedSeconds, interruptibleMongoProxy } from './sustainedReliabilitySupport.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check, message, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      if (await check()) return;
    } catch {}
    await pause(100);
  }
  throw Error(message);
}
async function freePort(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise(resolve => server.close(resolve));
}
export async function rehearseSustainedReliability({
  durationSeconds = sustainedSeconds(process.env.MEDREACH_SUSTAINED_SECONDS),
  outputDirectory = process.env.MEDREACH_SUSTAINED_REPORT_DIRECTORY || '/tmp/medreach-sustained-reliability'
} = {}) {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Native Node24+ required');
  durationSeconds = sustainedSeconds(durationSeconds);
  const uri = guardedSustainedUri(process.env.MEDREACH_SUSTAINED_MONGO_URI);
  const lockPath = '/tmp/medreach-sustained-reliability.lock';
  const lock = await open(lockPath, 'wx');
  const owner = randomUUID(),
    children = [];
  let mongoose,
    proxy,
    ownsDatabase = false,
    failure;
  const ports = [4421, 4422];
  const report = {
    startedAt: new Date(),
    database: SUSTAINED_DATABASE,
    synthetic: true,
    durationSeconds,
    checks: {},
    measurements: {},
    limitations: ['Single-host finite rehearsal, not a hosted capacity or clinical guarantee', 'DB interruption affects only an owned TCP proxy; shared MongoDB stays running', 'Worker effect is an idempotent local journal, not SMTP or remote delivery', 'No external messages, production writes, schedulers or deployment']
  };
  const env = isolatedProcessEnvironment(process.env, guardedTestUri());
  function start(entry, overrides = {}) {
    const child = spawn(process.execPath, [entry], {
      cwd: root,
      env: {
        ...env,
        ...overrides
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.signals = {
      effect: false
    };
    child.stdout.on('data', chunk => {
      if (String(chunk).includes('SYNTHETIC_EFFECT_COMMITTED')) child.signals.effect = true;
    });
    child.stderr.on('data', () => {});
    child.on('error', () => {});
    children.push(child);
    return child;
  }
  async function stop(child) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    const done = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    try {
      await done;
    } finally {
      clearTimeout(timer);
    }
  }
  const request = (port, path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
    ...options,
    signal: AbortSignal.timeout(4000)
  });
  try {
    await Promise.all(ports.map(freePort));
    Object.assign(process.env, env, {
      NODE_ENV: 'test',
      MONGODB_URI: uri,
      MONGO_URI: uri
    });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(uri, {
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 2000
    });
    assert.equal(mongoose.connection.name, SUSTAINED_DATABASE);
    assert.equal((await mongoose.connection.db.listCollections().toArray()).length, 0, 'Refusing nonempty database');
    await mongoose.connection.db.collection('_sustained_owner').insertOne({
      _id: owner
    });
    ownsDatabase = true;
    for (const name of await readdir(resolve(root, 'src/models'))) if (name.endsWith('.js')) await import(pathToFileURL(resolve(root, 'src/models', name)));
    await import('../src/services/sharedRateLimitStore.js');
    for (const Model of Object.values(mongoose.models)) await Model.createIndexes();
    const {
      Hospital,
      AvailabilityObservation,
      HospitalFieldClaim,
      DataSource,
      User,
      ProviderMembership,
      BackgroundJob,
      ResourceInventory
    } = mongoose.models;
    const now = new Date(),
      hospitals = Array.from({
        length: 120
      }, (_, i) => ({
        _id: new mongoose.Types.ObjectId(),
        name: `Synthetic sustained hospital ${String(i).padStart(3, '0')}`,
        slug: `synthetic-sustained-${i}`,
        approvalStatus: 'approved',
        archivedAt: null,
        location: {
          type: 'Point',
          coordinates: [72.8, 19.1]
        }
      }));
    await Hospital.collection.insertMany(hospitals);
    const source = new mongoose.Types.ObjectId();
    await DataSource.collection.insertOne({
      _id: source,
      name: 'Synthetic source',
      type: 'manual_verification',
      url: 'https://example.test'
    });
    const reviewHistory = Array.from({
      length: 100
    }, () => ({
      note: 'Synthetic historical review',
      at: now
    }));
    await HospitalFieldClaim.collection.insertMany(hospitals.map(h => ({
      hospital: h._id,
      field: 'phone',
      source,
      value: '02212345678',
      verificationStatus: 'verified',
      confidence: 'HIGH',
      observedAt: now,
      reviewHistory
    })));
    await AvailabilityObservation.collection.insertMany(hospitals.flatMap((h, i) => [...Array.from({
      length: 30
    }, (_, j) => ({
      hospital: h._id,
      facility: 'ICU',
      observedAt: new Date(+now - (j + 2) * 3600000),
      verificationStatus: 'verified',
      quantity: 15,
      status: 'available'
    })), {
      hospital: h._id,
      facility: 'ICU',
      observedAt: new Date(+now - (i % 2 ? 3600000 : 1000)),
      verificationStatus: 'verified',
      quantity: 0,
      status: 'unavailable'
    }]));
    const admins = await User.create([0, 1, 2].map(i => ({
      name: 'Synthetic provider',
      email: `sustained-${i}@example.test`,
      role: 'provider_admin',
      accountStatus: 'active'
    })));
    await ProviderMembership.create(admins.slice(0, 2).map(user => ({
      user: user._id,
      organization: hospitals[0]._id,
      kind: 'hospital',
      assignedBy: admins[0]._id
    })));
    proxy = await interruptibleMongoProxy(uri);
    const proxyUri = guardedSustainedUri(`mongodb://127.0.0.1:${proxy.port}/${SUSTAINED_DATABASE}?directConnection=true`, {
      proxy: true
    });
    Object.assign(env, {
      MONGODB_URI: proxyUri,
      MONGO_URI: proxyUri,
      MEDREACH_E2E_MONGO_URI: proxyUri,
      MEDREACH_SUSTAINED_PROXY_URI: proxyUri,
      MEDREACH_SUSTAINED_OWNER: owner,
      MONGO_SOCKET_TIMEOUT_MS: '1500',
      MONGO_SELECTION_TIMEOUT_MS: '1000'
    });
    let firstApi = start('src/server.js', {
      PORT: String(ports[0])
    });
    start('src/server.js', {
      PORT: String(ports[1])
    });
    await eventually(async () => {
      const responses = await Promise.all(ports.map(port => request(port, '/health/ready')));
      const statuses = responses.map(r => r.status);
      await Promise.all(responses.map(r => r.arrayBuffer()));
      return statuses.every(s => s === 200);
    }, 'API replicas did not become ready');
    report.checks.twoApisReady = true;
    const {
      signSessionToken
    } = await import('../test/helpers/session.js');
    const tokens = await Promise.all(admins.map(signSessionToken));
    const body = {
      capacity: 50,
      occupied: 10,
      blocked: 0,
      held: 0,
      observedAt: new Date().toISOString(),
      reportingMethod: 'provider_report',
      expectedVersion: 0,
      unit: 'beds'
    };
    const inventoryPath = `/api/inventory/hospital/${hospitals[0]._id}/general_beds`;
    const update = (port, token, input, path = inventoryPath) => request(port, path, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
    const simultaneous = await Promise.all([update(ports[0], tokens[0], body), update(ports[1], tokens[1], {
      ...body,
      occupied: 20
    })]);
    assert.deepEqual(simultaneous.map(r => r.status).sort(), [200, 409]);
    await Promise.all(simultaneous.map(r => r.arrayBuffer()));
    assert.equal((await ResourceInventory.findOne({
      organization: hospitals[0]._id
    })).version, 1);
    report.checks.concurrentInventory = {
      winners: 1,
      conflicts: 1
    };
    let response = await update(ports[0], tokens[0], body);
    assert.equal(response.status, 409);
    await response.arrayBuffer();
    response = await update(ports[0], tokens[2], {
      ...body,
      expectedVersion: 1
    });
    assert.equal(response.status, 403);
    await response.arrayBuffer();
    response = await update(ports[0], tokens[0], {
      ...body,
      expectedVersion: 1,
      occupied: -1
    });
    assert.equal(response.status, 400);
    await response.arrayBuffer();
    response = await update(ports[0], tokens[0], {
      ...body,
      expectedVersion: 0
    }, `/api/inventory/hospital/${hospitals[1]._id}/general_beds`);
    assert.equal(response.status, 403);
    await response.arrayBuffer();
    report.checks.staleInvalidAndForeignWritesDenied = true;
    const {
      enqueueJob
    } = await import('../src/services/backgroundJobs.js');
    await Promise.all(Array.from({
      length: 100
    }, (_, i) => enqueueJob({
      key: `sustained.effect.${String(i).padStart(3, '0')}`,
      type: 'rehearsal.effect',
      payload: {
        synthetic: true
      },
      maxAttempts: 3
    })));
    const doomed = start('scripts/sustainedFixtureWorker.js', {
      MEDREACH_SUSTAINED_CRASH: 'after_effect'
    });
    await eventually(() => doomed.signals.effect, 'Worker did not reach effect checkpoint');
    const crashedEffect = await mongoose.connection.db.collection('_sustained_effects').findOne({
      marker: owner
    });
    assert.ok(crashedEffect);
    const killed = once(doomed, 'exit');
    doomed.kill('SIGKILL');
    await killed;
    await pause(1200);
    start('scripts/sustainedFixtureWorker.js');
    start('scripts/sustainedFixtureWorker.js');
    await eventually(async () => (await BackgroundJob.countDocuments({
      type: 'rehearsal.effect',
      status: 'completed'
    })) === 100, 'Persisted backlog did not recover');
    assert.equal(await mongoose.connection.db.collection('_sustained_effects').countDocuments({
      marker: owner
    }), 100);
    assert.equal((await BackgroundJob.findOne({
      key: crashedEffect._id
    })).attempts, 2);
    report.checks.workerCrashAndBacklog = {
      signal: 'SIGKILL',
      checkpoint: 'after local effect, before completion',
      jobs: 100,
      committedEffects: 100,
      reclaimedJobAttempts: 2
    };
    let phase = 'healthy',
      running = true;
    const samples = [];
    const startAt = performance.now();
    const deadline = startAt + durationSeconds * 1000;
    let loadFailure;
    const load = Promise.all(Array.from({
      length: 6
    }, (_, i) => (async () => {
      while (running && performance.now() < deadline) {
        const began = performance.now(),
          startedPhase = phase;
        let status = 0;
        try {
          const result = await request(ports[i % 2], '/api/hospitals?limit=20');
          status = result.status;
          const data = await result.json();
          if (status === 200) {
            assert.equal(data.total, 120);
            assert.equal(data.data.length, 20);
            const counts = data.data.flatMap(h => h.facilities.filter(f => f.facility === 'ICU').map(f => f.count));
            assert.ok(counts.includes(0) && counts.includes(null));
          }
        } catch (error) {
          if (error.name === 'AssertionError') throw error;
        }
        samples.push({
          phase: startedPhase,
          completedPhase: phase,
          status,
          ms: performance.now() - began
        });
        await pause(80);
      }
    })())).catch(error => {
      loadFailure = error;
      running = false;
    });
    await pause(5000);
    phase = 'database_interruption';
    proxy.interrupt();
    const outage = await request(ports[0], '/health/ready');
    assert.equal(outage.status, 503);
    await outage.arrayBuffer();
    const denied = await update(ports[1], tokens[0], {
      ...body,
      expectedVersion: 1,
      observedAt: new Date().toISOString()
    });
    assert.equal(denied.status, 503);
    await denied.arrayBuffer();
    await pause(1500);
    phase = 'recovering';
    proxy.resume();
    await eventually(async () => {
      const responses = await Promise.all(ports.map(p => request(p, '/health/ready')));
      const statuses = responses.map(r => r.status);
      await Promise.all(responses.map(r => r.arrayBuffer()));
      return statuses.every(s => s === 200);
    }, 'APIs did not recover after DB proxy resumed', 20000);
    const databaseRecoveredAt = performance.now();
    phase = 'database_recovered';
    await pause(2000);
    phase = 'api_restart';
    await stop(firstApi);
    const surviving = await request(ports[1], '/health/ready');
    assert.equal(surviving.status, 200);
    await surviving.arrayBuffer();
    firstApi = start('src/server.js', {
      PORT: String(ports[0])
    });
    await eventually(async () => {
      const ready = await request(ports[0], '/health/ready');
      const status = ready.status;
      await ready.arrayBuffer();
      return status === 200;
    }, 'Restarted API did not become ready');
    phase = 'recovered';
    const recoveredAt = performance.now();
    await load;
    running = false;
    if (loadFailure) throw loadFailure;
    assert.equal((await ResourceInventory.findOne({
      organization: hospitals[0]._id
    })).version, 1, 'Failed mutation must not silently commit');
    const successful = samples.filter(r => r.status === 200),
      errors = samples.filter(r => r.status !== 200),
      recovered = samples.filter(r => r.phase === 'recovered');
    assert.ok(recovered.length > 0 && recovered.every(r => r.status === 200));
    assert.ok(errors.length > 0);
    assert.ok(samples.filter(r => r.phase === 'healthy' && r.completedPhase === 'healthy').every(r => r.status === 200));
    const percentile = (rows, p) => {
      const values = rows.map(r => r.ms).sort((a, b) => a - b);
      return +values[Math.min(values.length - 1, Math.floor(values.length * p))].toFixed(2);
    };
    report.checks.databaseInterruption = {
      readiness503: true,
      authenticatedMutation503: true,
      failedMutationDidNotCommit: true,
      replicasRecovered: true,
      recoveryFromLoadStartMs: Math.round(databaseRecoveredAt - startAt)
    };
    report.checks.apiRestart = {
      survivingReplicaReady: true,
      restartedReplicaReady: true,
      recoveryFromLoadStartMs: Math.round(recoveredAt - startAt)
    };
    report.measurements = {
      elapsedMs: Math.round(performance.now() - startAt),
      concurrency: 6,
      totalRequests: samples.length,
      successfulRequests: successful.length,
      expectedInterruptionFailures: errors.length,
      successP50Ms: percentile(successful, .5),
      successP95Ms: percentile(successful, .95),
      successP99Ms: percentile(successful, .99),
      phaseCounts: Object.fromEntries(['healthy', 'database_interruption', 'recovering', 'database_recovered', 'api_restart', 'recovered'].map(key => [key, samples.filter(row => row.phase === key).length])),
      postRecoveryRequests: recovered.length
    };
    report.fixtures = {
      hospitals: 120,
      availabilityObservations: 3720,
      reviewHistoryEntriesPerClaim: 100
    };
    report.ok = true;
    report.finishedAt = new Date();
  } catch (error) {
    failure = error;
  } finally {
    const stopped = await Promise.allSettled(children.map(stop));
    try {
      await proxy?.close();
      if (ownsDatabase && mongoose?.connection.readyState === 1) {
        assert.equal(mongoose.connection.name, SUSTAINED_DATABASE);
        assert.ok(await mongoose.connection.db.collection('_sustained_owner').findOne({
          _id: owner
        }));
        await mongoose.connection.dropDatabase();
        report.cleanedUpOwnedDatabase = true;
      }
    } catch (error) {
      failure ||= error;
    } finally {
      await mongoose?.disconnect();
      await lock.close();
      await unlink(lockPath);
    }
    if (stopped.some(r => r.status === 'rejected')) failure ||= Error('Owned child cleanup failed');
  }
  if (failure) throw failure;
  const directory = resolve(outputDirectory);
  await mkdir(directory, {
    recursive: true,
    mode: 0o700
  });
  const reportPath = resolve(directory, `sustained-rehearsal-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600
  });
  return {
    reportPath,
    ...report
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await rehearseSustainedReliability(), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      event: 'sustained_rehearsal_failed',
      message: error.message
    }));
    process.exitCode = 1;
  }
}
