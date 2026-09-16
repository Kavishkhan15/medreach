import mongoose from "mongoose";

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  purpose: { type: String, enum: ["verify_email", "reset_password"], required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AuthToken = mongoose.model("AuthToken", schema);
