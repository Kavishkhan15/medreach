import { createHmac, createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { EmailDelivery } from "../models/EmailDelivery.js";
import { EmailWebhookEvent } from "../models/EmailWebhookEvent.js";
import { AuditLog } from "../models/AuditLog.js";

// Resend signs the exact bytes using the Standard Webhooks/Svix v1 format.
export function verifyResendWebhook(raw, headers, secret, now = Date.now()) {
  const id = headers["svix-id"], timestamp = headers["svix-timestamp"], signatures = headers["svix-signature"];
  if (!Buffer.isBuffer(raw) || raw.length > 262144 || typeof secret !== "string" || !secret.startsWith("whsec_")
      || typeof id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(id)
      || typeof timestamp !== "string" || !/^\d{10,12}$/.test(timestamp)
      || typeof signatures !== "string" || signatures.length > 2048
      || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new Error("Invalid webhook signature");
  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length < 16) throw new Error("Invalid webhook signature");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(raw).digest();
  const valid = signatures.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
    const actual = Buffer.from(value, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
  if (!valid) throw new Error("Invalid webhook signature");
  try { return JSON.parse(raw.toString("utf8")); } catch { throw new Error("Invalid webhook payload"); }
}

const transitions = {
  "email.sent": "submitted", "email.delivered": "delivered", "email.bounced": "bounced",
  "email.failed": "failed", "email.complained": "bounced", "email.delivery_delayed": "submitted",
};

export async function reconcileWebhookEvents({ limit = 100, providerMessageId, now = new Date() } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invalid webhook recovery options");
  const available = { $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] };
  const abandoned = await EmailWebhookEvent.find({ status: "pending", attempts: { $gte: 5 }, ...available })
    .sort({ recoveryCheckedAt: 1, _id: 1 }).limit(limit).select("_id").lean();
  await EmailWebhookEvent.updateMany({ _id: { $in: abandoned.map(row => row._id) }, status: "pending", attempts: { $gte: 5 }, ...available },
    { $set: { status: "exhausted", exhaustedAt: now, errorCode: "WEBHOOK_RECOVERY_EXHAUSTED" }, $unset: { leaseToken: 1, leaseUntil: 1 } });
  const due = { status: "pending", attempts: { $lt: 5 }, ...(providerMessageId ? { providerMessageId } : {}),
    $and: [available, { $or: [{ retryAt: { $exists: false } }, { retryAt: { $lte: now } }, ...(providerMessageId ? [{ errorCode: "WEBHOOK_AWAITING_MESSAGE" }] : [])] }] };
  const rows = await EmailWebhookEvent.find(due)
    .sort({ recoveryCheckedAt: 1, occurredAt: 1, _id: 1 }).limit(limit).select("_id");
  let processed = 0;
  for (const row of rows) {
    const leaseToken = randomUUID();
    const event = await EmailWebhookEvent.findOneAndUpdate({ _id: row._id, ...due },
      { $set: { leaseToken, leaseUntil: new Date(now.getTime() + 60000), recoveryCheckedAt: now } }, { new: true });
    if (!event) continue;
    let attemptRecorded = false;
    try {
      const delivery = await EmailDelivery.findOne({ provider: "resend", providerMessageId: event.providerMessageId });
      if (!delivery) {
        // An early event does not consume the failure budget while its provider
        // acceptance is being recorded. Unmatched receipts age out visibly.
        const orphaned = now.getTime() - event.createdAt.getTime() >= 86400000;
        await EmailWebhookEvent.updateOne({ _id: event._id, leaseToken }, { $set: orphaned
          ? { status: "exhausted", exhaustedAt: now, errorCode: "WEBHOOK_MESSAGE_UNMATCHED" }
          : { retryAt: new Date(now.getTime() + 60000), errorCode: "WEBHOOK_AWAITING_MESSAGE" } });
        continue;
      }
      await EmailWebhookEvent.updateOne({ _id: event._id, leaseToken }, { $inc: { attempts: 1 } });
      attemptRecorded = true;
      event.attempts += 1;
      const lifecycleStatus = transitions[event.eventType];
      const terminal = ["delivered", "bounced", "failed"];
      const set = { lifecycleStatus, providerEventAt: event.occurredAt,
        status: ["submitted", "delivered"].includes(lifecycleStatus) ? "sent" : "failed",
        ...(lifecycleStatus === "delivered" ? { deliveredAt: event.occurredAt } : {}),
        ...(lifecycleStatus === "bounced" ? { bouncedAt: event.occurredAt } : {}),
        ...(terminal.includes(lifecycleStatus) ? { queued: false, retryable: false } : {}),
        ...(["bounced", "failed"].includes(lifecycleStatus) ? { errorCode: `RESEND_${lifecycleStatus.toUpperCase()}`, lastError: "Email provider reported a delivery failure" } : {}),
      };
      await EmailDelivery.updateOne({ _id: delivery._id,
        lifecycleStatus: { $nin: ["bounced", "failed", ...(lifecycleStatus === "submitted" ? ["delivered"] : [])] },
        $or: [{ providerEventAt: { $exists: false } }, { providerEventAt: { $lt: event.occurredAt } },
          ...(lifecycleStatus !== "submitted" ? [{ providerEventAt: event.occurredAt, lifecycleStatus: "submitted" },
            ...(["bounced", "failed"].includes(lifecycleStatus) ? [{ providerEventAt: event.occurredAt, lifecycleStatus: "delivered" }] : [])] : [])] }, { $set: set });
      // The receipt stays pending until its deterministic audit row exists.
      // Replay must record the observed event even if an earlier attempt already
      // applied the lifecycle update before its audit write failed.
      const current = await EmailDelivery.findById(delivery._id).select("lifecycleStatus").lean();
      await AuditLog.updateOne({ _id: event._id }, { $setOnInsert: {
        action: "update", entityType: "EmailDelivery", entityId: delivery._id,
        after: { lifecycleStatus: current?.lifecycleStatus, reportedLifecycleStatus: lifecycleStatus,
          operation: "provider_webhook", webhookId: event.webhookId },
      } }, { upsert: true });
      await EmailWebhookEvent.updateOne({ _id: event._id, leaseToken }, { $set: { status: "processed", processedAt: now }, $unset: { retryAt: 1, errorCode: 1 } });
      processed++;
    } catch (error) {
      const attempts = Math.min(5, event.attempts + (attemptRecorded ? 0 : 1));
      const exhausted = attempts >= 5;
      await EmailWebhookEvent.updateOne({ _id: event._id, leaseToken }, { $set: {
        attempts, status: exhausted ? "exhausted" : "pending", errorCode: "WEBHOOK_PROCESSING_UNAVAILABLE",
        ...(exhausted ? { exhaustedAt: now } : { retryAt: new Date(now.getTime() + Math.min(300000, 1000 * 2 ** attempts)) }),
      } });
      throw error;
    } finally {
      await EmailWebhookEvent.updateOne({ _id: event._id, leaseToken }, { $unset: { leaseToken: 1, leaseUntil: 1 } });
    }
  }
  return { processed };
}

export async function acceptResendWebhook(raw, headers, secret) {
  const payload = verifyResendWebhook(raw, headers, secret);
  const messageId = payload?.data?.email_id, eventType = payload?.type;
  const occurredAt = new Date(payload?.created_at);
  if (typeof messageId !== "string" || !/^[A-Za-z0-9_-]{1,180}$/.test(messageId)
      || typeof eventType !== "string" || eventType.length > 80 || !Number.isFinite(occurredAt.getTime())
      || occurredAt.getTime() > Date.now() + 300000) return { error: "Invalid webhook event", status: 400 };
  const payloadHash = createHash("sha256").update(raw).digest("hex");
  let receipt;
  try {
    receipt = await EmailWebhookEvent.create({ webhookId: headers["svix-id"], payloadHash,
      providerMessageId: messageId, eventType, occurredAt, status: transitions[eventType] ? "pending" : "ignored" });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    receipt = await EmailWebhookEvent.findOne({ webhookId: headers["svix-id"] });
    if (!receipt || receipt.payloadHash !== payloadHash) return { error: "Webhook ID conflicts with an existing event", status: 409 };
  }
  if (receipt.status === "pending") await reconcileWebhookEvents({ providerMessageId: messageId });
  return { received: true };
}
