import mongoose from "mongoose";
import { HOSPITAL_CLAIM_FIELDS } from "./HospitalFieldClaim.js";

const schema = new mongoose.Schema({
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  field: { type: String, enum: HOSPITAL_CLAIM_FIELDS, required: true },
  status: { type: String, enum: ["open", "resolved"], default: "open", index: true },
  claims: [{ type: mongoose.Schema.Types.ObjectId, ref: "HospitalFieldClaim" }],
  selectedClaim: { type: mongoose.Schema.Types.ObjectId, ref: "HospitalFieldClaim", default: null },
  resolvedValue: { type: mongoose.Schema.Types.Mixed, default: null },
  claimSignature: { type: String, default: "" },
  history: [{
    status: { type: String, enum: ["open", "resolved"], required: true },
    selectedClaim: { type: mongoose.Schema.Types.ObjectId, ref: "HospitalFieldClaim", default: null },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, required: true },
  }],
}, { timestamps: true });

schema.index({ hospital: 1, field: 1 }, { unique: true });
export const HospitalFieldConflict = mongoose.model("HospitalFieldConflict", schema);
