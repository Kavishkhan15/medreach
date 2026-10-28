import mongoose from "mongoose";
import { PROVIDER_KINDS } from "./ProviderMembership.js";

export const INVENTORY_CLASSIFICATIONS = ["demo", "provider_confirmed", "historical_imported", "unknown"];
export const INVENTORY_REPORTING_METHODS = ["manual_inventory", "provider_report", "demo_fixture"];
export const INVENTORY_JOURNAL_LIMIT = 100;
export const INVENTORY_RECOVERY_MAX_ATTEMPTS = 5;
const count = () => ({ type: Number, default: null, validate: { validator: (v) => v === null || (Number.isSafeInteger(v) && v >= 0), message: "Inventory counts must be non-negative safe integers or null" } });
const pendingEvent = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  version: { type: Number, required: true },
  occurredAt: { type: Date, required: true },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, required: true },
  requestId: { type: String, maxlength: 128 },
  ipHash: { type: String, maxlength: 64 },
  recoveryAttempts: { type: Number, default: 0, min: 0, max: INVENTORY_RECOVERY_MAX_ATTEMPTS, validate: Number.isSafeInteger },
  recoveryLastAttemptAt: Date,
  recoveryLeaseToken: String,
  recoveryLeaseUntil: Date,
  retryAt: Date,
  exhaustedAt: Date,
  errorCode: { type: String, maxlength: 80 },
}, { _id: true });
const schema = new mongoose.Schema({
  kind: { type: String, enum: PROVIDER_KINDS, required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, required: true },
  resourceKey: { type: String, required: true, match: /^[a-z][a-z0-9_]{0,63}$/ },
  unit: { type: String, required: true, match: /^[a-z][a-z0-9_]{0,31}$/ },
  capacity: count(), occupied: count(), blocked: count(), held: count(), available: count(),
  observedAt: { type: Date, default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  reportingMethod: { type: String, enum: INVENTORY_REPORTING_METHODS, required: true },
  classification: { type: String, enum: INVENTORY_CLASSIFICATIONS, required: true },
  pendingEvents: { type: [pendingEvent], default: [], select: false, validate: { validator: (rows) => rows.length <= INVENTORY_JOURNAL_LIMIT, message: "Inventory recovery backlog is full" } },
}, { timestamps: true, strict: "throw" });
schema.index({ kind: 1, organization: 1, resourceKey: 1 }, { unique: true });
schema.index({ observedAt: 1, classification: 1 });
schema.index({ "pendingEvents.0": 1 }, { sparse: true });
schema.index({ "pendingEvents.exhaustedAt": 1 }, { sparse: true });
export const ResourceInventory = mongoose.model("ResourceInventory", schema);
