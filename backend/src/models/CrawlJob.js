import mongoose from "mongoose";
import { CRAWL_STATUS } from "../config/constants.js";

// One execution of the crawler against a single DataSource.
const crawlJobSchema = new mongoose.Schema(
  {
    source: { type: mongoose.Schema.Types.ObjectId, ref: "DataSource", required: true, index: true },
    status: { type: String, enum: CRAWL_STATUS, default: "queued", index: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    recordsFound: { type: Number, default: 0, min: 0 },
    recordsUpdated: { type: Number, default: 0, min: 0 },
    errorMessages: [{ type: String }],
    durationMs: { type: Number, default: 0, min: 0 },
    retryCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

crawlJobSchema.index({ createdAt: -1 });
crawlJobSchema.set("toJSON", { transform: (_d, r) => (delete r.__v, r) });

export const CrawlJob = mongoose.model("CrawlJob", crawlJobSchema);
