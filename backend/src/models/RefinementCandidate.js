import mongoose from "mongoose";
import { FACILITY_TYPES } from "../config/constants.js";
const schema = new mongoose.Schema({
  claim: { type: mongoose.Schema.Types.ObjectId, ref: "FacilitySourceClaim", required: true, index: true },
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  source: { type: mongoose.Schema.Types.ObjectId, ref: "DataSource", required: true },
  sourcePageUrl: { type: String, required: true },
  evidenceExcerpt: { type: String, required: true, maxlength: 200 },
  facility: { type: String, enum: FACILITY_TYPES, required: true },
  candidateCapability: { type: String, enum: ["yes", "no"], required: true },
  model: { type: String, required: true },
  promptVersion: { type: String, default: "facility-evidence-v1" },
  confidence: { type: String, enum: ["LOW", "MEDIUM"], default: "LOW" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
  reviewNote: { type: String, maxlength: 500 },
}, { timestamps: true });
schema.index({ claim: 1, facility: 1, candidateCapability: 1 }, { unique: true });
export const RefinementCandidate = mongoose.model("RefinementCandidate", schema);
