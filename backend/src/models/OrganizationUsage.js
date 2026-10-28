import mongoose from "mongoose";
const schema = new mongoose.Schema({ kind: { type: String, required: true }, organization: { type: mongoose.Schema.Types.ObjectId, required: true }, operation: { type: String, required: true }, window: { type: Number, required: true }, used: { type: Number, default: 0 }, expiresAt: { type: Date, required: true } });
schema.index({ kind: 1, organization: 1, operation: 1, window: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const OrganizationUsage = mongoose.model("OrganizationUsage", schema);
