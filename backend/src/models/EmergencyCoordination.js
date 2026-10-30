import mongoose from "mongoose";

const recipient = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  email: { type: String, required: true },
  channel: { type: String, enum: ["admin", "provider"], required: true },
}, { _id: false });
const event = new mongoose.Schema({
  key: { type: String, required: true },
  kind: { type: String, enum: ["created", "escalated", "acknowledged", "resolved", "exhausted"], required: true },
  actor: mongoose.Schema.Types.ObjectId,
  at: { type: Date, required: true },
  step: { type: Number, required: true },
  recipients: [recipient],
  auditRecorded: { type: Boolean, default: false },
  deliveryRecorded: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  retryAt: Date,
  exhaustedAt: Date,
  errorCode: String,
  leaseToken: String,
  leaseUntil: Date,
}, { _id: false });
const schema = new mongoose.Schema({
  sourceType: { type: String, enum: ["bed", "blood", "ambulance", "diagnostic"], required: true },
  source: { type: mongoose.Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ["hospital", "blood_bank", "ambulance", "diagnostic"], required: true },
  organization: mongoose.Schema.Types.ObjectId,
  reference: { type: String, required: true },
  status: { type: String, enum: ["awaiting_acknowledgement", "escalated", "acknowledged", "resolved", "exhausted"], default: "awaiting_acknowledgement" },
  version: { type: Number, default: 1, min: 1 },
  escalationCount: { type: Number, default: 0, min: 0, max: 3 },
  nextEscalationAt: { type: Date, index: true },
  acknowledgedAt: Date,
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  resolvedAt: Date,
  manualAttention: { type: Boolean, default: false },
  attentionReason: { type: String, enum: ["no_eligible_recipients", "escalation_exhausted", "delivery_preparation_failed"] },
  recoveryCheckedAt: Date,
  events: { type: [event], select: false },
}, { timestamps: true });
schema.index({ sourceType: 1, source: 1 }, { unique: true });
schema.index({ status: 1, nextEscalationAt: 1, recoveryCheckedAt: 1 });
schema.index({ "events.auditRecorded": 1, recoveryCheckedAt: 1 });
schema.index({ "events.deliveryRecorded": 1, recoveryCheckedAt: 1 });
schema.set("toJSON", { transform: (_doc, result) => { delete result.events; delete result.__v; return result; } });
export const EmergencyCoordination = mongoose.model("EmergencyCoordination", schema);
