import mongoose from "mongoose";
import { SOURCE_TYPES, ACCESS_METHODS, SOURCE_RELIABILITY } from "../config/constants.js";

// The approved registry of external sources. The crawler will ONLY fetch URLs
// that resolve from an enabled DataSource here — never arbitrary user input.
const dataSourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    // Stable string id matching crawler/src/registry/sources.js sourceId
    // (e.g. "lilavati"). Optional — only hospital-site crawler sources set it.
    sourceKey: { type: String, trim: true, index: true, sparse: true, unique: true },
    type: { type: String, enum: SOURCE_TYPES, required: true },
    url: { type: String, trim: true },
    accessMethod: { type: String, enum: ACCESS_METHODS, default: "http_html" },
    // 0..1; defaults from SOURCE_RELIABILITY by type but can be overridden per source.
    reliability: { type: Number, min: 0, max: 1 },
    enabled: { type: Boolean, default: true },
    // Admin-controllable operational config (overrides registry defaults).
    // The registry stays the source of truth for URL/paths/adapter (security:
    // never crawl arbitrary URLs); only these operational knobs are editable.
    crawlFrequencyMs: { type: Number, min: 60000 }, // >= 1 min; never seconds
    rateLimitMs: { type: Number, min: 1000 }, // min interval between requests
    // Health/standing of the source, surfaced in the admin dashboard.
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
