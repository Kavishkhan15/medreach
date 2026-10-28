import mongoose from "mongoose";

const schema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true },
  recipient: { type: String, required: true, lowercase: true, trim: true },
  recipientUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  recipientContactPolicy: { type: String, enum: ["notification", "account"] },
  template: { type: String, required: true },
  subject: { type: String, required: true },
  status: { type: String, enum: ["disabled", "pending", "sent", "failed", "uncertain"], required: true },
  lifecycleStatus: { type: String, enum: ["queued", "submitted", "delivered", "bounced", "failed", "uncertain"] },
  provider: { type: String, enum: ["resend", "smtp"] },
  providerMessageId: { type: String, maxlength: 180 },
  providerAcceptedAt: { type: Date },
  providerEventAt: { type: Date },
  deliveredAt: { type: Date },
  bouncedAt: { type: Date },
  recoveryResolution: { type: String, enum: ["confirmed_not_submitted", "confirmed_submitted", "cancelled"] },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  resolvedAt: { type: Date },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, maxlength: 240 },
  errorCode: { type: String, maxlength: 80 },
  sentAt: { type: Date },
  retryable: { type: Boolean, default: false, index: true },
  retryEnvelope: { type: String, select: false },
  queued: { type: Boolean },
  leaseToken: { type: String, select: false },
  leaseUntil: { type: Date },
  lastAttemptAt: { type: Date },
  exhaustedAt: { type: Date },
  retriedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  retriedAt: { type: Date },
  sourceModel: { type: String, enum: ["AmbulanceBooking", "RequestNotification", "EmergencyCoordination"] },
  sourceId: { type: mongoose.Schema.Types.ObjectId, index: true },
  sourceChannel: { type: String, enum: ["user", "admin", "provider"] },
}, { timestamps: true });
schema.index({ provider: 1, providerMessageId: 1 }, { unique: true, partialFilterExpression: { providerMessageId: { $type: "string" } } });
schema.index({ queued: 1, status: 1, lastAttemptAt: 1, createdAt: 1 });
schema.index({ lifecycleStatus: 1, updatedAt: 1 });
export const EmailDelivery = mongoose.model("EmailDelivery", schema);
