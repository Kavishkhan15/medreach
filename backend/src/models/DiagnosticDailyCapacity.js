import mongoose from "mongoose";
import { DIAGNOSTIC_TESTS } from "./DiagnosticRequest.js";
const integer = { type: Number, required: true, min: 0, validate: Number.isSafeInteger };
const schema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, required: true },
  test: { type: String, enum: DIAGNOSTIC_TESTS, required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  capacity: integer,
  urgentCapacity: { ...integer, default: 0 },
  held: { ...integer, default: 0 },
  occupied: { ...integer, default: 0 },
  urgentHeld: { ...integer, default: 0 },
  urgentOccupied: { ...integer, default: 0 },
  enabled: { type: Boolean, default: true },
  classification: { type: String, enum: ["demo", "provider_confirmed", "platform_policy"], required: true },
  verifiedAt: { type: Date, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
}, { timestamps: true, strict: "throw" });
schema.index({ organization: 1, test: 1, date: 1 }, { unique: true });
schema.index({ date: 1, enabled: 1 });
export const DiagnosticDailyCapacity = mongoose.model("DiagnosticDailyCapacity", schema);
