import mongoose from "mongoose";
import { CONFIDENCE_LEVELS } from "../config/constants.js";

// A single normalized+validated record produced by a crawl job, retained for
// provenance and admin verification before it is applied to live data.
const crawlResultSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: "CrawlJob", required: true, index: true },
    source: { type: mongoose.Schema.Types.ObjectId, ref: "DataSource", required: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital" },
    // The normalized payload (facility statuses, contact info, etc.).
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Raw parsed snapshot kept for auditing/structure-change detection.
    rawHash: { type: String },
    valid: { type: Boolean, default: false },
    validationErrors: [{ type: String }],
    confidence: { type: String, enum: CONFIDENCE_LEVELS, default: "UNKNOWN" },
    applied: { type: Boolean, default: false }, // applied to live data yet?
  },
  { timestamps: true }
);

crawlResultSchema.index({ createdAt: -1 });
crawlResultSchema.set("toJSON", { transform: (_d, r) => (delete r.__v, r) });

export const CrawlResult = mongoose.model("CrawlResult", crawlResultSchema);
