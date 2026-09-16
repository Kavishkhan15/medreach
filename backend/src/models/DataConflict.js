import mongoose from "mongoose";
import { FACILITY_TYPES } from "../config/constants.js";

// Reviewable disagreement between source observations. The individual claims
// remain the evidence of record; resolving this does not delete either one.
const dataConflictSchema = new mongoose.Schema({
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  kind: { type: String, enum: ["facility_capability"], required: true },
  facility: { type: String, enum: FACILITY_TYPES, required: true },
  status: { type: String, enum: ["open", "resolved"], default: "open", index: true },
  claims: [{ type: mongoose.Schema.Types.ObjectId, ref: "FacilitySourceClaim" }],
  resolvedValue: { type: String, enum: ["yes", "no", "unknown"], default: "unknown" },
  selectedClaim: { type: mongoose.Schema.Types.ObjectId, ref: "FacilitySourceClaim", default: null },
  resolutionMethod: { type: String, enum: ["verified_claim", "sources_agree", null], default: null },
  history: [{
    status: { type: String, enum: ["open", "resolved"], required: true },
    value: { type: String, enum: ["yes", "no", "unknown"], required: true },
    method: { type: String, enum: ["verified_claim", "sources_agree", null], default: null },
    at: { type: Date, default: Date.now },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  }],
}, { timestamps: true });

dataConflictSchema.index({ hospital: 1, kind: 1, facility: 1 }, { unique: true });
dataConflictSchema.set("toJSON", { transform: (_doc, ret) => { delete ret.__v; return ret; } });

export const DataConflict = mongoose.model("DataConflict", dataConflictSchema);
