import mongoose from "mongoose";

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  purpose: { type: String, enum: ["verify_email", "reset_password", "refresh_session", "oauth_state"], required: true },
  tokenHash: { type: String, required: true, unique: true },
  familyId: { type: String, index: true },
  replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: "AuthToken" },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date },
  revokedAt: { type: Date },
  revokeReason: { type: String, maxlength: 80 },
  ipHash: { type: String },
  userAgentHash: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, select: false },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ user: 1, purpose: 1, revokedAt: 1, expiresAt: -1 });
schema.index({ familyId: 1, purpose: 1 });
export const AuthToken = mongoose.model("AuthToken", schema);
