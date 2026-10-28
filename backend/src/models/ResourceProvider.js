import mongoose from "mongoose";

export const RESOURCE_KINDS = ["blood_bank", "diagnostic", "ambulance"];
const point = new mongoose.Schema({
  type: { type: String, enum: ["Point"], default: "Point" },
  coordinates: { type: [Number], required: true },
}, { _id: false });
const schema = new mongoose.Schema({
  archivedAt: { type: Date, default: null, index: true },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  archiveReason: { type: String, trim: true, maxlength: 500 },
  archiveOperation: { type: mongoose.Schema.Types.ObjectId },
  archivePending: { type: Boolean, default: false },
    archiveAttempts: { type: Number, default: 0, min: 0, max: 5 },
    archiveLeaseToken: { type: String, select: false },
    archiveLeaseUntil: Date,
    archiveRetryAt: Date,
    archiveExhaustedAt: Date,
    archiveErrorCode: { type: String, maxlength: 80 },
  approvalStatus: { type: String, enum: ["pending", "approved", "rejected"] },
  kind: { type: String, enum: RESOURCE_KINDS, required: true, index: true },
  active: { type: Boolean, default: true, index: true },
  derivedFromCapability: { type: String, enum: ["Blood Bank", "Diagnostics", "Ambulance"] },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital" },
  address: { type: String, trim: true, maxlength: 300 },
  locality: { type: String, trim: true, index: true },
  city: { type: String, trim: true, default: "Mumbai" },
  phone: { type: String, trim: true, maxlength: 40 },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 150,
    select: false,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid provider email"],
  },
  website: { type: String, trim: true },
  operatingHours: { type: String, trim: true, maxlength: 100 },
  services: [{ type: String, trim: true }],
  serviceEvidence: [{ service: String, sourceName: String, sourcePageUrl: String, evidenceText: String,
    observedAt: Date, confidence: String, verificationStatus: String }],
  listedBloodGroups: [{ type: String, trim: true }],
  providerType: { type: String, trim: true, maxlength: 80 },
  coverageArea: { type: String, trim: true, maxlength: 200 },
  location: { type: point, default: undefined },
  sourceName: { type: String, required: true, trim: true },
  sourceUrl: { type: String, trim: true },
  observedAt: { type: Date },
  confidence: { type: String, enum: ["HIGH", "MEDIUM", "LOW", "UNKNOWN"], default: "UNKNOWN" },
  verificationStatus: { type: String, enum: ["unverified", "verified", "rejected"], default: "unverified" },
  demo: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ kind: 1, locality: 1 });
schema.index({ hospital: 1, kind: 1, derivedFromCapability: 1 }, { unique: true, partialFilterExpression: { derivedFromCapability: { $exists: true } } });
schema.index({ location: "2dsphere" }, { partialFilterExpression: { "location.coordinates": { $exists: true } } });
export const ResourceProvider = mongoose.model("ResourceProvider", schema);
