import mongoose from "mongoose";
import { PROVIDER_KINDS } from "./ProviderMembership.js";
const schema = new mongoose.Schema({
  kind: { type: String, enum: PROVIDER_KINDS, required: true },
  name: { type: String, required: true, maxlength: 180 },
  address: { type: String, required: true, maxlength: 300 },
  phone: { type: String, maxlength: 40 },
  website: { type: String, maxlength: 250 },
  contactEmail: { type: String, required: true, lowercase: true, trim: true },
  contactName: { type: String, trim: true, maxlength: 120 },
  city: { type: String, trim: true, maxlength: 100 },
  submissionFingerprint: { type: String, select: false },
  notificationVersion: Number,
  notificationCompletedAt: Date,
  reviewedAt: Date,
  reviewNote: { type: String, trim: true, maxlength: 1000 },
  explanation: { type: String, maxlength: 1000 },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  organization: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
  account: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
schema.index({ submissionFingerprint: 1 }, { unique: true, sparse: true });
schema.set("toJSON", { transform: (_doc, ret) => { delete ret.submissionFingerprint; delete ret.__v; return ret; } });
export const ProviderApplication = mongoose.model("ProviderApplication", schema);
