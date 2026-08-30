import { DataSource } from "../models/DataSource.js";
import { CrawlJob } from "../models/CrawlJob.js";
import { CrawlResult } from "../models/CrawlResult.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { crawlSource } from "../_crawler/runner.js";

// GET /api/crawler/jobs — admin: recent crawl jobs (newest first).
export const listJobs = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const data = await CrawlJob.find().populate("source", "name type").sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ data });
});

// GET /api/crawler/results — admin: recent crawl results (provenance).
export const listResults = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const data = await CrawlResult.find().sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ data });
});

// POST /api/crawler/run?sourceId= — admin: crawl ONE approved source now.
// The runner enforces the SSRF gate; we only ever pass a registered source.
export const runCrawl = asyncHandler(async (req, res) => {
  const source = await DataSource.findById(req.query.sourceId || req.body.sourceId);
  if (!source) return res.status(404).json({ error: "Source not found" });

  const job = await crawlSource(source.toObject());
  const saved = await CrawlJob.create({
    source: source._id, status: job.status, startedAt: job.startedAt, completedAt: job.completedAt,
    recordsFound: job.recordsFound, recordsUpdated: job.recordsUpdated,
    errorMessages: job.errorMessages, durationMs: job.durationMs,
  });
  // Update source fetch timestamps.
  const stamp = job.status === "success" ? { lastSuccessfulFetch: new Date() } : { lastFailedFetch: new Date() };
  await DataSource.findByIdAndUpdate(source._id, stamp);

  res.status(202).json({ job: saved, result: job.result ?? null });
});
