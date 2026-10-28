import mongoose from "mongoose";

// Pending effects live on the source document, so saving a transition cannot
// lose its audit/email intent if the process exits immediately afterwards.
export const requestStatusEffectsSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  auditId: { type: mongoose.Schema.Types.ObjectId, required: true },
  previousStatus: { type: String, required: true },
  status: { type: String, required: true },
  actor: mongoose.Schema.Types.ObjectId,
  timelineLength: Number,
  recordedAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  retryAt: Date,
  leaseToken: String,
  leaseUntil: Date,
  exhausted: { type: Boolean, default: false },
  errorCode: String,
}, { _id: false });
