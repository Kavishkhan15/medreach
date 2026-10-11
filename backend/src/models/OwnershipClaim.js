import mongoose from "mongoose";

const schema = new mongoose.Schema({
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  hospitalEmail: { type: String, required: true, trim: true, lowercase: true },
  officialDomain: { type: String, trim: true, lowercase: true },
  documentReference: { type: String, trim: true, maxlength: 200 },
  explanation: { type: String, trim: true, maxlength: 500 },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  providerAccount: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
  reviewNote: { type: String, maxlength: 500 },
}, { timestamps: true });
schema.index({ hospital: 1, requester: 1, status: 1 });
export const OwnershipClaim = mongoose.model("OwnershipClaim", schema);
