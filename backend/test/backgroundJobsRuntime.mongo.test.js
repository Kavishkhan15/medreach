import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { BackgroundJob } from "../src/models/BackgroundJob.js";
import { WorkerHeartbeat } from "../src/models/WorkerHeartbeat.js";
import { createWorkerRuntime, verifyWorkerIndexes } from "../src/services/workerRuntime.js";

const uri = process.env.MEDREACH_BACKGROUND_TEST_MONGO_URI;
const safeUri = uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):27017\/medreach_background_jobs_test$/.test(uri);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test("independent runtimes coordinate through MongoDB and publish health", { skip: !safeUri, timeout: 30000 }, async (t) => {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  assert.equal(mongoose.connection.name, "medreach_background_jobs_test");
  await Promise.all([BackgroundJob, WorkerHeartbeat].map((Model) => Model.deleteMany({})));
  await Promise.all([BackgroundJob, WorkerHeartbeat].map((Model) => Model.createIndexes()));
  const logger = { error: () => {} };
  try {
    await t.test("workers renew live leases and cannot duplicate another instance's task", async () => {
      let entered, release, calls = 0;
      const didEnter = new Promise((resolve) => { entered = resolve; });
      const gate = new Promise((resolve) => { release = resolve; });
      const tasks = [{ type: "runtime.test", intervalMs: 60000, handler: async ({ assertLease }) => {
        calls++; entered(); await gate; await assertLease(); return { processed: 1 };
      } }];
      const first = createWorkerRuntime({ role: "recovery", tasks, workerId: "runtime-a", leaseMs: 1000, pollMs: 10000, heartbeatMs: 100, logger });
      const second = createWorkerRuntime({ role: "recovery", tasks, workerId: "runtime-b", leaseMs: 1000, pollMs: 10000, heartbeatMs: 100, logger });
      try {
        await first.start(); await didEnter;
        await delay(1200);
        await second.start(); await second.tick();
        assert.equal(calls, 1);
        const live = await BackgroundJob.findOne({ type: "runtime.test" });
        assert.equal(live.status, "running");
        assert.equal(live.attempts, 1);
        assert.ok(live.leaseUntil > new Date());
        assert.equal((await WorkerHeartbeat.findOne({ workerId: "runtime-a" })).status, "running");
      } finally { release(); await Promise.all([first.stop(), second.stop()]); }
      assert.equal((await BackgroundJob.findOne({ type: "runtime.test" })).status, "completed");
      assert.equal((await WorkerHeartbeat.findOne({ workerId: "runtime-a" })).status, "stopped");
    });
    await t.test("cooperative handler deadlines fail safely and persist retry state", async () => {
      let entered;
      const didEnter = new Promise((resolve) => { entered = resolve; });
      const runtime = createWorkerRuntime({ role: "expiry", workerId: "deadline", maxHandlerMs: 50, pollMs: 10000, logger,
        tasks: [{ type: "runtime.deadline", intervalMs: 60000, handler: async ({ signal }) => {
          entered(); await new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
        } }] });
      try { await runtime.start(); await didEnter; await delay(100); }
      finally { await runtime.stop(); }
      const job = await BackgroundJob.findOne({ type: "runtime.deadline" });
      assert.equal(job.status, "queued");
      assert.equal(job.errorCode, "JOB_HANDLER_TIMEOUT");
      assert.equal(job.attempts, 1);
      assert.ok((await WorkerHeartbeat.findOne({ workerId: "deadline" })).lastFailureAt);
    });
    await t.test("a delayed previous renewal cannot abort the next job", async () => {
      const originalUpdateOne = BackgroundJob.updateOne;
      let renewalEntered, releaseRenewal, firstEntered, secondEntered, releaseSecond;
      const renewalStarted = new Promise((resolve) => { renewalEntered = resolve; });
      const delayedRenewal = new Promise((resolve) => { releaseRenewal = resolve; });
      const firstStarted = new Promise((resolve) => { firstEntered = resolve; });
      const secondStarted = new Promise((resolve) => { secondEntered = resolve; });
      const secondGate = new Promise((resolve) => { releaseSecond = resolve; });
      let calls = 0, secondSignal, intercepted = false;
      BackgroundJob.updateOne = function (filter, update, ...args) {
        if (filter.owner === "late-renewal" && update.$set?.leaseUntil && !intercepted) {
          intercepted = true; renewalEntered();
          return delayedRenewal.then(() => ({ matchedCount: 0, modifiedCount: 0 }));
        }
        return originalUpdateOne.call(this, filter, update, ...args);
      };
      const runtime = createWorkerRuntime({ role: "recovery", workerId: "late-renewal", leaseMs: 1000, pollMs: 10000, logger,
        tasks: [{ type: "runtime.delayed-renewal", intervalMs: 60000, handler: async ({ signal }) => {
          calls++;
          if (calls === 1) { firstEntered(); await renewalStarted; }
          else { secondSignal = signal; secondEntered(); await secondGate; }
        } }] });
      try {
        await runtime.start(); await firstStarted; await renewalStarted;
        // Wait for the first handler's completion before claiming the next fixture.
        while ((await BackgroundJob.findOne({ type: "runtime.delayed-renewal" })).status === "running") await delay(10);
        await BackgroundJob.create({ key: "delayed-renewal-next", type: "runtime.delayed-renewal", runAt: new Date() });
        const next = runtime.tick(); await secondStarted;
        releaseRenewal(); await delay(20);
        assert.equal(secondSignal.aborted, false);
        releaseSecond(); await next;
        assert.equal((await WorkerHeartbeat.findOne({ workerId: "late-renewal" })).errorCode, null);
      } finally {
        releaseRenewal(); releaseSecond(); await runtime.stop(); BackgroundJob.updateOne = originalUpdateOne;
      }
    });
    await t.test("missing unique indexes block worker startup without creating indexes", async () => {
      await WorkerHeartbeat.collection.dropIndex("workerId_1");
      await assert.rejects(() => verifyWorkerIndexes(), (error) => error.code === "WORKER_INDEX_MISSING");
      assert.equal((await WorkerHeartbeat.collection.indexes()).some((index) => index.name === "workerId_1"), false);
      await WorkerHeartbeat.createIndexes();
    });
  } finally {
    await Promise.all([BackgroundJob, WorkerHeartbeat].map((Model) => Model.deleteMany({})));
    await mongoose.disconnect();
  }
});
