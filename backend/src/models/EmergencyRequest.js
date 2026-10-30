import mongoose from "mongoose";
import { requestStatusEffectsSchema } from "./requestStatusEffectsSchema.js";
import { FACILITY_TYPES } from "../config/constants.js";

export const REQUEST_STATES = ["REQUESTED", "SENT", "UNDER_REVIEW", "INFORMATION_REQUESTED", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED", "COMPLETED"];

const timeline = new mongoose.Schema({
  status: { type: String, enum: REQUEST_STATES, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  at: { type: Date, required: true, default: Date.now },
  note: { type: String, maxlength: 500 },
  hospitalResponse: { type: String, maxlength: 500 },
  actorRole: { type: String, enum: ["patient", "hospital_staff", "system"] },
}, { _id: false });

const expiryEffects = new mongoose.Schema({
  status: { type: String, enum: ["pending", "complete", "exhausted"], required: true },
  auditId: { type: mongoose.Schema.Types.ObjectId, required: true },
  previousStatus: { type: String, enum: REQUEST_STATES, required: true },
  timelineLength: { type: Number, required: true },
  recordedAt: { type: Date, required: true },
  completedAt: Date,
  attempts: { type: Number, default: 0 },
  retryAt: Date,
  lastAttemptAt: Date,
  errorCode: String,
  leaseToken: String,
  leaseUntil: Date,
}, { _id: false });

const schema = new mongoose.Schema({
  capacityAllocation: { type: mongoose.Schema.Types.Mixed },
  statusEffects: { type: [requestStatusEffectsSchema], default: undefined, select: false },
  expiryEffects: { type: expiryEffects, select: false },
  coordinationVersion: Number,
  coordinationRecordedAt: Date,
  notificationVersion: Number,
  notificationRoutedAt: Date,
  notificationRouting: { type: String, enum: ["recorded", "no_eligible_recipients"] },
  requestId: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false, index: true },
  trackingTokenHash: { type: String, select: false },
  idempotencyKeyHash: { type: String, select: false },
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  emergencyType: { type: String, trim: true, required: true, maxlength: 80 },
  requiredFacility: { type: String, enum: FACILITY_TYPES, required: true },
  patientAgeGroup: { type: String, enum: ["infant", "child", "adult", "older_adult", "unknown"], default: "unknown" },
  patientReference: { type: String, trim: true, maxlength: 80 },
  patientSummary: { type: String, trim: true, maxlength: 500 },
  contactPhone: { type: String, required: true, trim: true, maxlength: 25 },
  contactEmail: { type: String, trim: true, lowercase: true, maxlength: 120 },
  isEmergency: { type: Boolean, default: true },
  ambulanceRequired: { type: Boolean, default: false },
  ambulancePickupAddress: { type: String, trim: true, maxlength: 300 },
  locality: { type: String, trim: true, maxlength: 120 },
  status: { type: String, enum: REQUEST_STATES, default: "REQUESTED", index: true },
  hospitalResponse: { type: String, trim: true, maxlength: 500 },
  expiresAt: { type: Date, required: true, index: true },
  respondedAt: { type: Date },
  timeline: [timeline],
}, { timestamps: true });

schema.index({ hospital: 1, status: 1, createdAt: -1 });
schema.index({ status: 1, expiresAt: 1 });
schema.index({ "expiryEffects.status": 1, "expiryEffects.retryAt": 1, "expiryEffects.leaseUntil": 1 });
schema.index({ idempotencyKeyHash: 1 }, { unique: true, sparse: true });
schema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.statusEffects;
    delete ret.trackingTokenHash;
    delete ret.idempotencyKeyHash;
    delete ret.__v;
    delete ret.expiryEffects;
    return ret;
  },
});
schema.index({ notificationVersion: 1, notificationRoutedAt: 1 });
schema.index({ coordinationVersion: 1, coordinationRecordedAt: 1, createdAt: 1 });
schema.index({ "statusEffects.exhausted": 1, "statusEffects.retryAt": 1 });
export const EmergencyRequest = mongoose.model("EmergencyRequest", schema);
