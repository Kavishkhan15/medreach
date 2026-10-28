import mongoose from "mongoose";
export const PROVIDER_KINDS = ["hospital", "blood_bank", "diagnostic", "ambulance"];
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  organization: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  kind: { type: String, enum: PROVIDER_KINDS, required: true },
  accessLevel: { type: String, enum: ["admin", "inventory_reporter", "reviewer"], default: "admin" },
  accessAudit: { type: [mongoose.Schema.Types.Mixed], default: [], select: false },
  assignmentMutation: { type: String, select: false },
  archivedByOperation: { type: mongoose.Schema.Types.ObjectId },
  active: { type: Boolean, default: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
schema.index({ user: 1, kind: 1, organization: 1 }, { unique: true });
export const ProviderMembership = mongoose.model("ProviderMembership", schema);
