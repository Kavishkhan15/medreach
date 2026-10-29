import mongoose from "mongoose";
import { requestStatusEffectsSchema } from "./requestStatusEffectsSchema.js";

export const DIAGNOSTIC_TESTS = ["CBC", "BLOOD_GLUCOSE", "LIPID_PROFILE", "THYROID_PROFILE"];
export const DIAGNOSTIC_STATES = ["REQUESTED", "UNDER_REVIEW", "CONFIRMED", "COMPLETED", "DECLINED", "CANCELLED"];
const schema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: "ResourceProvider", required: true },
  providerName: { type: String, required: true, maxlength: 180 },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  tests: { type: [{ type: String, enum: DIAGNOSTIC_TESTS }], required: true,
    validate: value => value.length >= 1 && value.length <= 4 && new Set(value).size === value.length },
  requestSnapshot: {
    patientName: { type: String, required: true, trim: true, maxlength: 150 },
    contactPhone: { type: String, required: true, trim: true, maxlength: 40 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 150 },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  preferredDate: { type: String, required: true },
  preferredTime: { type: String, enum: ["MORNING", "AFTERNOON", "EVENING"], required: true },
  consentAt: { type: Date, required: true },
  status: { type: String, enum: DIAGNOSTIC_STATES, default: "REQUESTED" },
  centreApprovalPending: { type: Boolean, default: false },
  version: { type: Number, default: 0, min: 0 },
  acceptedTests: [{ type: String, enum: DIAGNOSTIC_TESTS }],
  appointmentAt: Date,
  providerResponse: { type: String, maxlength: 500 },
  history: [{ _id: false, status: { type: String, enum: DIAGNOSTIC_STATES }, at: Date,
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, acceptedTests: [String], appointmentAt: Date }],
  trackingTokenHash: { type: String, required: true, select: false },
  idempotencyKeyHash: { type: String, select: false },
  payloadHash: { type: String, required: true, select: false },
  notificationVersion: { type: Number, default: 1 },
  notificationRoutedAt: Date,
  notificationRouting: { type: String, enum: ["recorded", "no_eligible_recipients"] },
  statusEffects: { type: [requestStatusEffectsSchema], default: undefined, select: false },
}, { timestamps: true });
schema.index({ provider: 1, createdAt: -1, _id: -1 });
schema.index({ user: 1, createdAt: -1, _id: -1 });
schema.index({ idempotencyKeyHash: 1 }, { unique: true, sparse: true });
schema.index({ notificationVersion: 1, notificationRoutedAt: 1 });
schema.index({ "statusEffects.exhausted": 1, "statusEffects.retryAt": 1 });
schema.set("toJSON", { transform: (_document, value) => {
  for (const key of ["trackingTokenHash", "idempotencyKeyHash", "payloadHash", "statusEffects", "__v"]) delete value[key];
  return value;
} });
export const DiagnosticRequest = mongoose.model("DiagnosticRequest", schema);
