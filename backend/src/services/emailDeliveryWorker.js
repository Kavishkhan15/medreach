import { EmailDelivery } from "../models/EmailDelivery.js";
import { env } from "../config/env.js";
import { retryEmailDelivery, setEmailQueueEnabled, emailConfiguration } from "./emailService.js";

let timer, running;
export function flushQueuedEmails() {
  if (running) return running;
  running = deliverBatch().finally(() => { running = null; });
  return running;
}
async function deliverBatch() {
  if (!env.emailEnabled || !emailConfiguration().configured) return;
  const rows = await EmailDelivery.find({
    queued: true, retryable: true, status: { $in: ["pending", "failed"] }, attempts: { $lt: 3 },
    $or: [{ lastAttemptAt: { $exists: false } }, { lastAttemptAt: { $lte: new Date(Date.now() - 30000) } }],
  }).sort({ createdAt: 1 }).limit(3).select("_id");
  await Promise.all(rows.map(async row => {
    const result = await retryEmailDelivery({ deliveryId: row._id });
    if (result.code === "RECIPIENT_NO_LONGER_ELIGIBLE") {
      await EmailDelivery.updateOne({ _id: row._id }, { $set: { queued: false, status: "failed",
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
