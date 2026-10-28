import mongoose from "mongoose";
import { PROVIDER_KINDS } from "./ProviderMembership.js";
const schema = new mongoose.Schema({
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  kind: { type: String, enum: PROVIDER_KINDS, required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, required: true },
  dataset: { type: String, enum: ["current_inventory"], required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
  rows: { type: [mongoose.Schema.Types.Mixed], select: false, required: true },
}, { timestamps: true, strict: "throw" });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ requestedBy: 1, createdAt: -1 });
export const DataExport = mongoose.model("DataExport", schema);
