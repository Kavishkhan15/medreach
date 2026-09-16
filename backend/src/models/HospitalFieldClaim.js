import mongoose from "mongoose";
import { CONFIDENCE_LEVELS } from "../config/constants.js";

export const HOSPITAL_CLAIM_FIELDS = ["name", "address", "locality", "pincode", "phone", "emergencyPhone", "website", "specialties"];

const reviewSchema = new mongoose.Schema({
  decision: { type: String, enum: ["approve", "reject"], required: true },
  fromStatus: { type: String, required: true },
  toStatus: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  at: { type: Date, required: true },
  note: { type: String, maxlength: 500 },
}, { _id: false });

const schema = new mongoose.Schema({
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  field: { type: String, enum: HOSPITAL_CLAIM_FIELDS, required: true },
  source: { type: mongoose.Schema.Types.ObjectId, ref: "DataSource", required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  sourcePageUrl: { type: String, trim: true, required: true },
  sourcePageUrls: [{ type: String, trim: true }],
  evidenceText: { type: String, trim: true, maxlength: 300 },
  evidenceKind: { type: String, enum: ["source_excerpt", "normalized_record", "legacy_snapshot", "manual_assertion"], default: "normalized_record" },
  confidence: { type: String, enum: CONFIDENCE_LEVELS, required: true, default: "UNKNOWN" },
  observedAt: { type: Date, required: true },
  // "unknown_historical" means the old crawl did not retain a parser version;
  // it is a disclosure marker, never a fabricated version number.
  parserVersion: { type: String, required: true, maxlength: 100 },
  verificationStatus: { type: String, enum: ["unverified", "verified", "rejected"], default: "unverified", required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  assertedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
  reviewNote: { type: String, maxlength: 500 },
  reviewHistory: [reviewSchema],
}, { timestamps: true });

schema.index({ hospital: 1, field: 1, source: 1 }, { unique: true });
export const HospitalFieldClaim = mongoose.model("HospitalFieldClaim", schema);
