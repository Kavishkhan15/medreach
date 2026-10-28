import { randomUUID } from "node:crypto";
import { BackgroundJob } from "../models/BackgroundJob.js";

const bounded = (value, fallback, min, max) => Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
const safeCode = (error) => /^[A-Z0-9_]{1,80}$/.test(error?.code || "") ? error.code : "BACKGROUND_JOB_FAILED";
export function jobLeaseFilter(job, now = new Date()) {
  return { _id: job._id, status: "running", owner: job.owner, leaseToken: job.leaseToken, leaseUntil: { $gt: now } };
}
export async function enqueueJob({ key, type, payload = {}, runAt = new Date(), maxAttempts = 5 }) {
  if (typeof key !== "string" || !key.length || key.length > 240 || typeof type !== "string" || !/^[a-z][a-z0-9_.-]{0,79}$/.test(type)) throw new TypeError("Invalid background job identity");
  if (!(runAt instanceof Date) || !Number.isFinite(runAt.getTime())) throw new TypeError("Invalid background job schedule");
  let job;
  try {
    job = await BackgroundJob.findOneAndUpdate({ key }, { $setOnInsert: { type, payload, runAt, status: "queued", attempts: 0,
      maxAttempts: bounded(maxAttempts, 5, 1, 20) } }, { upsert: true, new: true, runValidators: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    job = await BackgroundJob.findOne({ key });
    if (!job) throw error;
  }
  if (job.type !== type) throw new Error("JOB_KEY_TYPE_CONFLICT");
  return job;
}
export async function claimJob({ types, workerId, leaseMs = 60000, now = new Date() }) {
  if (!Array.isArray(types) || !types.length || !workerId) throw new TypeError("Worker identity and job types are required");
  // A process dying on its final attempt must not leave a permanently running job.
  await BackgroundJob.updateMany({ type: { $in: types }, status: "running", leaseUntil: { $lte: now }, $expr: { $gte: ["$attempts", "$maxAttempts"] } },
    { $set: { status: "exhausted", exhaustedAt: now, errorCode: "LEASE_EXPIRED_RETRY_EXHAUSTED" }, $unset: { owner: 1, leaseToken: 1, leaseUntil: 1 } });
  return BackgroundJob.findOneAndUpdate({ type: { $in: types }, runAt: { $lte: now }, $expr: { $lt: ["$attempts", "$maxAttempts"] },
    $or: [{ status: "queued" }, { status: "running", leaseUntil: { $lte: now } }] },
  { $set: { status: "running", owner: workerId, leaseToken: randomUUID(), leaseUntil: new Date(now.getTime() + bounded(leaseMs, 60000, 1000, 300000)),
    heartbeatAt: now, startedAt: now }, $inc: { attempts: 1 }, $unset: { errorCode: 1 } },
  { new: true, sort: { runAt: 1, _id: 1 } }).select("+leaseToken");
}
export async function renewJobLease(job, { now = new Date(), leaseMs = 60000 } = {}) {
  const leaseUntil = new Date(now.getTime() + bounded(leaseMs, 60000, 1000, 300000));
  const result = await BackgroundJob.updateOne(jobLeaseFilter(job, now), { $set: { leaseUntil, heartbeatAt: now } });
  if (result.matchedCount) { job.leaseUntil = leaseUntil; return true; }
  return false;
}
export async function assertJobLease(job, now = new Date()) {
  if (!await BackgroundJob.exists(jobLeaseFilter(job, now))) throw Object.assign(new Error("Background job lease lost"), { code: "JOB_LEASE_LOST" });
}
export async function completeJob(job, { now = new Date(), result = {} } = {}) {
  const updated = await BackgroundJob.updateOne(jobLeaseFilter(job, now), { $set: { status: "completed", completedAt: now, result },
    $unset: { owner: 1, leaseToken: 1, leaseUntil: 1, errorCode: 1 } });
  return updated.modifiedCount === 1;
}
export async function failJob(job, error, { now = new Date(), baseBackoffMs = 1000 } = {}) {
  const exhausted = job.attempts >= job.maxAttempts;
  const delayMs = Math.min(300000, bounded(baseBackoffMs, 1000, 100, 60000) * 2 ** Math.max(0, job.attempts - 1));
  const updated = await BackgroundJob.updateOne(jobLeaseFilter(job, now), { $set: { status: exhausted ? "exhausted" : "queued", errorCode: safeCode(error),
    ...(exhausted ? { exhaustedAt: now } : { runAt: new Date(now.getTime() + delayMs) }) }, $unset: { owner: 1, leaseToken: 1, leaseUntil: 1 } });
  return updated.modifiedCount === 1;
}
// Called only by an authorised operational recovery workflow after checking the
// handler's idempotency. Retrying never changes its semantic key or payload.
export async function retryExhaustedJob(id, { now = new Date(), reason, actorId } = {}) {
  if (typeof reason !== "string" || !reason.trim() || reason.length > 200) throw new TypeError("A recovery reason is required");
  const job = await BackgroundJob.findOne({ _id: id, status: "exhausted" }).select("attempts");
  if (!job) return false;
  const result = await BackgroundJob.updateOne({ _id: id, status: "exhausted", attempts: job.attempts }, {
    $set: { status: "queued", attempts: 0, runAt: now }, $unset: { errorCode: 1, exhaustedAt: 1 },
    $push: { retryHistory: { $each: [{ at: now, ...(actorId ? { actor: actorId } : {}), reason: reason.trim(), previousAttempts: job.attempts }], $slice: -20 } },
  });
  return result.modifiedCount === 1;
}
export async function getJobStatus(id) {
  return BackgroundJob.findById(id).select("-payload -retryHistory").lean();
}
