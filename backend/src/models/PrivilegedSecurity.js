import mongoose from "mongoose";
// Secrets live outside User so ordinary account projections cannot leak them.
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  encryptedSecret: { type: String, select: false },
  pendingSecret: { type: String, select: false },
  pendingUntil: Date,
  enabledAt: Date,
  lastStep: { type: Number, default: -1 },
  recoveryHashes: { type: [String], select: false },
}, { timestamps: true });
export const PrivilegedSecurity = mongoose.model("PrivilegedSecurity", schema);
const reauthSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  familyId: { type: String, required: true },
  authVersion: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
reauthSchema.index({ user: 1, familyId: 1 }, { unique: true });
reauthSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PrivilegedReauthentication = mongoose.model("PrivilegedReauthentication", reauthSchema);
