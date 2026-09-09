import { DataSource } from "../models/DataSource.js";
import { CrawlJob } from "../models/CrawlJob.js";
import { CrawlResult } from "../models/CrawlResult.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { crawlHospitalSource } from "../_crawler/orchestrator.js";
import { getSource as getRegistrySource } from "../_crawler/registry/sources.js";
import { createMongoRepo } from "../repos/crawlerMongoRepo.js";

// GET /api/crawler/jobs — admin: recent crawl jobs (newest first).
export const listJobs = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const data = await CrawlJob.find().populate("source", "name type sourceKey").sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ data });
});

// GET /api/crawler/results — admin: recent crawl results (provenance).
export const listResults = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const data = await CrawlResult.find().sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ data });
});

// POST /api/crawler/run?sourceId=<DataSource _id> — admin: crawl ONE approved
// source now, through the full pipeline: registry gate -> robots/SSRF-guarded
// adapter -> parse/normalize -> validate -> change detection -> Mongo persistence.
// `dryRun=true` fetches/validates/plans but writes nothing (spec §23).
export const runCrawl = asyncHandler(async (req, res) => {
  const dataSource = await DataSource.findById(req.query.sourceId || req.body.sourceId);
  if (!dataSource) return res.status(404).json({ error: "Source not found" });
  if (!dataSource.sourceKey) {
    return res.status(400).json({ error: "This source has no crawler sourceKey — not a hospital-site crawler source" });
  }

  // The crawler ONLY acts on its own approved registry entry, keyed by sourceKey —
  // never on arbitrary fields from the DB document (defense in depth vs. SSRF).
  const registrySource = getRegistrySource(dataSource.sourceKey);
  if (!registrySource) return res.status(400).json({ error: "Unknown crawler source key" });

  const dryRun = String(req.query.dryRun || req.body.dryRun) === "true";

  // Reserve the CrawlJob row up front so persistence writes (CrawlResult) can
  // reference it; update it with the outcome once the run completes.
  const jobDoc = await CrawlJob.create({ source: dataSource._id, status: "running", startedAt: new Date() });

  const repo = createMongoRepo({ job: dryRun ? null : jobDoc._id });
  const job = await crawlHospitalSource(registrySource, { repo, dryRun, verbose: false });

  jobDoc.status = job.status;
  jobDoc.startedAt = job.startedAt;
  jobDoc.completedAt = job.completedAt;
  jobDoc.recordsFound = job.recordsFound;
  jobDoc.recordsUpdated = job.recordsUpdated;
  jobDoc.errorMessages = job.errorMessages;
  jobDoc.durationMs = job.durationMs;
  await jobDoc.save();

  const stamp = job.status === "success" ? { lastSuccessfulFetch: new Date() } : { lastFailedFetch: new Date() };
  await DataSource.findByIdAndUpdate(dataSource._id, stamp);

  res.status(202).json({
    job: jobDoc.toObject(),
    classification: job.classification,
    anomaly: job.anomaly,
    confidence: job.confidence,
    changedFields: job.changedFields,
    record: dryRun ? job.record : undefined,
  });
});
