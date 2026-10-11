import mongoose from "mongoose";
import { PROVIDER_KINDS } from "./ProviderMembership.js";
const schema = new mongoose.Schema({
  kind: { type: String, enum: PROVIDER_KINDS, required: true },
  name: { type: String, required: true, maxlength: 180 },
  address: { type: String, required: true, maxlength: 300 },
  phone: { type: String, maxlength: 40 },
  website: { type: String, maxlength: 250 },
  contactEmail: { type: String, required: true, lowercase: true, trim: true },
  explanation: { type: String, maxlength: 1000 },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  organization: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
  account: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
export const ProviderApplication = mongoose.model("ProviderApplication", schema);
