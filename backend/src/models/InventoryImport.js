import mongoose from "mongoose";
const row = new mongoose.Schema({ resourceKey: String, input: mongoose.Schema.Types.Mixed, state: { type: String, enum: ["pending", "applied", "conflict", "failed"], default: "pending" }, inventoryVersion: Number, errorCode: String }, { _id: false });
const schema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  kind: { type: String, enum: ["hospital", "blood_bank", "diagnostic", "ambulance"], required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, required: true },
  commitKey: { type: String, required: true, select: false },
  digest: { type: String, required: true }, rows: { type: [row], required: true },
  status: { type: String, enum: ["preview", "processing", "complete", "partial", "exhausted", "expired"], default: "preview" },
  expiresAt: { type: Date, required: true }, attempts: { type: Number, default: 0 },
  leaseToken: { type: String, select: false }, leaseUntil: Date, completedAt: Date, terminalReason: String,
}, { timestamps: true, strict: "throw" });
schema.index({ status: 1, attempts: 1, leaseUntil: 1, expiresAt: 1 });
schema.index({ actor: 1, createdAt: -1 });
schema.index({ organization: 1, kind: 1, createdAt: -1 });
export const InventoryImport = mongoose.model("InventoryImport", schema);
