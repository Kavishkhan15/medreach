import mongoose from "mongoose";

// Payloads contain identifiers and scheduling parameters only, never credentials
// or patient notes. A semantic key identifies one recoverable unit of work.
const schema = new mongoose.Schema({
  key: { type: String, required: true, maxlength: 240 },
  type: { type: String, required: true, maxlength: 80 },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ["queued", "running", "completed", "exhausted", "cancelled"], default: "queued", required: true },
  runAt: { type: Date, required: true, default: Date.now },
  attempts: { type: Number, default: 0, min: 0 },
  maxAttempts: { type: Number, default: 5, min: 1, max: 20 },
  owner: String,
  leaseToken: { type: String, select: false },
  leaseUntil: Date,
  heartbeatAt: Date,
  startedAt: Date,
  completedAt: Date,
  exhaustedAt: Date,
  errorCode: String,
  result: mongoose.Schema.Types.Mixed,
  retryHistory: [{ at: Date, actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, reason: { type: String, maxlength: 200 }, previousAttempts: Number, _id: false }],
}, { timestamps: true });
schema.index({ key: 1 }, { unique: true });
schema.index({ type: 1, status: 1, runAt: 1, leaseUntil: 1 });
schema.index({ status: 1, leaseUntil: 1 });
schema.index({ completedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600, partialFilterExpression: { status: "completed" } });
export const BackgroundJob = mongoose.model("BackgroundJob", schema);
