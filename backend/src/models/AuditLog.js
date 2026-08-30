import mongoose from "mongoose";
import { AUDIT_ACTIONS } from "../config/constants.js";

// Records critical administrative actions with before/after provenance.
// Privacy-by-design: we store an IP *hash*, never the raw IP, and never
// sensitive personal or medical data.
const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entityType: { type: String, trim: true }, // e.g. "Hospital", "AvailabilityObservation"
    entityId: { type: mongoose.Schema.Types.ObjectId },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    ipHash: { type: String }, // sha256(ip + salt), never the raw address
    requestId: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.set("toJSON", { transform: (_d, r) => (delete r.__v, r) });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
