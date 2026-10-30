import mongoose from "mongoose";

export const RESERVATION_STATES = ["held", "confirmed", "admitted", "released", "expired", "issued", "completed", "discharged"];
const schema = new mongoose.Schema({
  requestType: { type: String, enum: ["hospital", "blood", "diagnostic"], required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ["hospital", "blood_bank", "diagnostic"], required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, required: true },
  resourceKey: { type: String, required: true, maxlength: 64 },
  inventory: { type: mongoose.Schema.Types.ObjectId, ref: "ResourceInventory" },
  dailyCapacity: { type: mongoose.Schema.Types.ObjectId, ref: "DiagnosticDailyCapacity" },
  quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  urgency: { type: String, enum: ["routine", "urgent"], default: "routine" },
  state: { type: String, enum: RESERVATION_STATES, default: "held", required: true },
  expiresAt: { type: Date, default: null },
  version: { type: Number, default: 1, min: 1 },
  history: [{ _id: false, state: { type: String, enum: RESERVATION_STATES }, at: Date, actor: mongoose.Schema.Types.ObjectId }],
}, { timestamps: true, strict: "throw" });
schema.index({ requestType: 1, requestId: 1, resourceKey: 1 }, { unique: true });
schema.index({ state: 1, expiresAt: 1 });
schema.index({ kind: 1, organization: 1, state: 1 });
schema.index({ inventory: 1, state: 1 });
schema.index({ dailyCapacity: 1, state: 1 });
// This is deliberately not a TTL index: expiring a document would lose the
// durable release intent and its audit trail without restoring capacity.
export const ResourceReservation = mongoose.model("ResourceReservation", schema);
