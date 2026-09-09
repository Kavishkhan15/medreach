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
