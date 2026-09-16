import mongoose from "mongoose";
import { FACILITY_TYPES, CONFIDENCE_LEVELS } from "../config/constants.js";

// Latest capability assertion from one source for one hospital facility.
// CrawlResult retains prior crawl payloads; this collection preserves claims
// from different sources so one source cannot silently overwrite another.
const schema = new mongoose.Schema({
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  facility: { type: String, enum: FACILITY_TYPES, required: true },
  source: { type: mongoose.Schema.Types.ObjectId, ref: "DataSource", required: true },
  capability: { type: String, enum: ["yes", "no", "unknown"], required: true },
  confidence: { type: String, enum: CONFIDENCE_LEVELS, required: true, default: "UNKNOWN" },
  sourcePageUrl: { type: String, trim: true, required: true },
  evidenceText: { type: String, trim: true, maxlength: 200 },
  evidenceKind: { type: String, enum: ["source_excerpt", "normalized_record", "legacy_snapshot"], default: "normalized_record" },
  parserVersion: { type: String, trim: true, maxlength: 100 },
  assertedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  observedAt: { type: Date, required: true },
  verificationStatus: { type: String, enum: ["unverified", "verified", "rejected"], required: true, default: "unverified" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
  reviewNote: { type: String, trim: true, maxlength: 500 },
  reviewHistory: [{
    decision: { type: String, enum: ["approve", "reject"], required: true },
    fromStatus: { type: String, enum: ["unverified", "verified", "rejected"], required: true },
    toStatus: { type: String, enum: ["verified", "rejected"], required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 500 },
  }],
}, { timestamps: true });

schema.index({ hospital: 1, facility: 1, source: 1 }, { unique: true });
schema.index({ verificationStatus: 1, updatedAt: -1 });

export const FacilitySourceClaim = mongoose.model("FacilitySourceClaim", schema);
