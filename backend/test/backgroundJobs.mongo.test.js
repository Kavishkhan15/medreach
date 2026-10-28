import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { BackgroundJob } from "../src/models/BackgroundJob.js";
import { enqueueJob, claimJob, renewJobLease, completeJob, failJob, retryExhaustedJob, getJobStatus } from "../src/services/backgroundJobs.js";

const uri = process.env.MEDREACH_BACKGROUND_TEST_MONGO_URI;
const safeUri = uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):27017\/medreach_background_jobs_test$/.test(uri);
test("persisted background jobs remain fenced, bounded and recoverable across workers", { skip: !safeUri, timeout: 30000 }, async (t) => {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  assert.equal(mongoose.connection.name, "medreach_background_jobs_test");
  await BackgroundJob.deleteMany({});
  await BackgroundJob.createIndexes();
  const now = new Date("2026-01-01T00:00:00Z");
  try {
    await t.test("semantic keys deduplicate concurrent enqueues without replacing payload", async () => {
      const jobs = await Promise.all(Array.from({ length: 8 }, () => enqueueJob({ key: "expiry:slot:1", type: "expiry", payload: { batch: 1 }, runAt: now })));
      assert.equal(new Set(jobs.map((row) => String(row._id))).size, 1);
      const original = await enqueueJob({ key: "expiry:slot:1", type: "expiry", payload: { batch: 2 }, runAt: now });
      assert.equal(original.payload.batch, 1);
      await assert.rejects(() => enqueueJob({ key: "expiry:slot:1", type: "recovery", runAt: now }), /JOB_KEY_TYPE_CONFLICT/);
    });
    await t.test("two workers cannot claim one live job and stale owners cannot complete", async () => {
      const claims = await Promise.all([claimJob({ types: ["expiry"], workerId: "a", now, leaseMs: 1000 }), claimJob({ types: ["expiry"], workerId: "b", now, leaseMs: 1000 })]);
      assert.equal(claims.filter(Boolean).length, 1);
      const first = claims.find(Boolean);
      assert.equal(first.attempts, 1);
      assert.equal(await renewJobLease(first, { now: new Date(now.getTime() + 500), leaseMs: 1000 }), true);
      assert.equal(await claimJob({ types: ["expiry"], workerId: "c", now: new Date(now.getTime() + 1001), leaseMs: 1000 }), null);
      const reclaimed = await claimJob({ types: ["expiry"], workerId: "c", now: new Date(now.getTime() + 1501), leaseMs: 1000 });
      assert.equal(reclaimed.attempts, 2);
      assert.notEqual(reclaimed.leaseToken, first.leaseToken);
      assert.equal(await completeJob(first, { now: new Date(now.getTime() + 1600) }), false);
      assert.equal(await completeJob(reclaimed, { now: new Date(now.getTime() + 1600), result: { processed: 1 } }), true);
      assert.equal((await getJobStatus(reclaimed._id)).status, "completed");
      assert.equal((await getJobStatus(reclaimed._id)).leaseToken, undefined);
    });
    await t.test("safe failures use backoff and exhaust the bounded retry budget", async () => {
      await enqueueJob({ key: "recovery:bounded", type: "recovery", runAt: now, maxAttempts: 2 });
      const first = await claimJob({ types: ["recovery"], workerId: "a", now, leaseMs: 1000 });
      assert.equal(await failJob(first, Object.assign(new Error("secret should not persist"), { code: "ECONNRESET" }), { now, baseBackoffMs: 100 }), true);
      assert.equal(await claimJob({ types: ["recovery"], workerId: "a", now, leaseMs: 1000 }), null);
      const second = await claimJob({ types: ["recovery"], workerId: "b", now: new Date(now.getTime() + 100), leaseMs: 1000 });
      assert.equal(await failJob(second, new Error("credentials hidden"), { now: new Date(now.getTime() + 100) }), true);
      const failed = await getJobStatus(second._id);
      assert.equal(failed.status, "exhausted");
      assert.equal(failed.errorCode, "BACKGROUND_JOB_FAILED");
      assert.equal(JSON.stringify(failed).includes("credentials hidden"), false);
      assert.equal(await claimJob({ types: ["recovery"], workerId: "c", now: new Date(now.getTime() + 999999) }), null);
      const actorId = new mongoose.Types.ObjectId();
      assert.equal(await retryExhaustedJob(second._id, { now, reason: "Operator verified retry safety", actorId }), true);
      const retried = await BackgroundJob.findById(second._id);
      assert.equal(String(retried.retryHistory.at(-1).actor), String(actorId));
      assert.equal(retried.retryHistory.at(-1).reason, "Operator verified retry safety");
      assert.ok(await claimJob({ types: ["recovery"], workerId: "c", now }));
    });
    await t.test("crashes on the final attempt become observable exhausted jobs", async () => {
      await enqueueJob({ key: "crash:last", type: "crash", runAt: now, maxAttempts: 1 });
      const job = await claimJob({ types: ["crash"], workerId: "dead", now, leaseMs: 1000 });
      assert.ok(job);
      assert.equal(await claimJob({ types: ["crash"], workerId: "replacement", now: new Date(now.getTime() + 1001) }), null);
      assert.equal((await getJobStatus(job._id)).status, "exhausted");
      assert.equal((await getJobStatus(job._id)).errorCode, "LEASE_EXPIRED_RETRY_EXHAUSTED");
    });
  } finally {
    await BackgroundJob.deleteMany({});
    await mongoose.disconnect();
  }
});
