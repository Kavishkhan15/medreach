import { verifyApiIndexes } from "./productionIndexes.js";
import { randomUUID } from "node:crypto";
import { WorkerHeartbeat } from "../models/WorkerHeartbeat.js";
import { BackgroundJob } from "../models/BackgroundJob.js";
import { enqueueJob, claimJob, renewJobLease, assertJobLease, completeJob, failJob } from "./backgroundJobs.js";
import { connectDB, disconnectDB, enableDatabaseTelemetry } from "../config/db.js";
import { setEmailQueueEnabled } from "./emailService.js";

export async function verifyWorkerIndexes() {
  for (const [Model, key] of [[BackgroundJob, "key"], [WorkerHeartbeat, "workerId"]]) {
    const indexes = await Model.collection.indexes().catch((error) => {
      if (error.code === 26) return [];
      throw error;
    });
    if (!indexes.some((index) => index.unique && !index.partialFilterExpression && !index.sparse
      && index.key[key] === 1 && Object.keys(index.key).length === 1)) {
      throw Object.assign(new Error("Required worker indexes are missing; run the reviewed local migration before starting workers"), { code: "WORKER_INDEX_MISSING" });
    }
  }
}

export function createWorkerRuntime({ role, tasks, workerId = `${role}:${randomUUID()}`, pollMs = 1000,
  leaseMs = 60000, heartbeatMs = 10000, maxHandlerMs = 180000, logger = console }) {
  if (!["notification", "expiry", "recovery"].includes(role) || !tasks?.length || tasks.some((task) => !task.type || typeof task.handler !== "function" || task.intervalMs < 1000)) throw new TypeError("Invalid worker task configuration");
  let timer, heartbeatTimer, pending, current, leaseTimer, deadlineTimer;
  let stopping = false;
  const state = { status: "idle", lastSuccessAt: null, lastFailureAt: null, errorCode: null };
  const heartbeat = () => WorkerHeartbeat.updateOne({ workerId }, { $set: { role, heartbeatAt: new Date(),
    status: stopping ? "stopping" : state.status, job: current?._id || null, lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt, errorCode: state.errorCode } }, { upsert: true });
  const logFailure = (error) => {
    state.lastFailureAt = new Date();
    state.errorCode = /^[A-Z0-9_]{1,80}$/.test(error?.code || "") ? error.code : "WORKER_TASK_FAILED";
    state.status = "degraded";
    logger.error(JSON.stringify({ event: "worker_failure", role, workerId, code: state.errorCode }));
  };
  async function execute(job) {
    current = job;
    state.status = "running";
    const controller = new AbortController();
    let renewing = false, finished = false;
    // Capture this execution: a delayed renewal must never abort a later job.
    const loseLease = (error) => { if (!finished) { controller.abort(error); logFailure(error); } };
    leaseTimer = setInterval(async () => {
      if (renewing || controller.signal.aborted) return;
      renewing = true;
      try {
        if (!await renewJobLease(job, { leaseMs })) loseLease(Object.assign(new Error("Job lease lost"), { code: "JOB_LEASE_LOST" }));
      } catch (error) { loseLease(error); }
      finally { renewing = false; }
    }, Math.max(250, Math.floor(leaseMs / 3)));
    deadlineTimer = setTimeout(() => loseLease(Object.assign(new Error("Worker handler exceeded its deadline"), { code: "JOB_HANDLER_TIMEOUT" })), maxHandlerMs);
    const context = { signal: controller.signal, job, assertLease: async () => {
      controller.signal.throwIfAborted(); await assertJobLease(job);
    } };
    try {
      await heartbeat();
      const task = tasks.find((item) => item.type === job.type);
      await context.assertLease();
      const result = await task.handler(context);
      await context.assertLease();
      if (!await completeJob(job, { result: result || {} })) throw Object.assign(new Error("Job lease lost"), { code: "JOB_LEASE_LOST" });
      state.lastSuccessAt = new Date(); state.errorCode = null; state.status = "idle";
    } catch (error) {
      logFailure(error);
      await failJob(job, error).catch(logFailure);
    } finally {
      finished = true;
      clearInterval(leaseTimer); clearTimeout(deadlineTimer); current = null;
      await heartbeat().catch(logFailure);
    }
  }
  async function cycle() {
    if (stopping) return;
    const now = new Date();
    // Timers only request work; MongoDB owns identity, attempts and execution.
    for (const task of tasks) {
      const slot = Math.floor(now.getTime() / task.intervalMs);
      await enqueueJob({ key: `scheduled:${task.type}:${slot}`, type: task.type, runAt: now, maxAttempts: task.maxAttempts || 5 });
    }
    const job = await claimJob({ types: tasks.map((task) => task.type), workerId, leaseMs });
    if (job) await execute(job);
  }
  const tick = () => {
    if (pending || stopping) return pending;
    pending = cycle().catch(logFailure).finally(() => { pending = null; });
    return pending;
  };
  return { workerId, role, tick,
    async start() {
      if (timer) return;
      await verifyWorkerIndexes(); await heartbeat();
      timer = setInterval(tick, pollMs);
      heartbeatTimer = setInterval(() => { heartbeat().catch(logFailure); }, heartbeatMs);
      tick();
    },
    async stop() {
      stopping = true; clearInterval(timer); clearInterval(heartbeatTimer); timer = null;
      await heartbeat().catch(logFailure);
      if (pending) await pending;
      await WorkerHeartbeat.updateOne({ workerId }, { $set: { status: "stopped", heartbeatAt: new Date(), job: null } });
    },
  };
}

export async function startStandaloneWorker(role, tasks) {
  await connectDB();
  await verifyApiIndexes();
  enableDatabaseTelemetry();
  // Replayable messages are prepared as durable intents; the notification
  // task delivers them. This process does not depend on any API server.
  setEmailQueueEnabled(true);
  const runtime = createWorkerRuntime({ role, tasks });
  let shuttingDown;
  const shutdown = () => {
    if (shuttingDown) return shuttingDown;
    const deadline = setTimeout(() => { console.error(JSON.stringify({ event: "worker_shutdown_timeout", role })); process.exit(1); }, 30000);
    deadline.unref();
    shuttingDown = (async () => {
      try { await runtime.stop(); await disconnectDB(); clearTimeout(deadline); }
      catch { console.error(JSON.stringify({ event: "worker_shutdown_failed", role })); process.exitCode = 1; clearTimeout(deadline); }
    })();
    return shuttingDown;
  };
  process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown);
  try { await runtime.start(); }
  catch (error) { await shutdown(); throw error; }
  return { runtime, shutdown };
}
