import mongoose from "mongoose";
// Signed receipts deliberately omit the raw payload, recipient and message body.
const schema = new mongoose.Schema({
  webhookId: { type: String, required: true, unique: true, maxlength: 200 },
  payloadHash: { type: String, required: true },
  providerMessageId: { type: String, required: true, maxlength: 180 },
  eventType: { type: String, required: true, maxlength: 80 },
  occurredAt: { type: Date, required: true },
  status: { type: String, enum: ["pending", "processed", "ignored", "exhausted"], default: "pending" },
  leaseToken: { type: String, select: false },
  leaseUntil: { type: Date },
  processedAt: { type: Date },
  attempts: { type: Number, default: 0 },
  retryAt: Date,
  exhaustedAt: Date,
  errorCode: String,
  recoveryCheckedAt: Date,
}, { timestamps: true });
schema.index({ status: 1, leaseUntil: 1, createdAt: 1 });
schema.index({ status: 1, retryAt: 1, recoveryCheckedAt: 1 });
schema.index({ providerMessageId: 1, status: 1 });
export const EmailWebhookEvent = mongoose.model("EmailWebhookEvent", schema);
