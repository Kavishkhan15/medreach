import mongoose from "mongoose";
import { PROVIDER_KINDS } from "./ProviderMembership.js";
const schema = new mongoose.Schema({ label: { type: String, required: true, maxlength: 80 }, user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, kind: { type: String, enum: PROVIDER_KINDS, required: true }, organization: { type: mongoose.Schema.Types.ObjectId, required: true }, scopes: [{ type: String, enum: ["inventory:read", "inventory:write"] }], secretHash: { type: String, required: true, select: false }, authVersion: { type: Number, required: true }, expiresAt: { type: Date, required: true }, revokedAt: Date }, { timestamps: true });
schema.index({ user: 1, kind: 1, organization: 1, _id: -1 });
export const IntegrationCredential = mongoose.model("IntegrationCredential", schema);
