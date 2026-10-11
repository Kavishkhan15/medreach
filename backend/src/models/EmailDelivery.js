import mongoose from "mongoose";

const schema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true },
  recipient: { type: String, required: true, lowercase: true, trim: true },
  template: { type: String, required: true },
  subject: { type: String, required: true },
  status: { type: String, enum: ["disabled", "pending", "sent", "failed", "uncertain"], required: true },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, maxlength: 240 },
  errorCode: { type: String, maxlength: 80 },
  sentAt: { type: Date },
  retryable: { type: Boolean, default: false, index: true },
  retryEnvelope: { type: String, select: false },
  leaseToken: { type: String, select: false },
  leaseUntil: { type: Date },
  lastAttemptAt: { type: Date },
  retriedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  retriedAt: { type: Date },
  sourceModel: { type: String, enum: ["AmbulanceBooking", "RequestNotification"] },
  sourceId: { type: mongoose.Schema.Types.ObjectId, index: true },
  sourceChannel: { type: String, enum: ["user", "admin", "provider"] },
}, { timestamps: true });
export const EmailDelivery = mongoose.model("EmailDelivery", schema);
