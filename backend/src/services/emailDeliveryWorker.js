import { EmailDelivery } from "../models/EmailDelivery.js";
import { env } from "../config/env.js";
import { retryEmailDelivery, setEmailQueueEnabled, emailConfiguration, emailAttemptLimit } from "./emailService.js";

let timer, running;
export function flushQueuedEmails() {
  if (running) return running;
  running = deliverBatch().finally(() => { running = null; });
  return running;
}
export async function reconcileEmailDeliveryLeases({ limit = 50, now = new Date() } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invalid email reconciliation options");
  const expiredLease = { $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] };
  const rows = await EmailDelivery.find({ ...expiredLease, $and: [{ $or: [
    { status: "pending", attempts: { $gt: 0 } },
    { status: "failed", attempts: { $gte: emailAttemptLimit() }, exhaustedAt: { $exists: false } },
  ] }] }).sort({ lastAttemptAt: 1, _id: 1 }).limit(limit).select("_id status").lean();
  let uncertain = 0, exhausted = 0;
  for (const row of rows) {
    const result = await EmailDelivery.updateOne({ _id: row._id, status: row.status, ...expiredLease,
      ...(row.status === "pending" ? { attempts: { $gt: 0 } } : { attempts: { $gte: emailAttemptLimit() }, exhaustedAt: { $exists: false } }) },
    { $set: row.status === "pending" ? { status: "uncertain", lifecycleStatus: "uncertain", queued: false,
      errorCode: "DELIVERY_OUTCOME_UNKNOWN", lastError: "Check the recipient inbox before sending again" }
      : { exhaustedAt: now, queued: false }, $unset: { leaseToken: 1, leaseUntil: 1 } });
    if (row.status === "pending") uncertain += result.modifiedCount; else exhausted += result.modifiedCount;
  }
  return { uncertain, exhausted };
}
async function deliverBatch() {
  await reconcileEmailDeliveryLeases();
  if (!env.emailEnabled || !emailConfiguration().configured) return;
  const rows = await EmailDelivery.find({
    queued: true, retryable: true, status: { $in: ["pending", "failed"] }, attempts: { $lt: emailAttemptLimit() },
    $or: [{ lastAttemptAt: { $exists: false } }, { lastAttemptAt: { $lte: new Date(Date.now() - 30000) } }],
  }).sort({ createdAt: 1 }).limit(3).select("_id");
  await Promise.all(rows.map(async row => {
    const result = await retryEmailDelivery({ deliveryId: row._id });
    if (result.code === "RECIPIENT_NO_LONGER_ELIGIBLE") {
      await EmailDelivery.updateOne({ _id: row._id }, { $set: { queued: false, status: "failed", lifecycleStatus: "failed",
        errorCode: result.code, lastError: "Recipient no longer has notification access" } });
    }
  }));
}
export function startEmailDeliveryWorker({ intervalMs = 1000 } = {}) {
  if (timer) return;
  setEmailQueueEnabled(true);
  // No unawaited network work in HTTP handlers. The persistent outbox also
  // survives a restart; only explicitly queued records are processed.
  timer = setInterval(() => {
    flushQueuedEmails().catch(() => console.warn("[medreach] Email queue temporarily unavailable."));
  }, intervalMs);
  timer.unref();
}
export async function stopEmailDeliveryWorker() {
  clearInterval(timer); timer = null;
  setEmailQueueEnabled(false);
  if (running) await running;
}
