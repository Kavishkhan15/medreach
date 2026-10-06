import mongoose from "mongoose";
import { SOURCE_TYPES, ACCESS_METHODS, SOURCE_RELIABILITY } from "../config/constants.js";

// Historical and manually asserted source metadata retained for provenance.
// No application route or worker fetches these URLs.
const dataSourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    // Historical source identifier retained for existing records.
    sourceKey: { type: String, trim: true, index: true, sparse: true, unique: true },
    type: { type: String, enum: SOURCE_TYPES, required: true },
    url: { type: String, trim: true },
    accessMethod: { type: String, enum: ACCESS_METHODS, default: "http_html" },
    // 0..1; defaults from SOURCE_RELIABILITY by type but can be overridden per source.
    reliability: { type: Number, min: 0, max: 1 },
    enabled: { type: Boolean, default: true },
    // Historical execution metadata. Kept so existing documents deserialize
    // without losing their recorded provenance; it has no runtime effect.
    crawlFrequencyMs: { type: Number, min: 60000 },
    rateLimitMs: { type: Number, min: 1000 },
    healthStatus: {
      type: String,
      enum: ["healthy", "warning", "stale", "blocked", "error", "disabled", "unknown"],
      default: "unknown",
    },
    robotsStatus: {
      type: String,
      enum: ["unknown", "no_robots", "robots_allow", "robots_disallow"],
      default: "unknown",
    },
    lastFailureReason: { type: String, trim: true },
    failureCount: { type: Number, default: 0, min: 0 },
    adminNotes: { type: String, trim: true, maxlength: 500 },
    // Optional: which hospital this source describes (many sources are per-hospital).
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital" },
    lastSuccessfulFetch: { type: Date },
    lastFailedFetch: { type: Date },
  },
  { timestamps: true }
);

dataSourceSchema.pre("validate", function (next) {
  if (this.reliability === undefined || this.reliability === null) {
    this.reliability = SOURCE_RELIABILITY[this.type] ?? 0.3;
  }
  next();
});

dataSourceSchema.set("toJSON", { transform: (_d, r) => (delete r.__v, r) });

export const DataSource = mongoose.model("DataSource", dataSourceSchema);
