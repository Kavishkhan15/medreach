import mongoose from "mongoose";
import { PROVIDER_KINDS } from "./ProviderMembership.js";
import { INVENTORY_CLASSIFICATIONS, INVENTORY_REPORTING_METHODS } from "./ResourceInventory.js";
const schema = new mongoose.Schema({
  inventory: { type: mongoose.Schema.Types.ObjectId, ref: "ResourceInventory", required: true },
  kind: { type: String, enum: PROVIDER_KINDS, required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, required: true },
  resourceKey: { type: String, required: true },
  version: { type: Number, required: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  classification: { type: String, enum: INVENTORY_CLASSIFICATIONS, required: true },
  reportingMethod: { type: String, enum: INVENTORY_REPORTING_METHODS, required: true },
  observedAt: { type: Date, default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  recordedAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ inventory: 1, version: -1 }, { unique: true });
schema.index({ kind: 1, organization: 1, resourceKey: 1, version: -1 });
export const InventoryObservation = mongoose.model("InventoryObservation", schema);
