import { DataSource } from "../models/DataSource.js";
import { CrawlJob } from "../models/CrawlJob.js";
import { CrawlResult } from "../models/CrawlResult.js";
import { CrawlerSetting } from "../models/CrawlerSetting.js";
import { Hospital } from "../models/Hospital.js";
import { HospitalFacility } from "../models/HospitalFacility.js";
import { AvailabilityObservation } from "../models/AvailabilityObservation.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { crawlHospitalSource, crawlDirectorySource } from "../_crawler/orchestrator.js";
import { getSource as getRegistrySource, SOURCES } from "../_crawler/registry/sources.js";
import { createMongoRepo } from "../repos/crawlerMongoRepo.js";
import { freshnessLabel } from "../services/freshnessService.js";
import { AuditLog } from "../models/AuditLog.js";
import { hashIp } from "../utils/audit.js";
import { schedulerState } from "../services/crawlerScheduler.js";
import { enqueueRefinementAfterCrawl } from "../services/refinementService.js";
import { syncHospitalResources } from "../services/syncHospitalResources.js";

async function auditCrawlerRun(req, operation, source, dryRun) {
  return AuditLog.create({ user: req.user.id, action: "create", entityType: "CrawlJob",
    entityId: source?._id, ipHash: hashIp(req.ip), requestId: req.id,
    after: { operation, sourceKey: source?.sourceKey || null, dryRun, status: "started" } });
}

async function auditSourceChange(req, before, after) {
  try {
    await AuditLog.create({ user: req.user.id, action: "update", entityType: "DataSource",
      entityId: after._id, before, after, ipHash: hashIp(req.ip), requestId: req.id });
  } catch (error) {
    await DataSource.replaceOne({ _id: before._id }, before);
    throw error;
  }
}

// The crawler ONLY ever acts on its own approved registry entry, keyed by
// sourceKey — never on arbitrary fields from a DB document or user input
// (defense in depth vs. SSRF). Every control handler below resolves the
// registry source by key and refuses anything not in the registry.
function registryFor(sourceKey) {
  return getRegistrySource(sourceKey);
}

// Runs one source through the correct orchestrator (directory vs hospital),
// records a CrawlJob, and updates the DataSource's health fields. Shared by
// run-one, run-all, and retry.
export async function runOne(dataSource, { dryRun = false } = {}) {
  const registrySource = registryFor(dataSource.sourceKey);
  if (!registrySource) return { error: "unknown_source_key" };

  // Merge admin operational overrides (frequency/rate-limit) onto the registry
  // entry without ever letting the DB override url/paths/adapter (security).
  const effective = {
    ...registrySource,
    crawlFrequencyMs: dataSource.crawlFrequencyMs ?? registrySource.crawlFrequencyMs,
    rateLimit: dataSource.rateLimitMs
      ? { ...registrySource.rateLimit, minIntervalMs: dataSource.rateLimitMs }
      : registrySource.rateLimit,
    enabled: dataSource.enabled && registrySource.enabled !== false && registrySource.status !== "blocked",
    sourceState: registrySource.status === "blocked" || registrySource.sourceState === "blocked"
      ? "blocked" : dataSource.enabled ? "enabled" : "disabled",
  };

  const jobDoc = await CrawlJob.create({ source: dataSource._id, status: "running", startedAt: new Date() });
  const repo = createMongoRepo({ job: dryRun ? null : jobDoc._id });
  const job = registrySource.sourceType === "government_directory"
    ? await crawlDirectorySource(effective, { repo, dryRun, verbose: false })
    : await crawlHospitalSource(effective, { repo, dryRun, verbose: false });

  jobDoc.status = job.status;
  jobDoc.startedAt = job.startedAt;
  jobDoc.completedAt = job.completedAt;
  jobDoc.recordsFound = job.recordsFound;
  jobDoc.recordsUpdated = job.recordsUpdated;
  jobDoc.errorMessages = job.errorMessages;
  jobDoc.durationMs = job.durationMs;
  await jobDoc.save();

  // Update source health from the outcome (not on dry-run — that writes nothing).
  if (!dryRun) {
    const patch = { healthStatus: mapHealth(job.status, dataSource) };
    if (job.status === "success") {
      patch.lastSuccessfulFetch = new Date();
      patch.failureCount = 0;
      patch.lastFailureReason = undefined;
    } else if (job.status !== "partial") {
      patch.lastFailedFetch = new Date();
      patch.lastFailureReason = job.errorMessages?.[0] || job.status;
      patch.failureCount = (dataSource.failureCount || 0) + 1;
    }
    await DataSource.findByIdAndUpdate(dataSource._id, patch);
    if (job.status === "success") await syncHospitalResources(dataSource.hospital || null).catch(() => {});
    if (job.status === "success") {
      // Optional, bounded suggestion pass. It never mutates canonical claims;
      // any Gemini error leaves deterministic crawl persistence intact.
      await enqueueRefinementAfterCrawl({ sourceId: dataSource._id, since: jobDoc.startedAt }).catch(() => {});
    }
  }

  return { jobDoc, job };
}

function mapHealth(status, dataSource) {
  if (!dataSource.enabled) return "disabled";
  if (status === "success") return "healthy";
  if (status === "partial") return "warning";
  if (status === "blocked") return "blocked";
  if (status === "parsing_error") return "error";
  return "error";
}

async function isSchedulerPaused() {
  const doc = await CrawlerSetting.findOne({ key: "schedulerPaused" }).lean();
  return Boolean(doc?.value);
}

// ---- READ: dashboard data ------------------------------------------------

// GET /api/crawler/overview — high-level cards + system health (spec §15).
export const getOverview = asyncHandler(async (req, res) => {
  const [sources, jobs, hospitals, facilities, observations, results] = await Promise.all([
    DataSource.find({ sourceKey: { $exists: true } }).lean(),
    CrawlJob.find().sort({ createdAt: -1 }).limit(200).lean(),
    Hospital.countDocuments(),
    HospitalFacility.countDocuments(),
    AvailabilityObservation.countDocuments(),
    CrawlResult.find().lean(),
  ]);

  const active = sources.filter((s) => s.enabled).length;
  const blocked = sources.filter((s) => s.healthStatus === "blocked").length;
  const healthy = sources.filter((s) => s.healthStatus === "healthy").length;

  const byStatus = (st) => jobs.filter((j) => j.status === st).length;
  const durations = jobs.filter((j) => j.durationMs).map((j) => j.durationMs);
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const successJobs = byStatus("success");
  const successRate = jobs.length ? Math.round((successJobs / jobs.length) * 100) : 0;
  const lastJob = jobs[0];

  const rejected = results.filter((r) => r.valid === false).length;
  const anomalies = results.filter((r) => (r.validationErrors || []).includes("PARSING_ANOMALY")).length;

  res.json({
    cards: {
      totalSources: sources.length,
      activeSources: active,
      blockedSources: blocked,
      healthySources: healthy,
      hospitalsTracked: hospitals,
      facilitiesTracked: facilities,
      observations,
      recordsRejected: rejected,
      parsingAnomalies: anomalies,
      failedJobs: byStatus("failed") + byStatus("blocked"),
      successfulJobs: successJobs,
      partialJobs: byStatus("partial"),
    },
    system: {
      lastGlobalCrawl: lastJob?.completedAt || lastJob?.createdAt || null,
      crawlerRuntimeJobs: jobs.length,
      successRate,
      avgCrawlDurationMs: avgDuration,
      schedulerPaused: await isSchedulerPaused(),
      schedulerConfigured: schedulerState().configured,
      scheduler: schedulerState(),
    },
  });
});

// GET /api/crawler/sources — full source list with health + config (spec §16).
export const listSourcesDetailed = asyncHandler(async (req, res) => {
  const sources = await DataSource.find({ sourceKey: { $exists: true } }).sort({ name: 1 }).lean();
  // Enrich each with its registry entry (paths, type, frequency default) and
  // recent job stats — the registry is authoritative for immutable fields.
  const data = await Promise.all(
    sources.map(async (s) => {
      const reg = registryFor(s.sourceKey) || {};
      const jobs = await CrawlJob.find({ source: s._id }).sort({ createdAt: -1 }).limit(20).lean();
      const last = jobs[0];
      const lastSuccess = jobs.find((j) => j.status === "success");
      const failureCount = jobs.filter((j) => ["failed", "blocked", "parsing_error"].includes(j.status)).length;
      const durations = jobs.filter((j) => j.durationMs).map((j) => j.durationMs);
      const interval = s.crawlFrequencyMs ?? reg.crawlFrequencyMs;
      const nextRun = s.enabled && s.healthStatus !== "blocked" && Number.isFinite(interval)
        ? last?.createdAt ? new Date(new Date(last.createdAt).getTime() + interval) : new Date()
        : null;
      return {
        sourceKey: s.sourceKey,
        name: s.name,
        url: s.url,
        sourceType: reg.sourceType || s.type,
        enabled: s.enabled,
        healthStatus: s.healthStatus,
        robotsStatus: s.robotsStatus || reg.robotsStatus || "unknown",
        reliability: s.reliability,
        crawlFrequencyMs: s.crawlFrequencyMs ?? reg.crawlFrequencyMs,
        rateLimitMs: s.rateLimitMs ?? reg.rateLimit?.minIntervalMs,
        allowedPaths: reg.allowedPaths || [],
        parserVersion: `${reg.adapter || "generic"}-v1`,
        lastSuccessfulCrawl: lastSuccess?.completedAt || s.lastSuccessfulFetch || null,
        lastAttempt: last?.completedAt || last?.createdAt || null,
        nextRun,
        lastFailureReason: last && last.status !== "success" ? (last.errorMessages?.[0] || last.status) : (s.lastFailureReason || null),
        failureCount,
        avgResponseMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
        pagesCrawledLast: last?.pagesVisited ?? null,
        recordsExtractedLast: last?.recordsFound ?? null,
        adminNotes: s.adminNotes || null,
        _id: s._id,
      };
    })
  );
  res.json({ data, schedulerPaused: await isSchedulerPaused(), schedulerConfigured: schedulerState().configured });
});

// GET /api/crawler/jobs — recent crawl jobs (newest first).
export const listJobs = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const data = await CrawlJob.find(filter).populate("source", "name type sourceKey").sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ data });
});

// GET /api/crawler/jobs/:id — one job's full detail (spec §17).
export const getJob = asyncHandler(async (req, res) => {
  const job = await CrawlJob.findById(req.params.id).populate("source", "name type sourceKey").lean();
  if (!job) return res.status(404).json({ error: "Job not found" });
  const results = await CrawlResult.find({ job: job._id }).limit(50).lean();
  res.json({ job, results });
});

// GET /api/crawler/results — recent crawl results (provenance).
export const listResults = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const data = await CrawlResult.find().populate("source", "name sourceKey").populate("hospital", "name").sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ data });
});

// GET /api/crawler/data-quality — confidence/freshness distribution + gaps (spec §18).
export const getDataQuality = asyncHandler(async (req, res) => {
  const [facilities, hospitals] = await Promise.all([
    HospitalFacility.find().lean(),
    Hospital.find().lean(),
  ]);
  const now = Date.now();
  const confidence = { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
  const freshness = { RECENT: 0, UPDATED_RECENTLY: 0, STALE: 0, OUTDATED: 0, UNKNOWN: 0 };
  for (const f of facilities) {
    confidence[f.confidence || "UNKNOWN"] = (confidence[f.confidence || "UNKNOWN"] || 0) + 1;
    freshness[freshnessLabel(f.lastUpdated, now)]++;
  }
  // Hospitals missing critical identity fields, or needing verification.
  const missingCritical = hospitals.filter((h) => !h.phone && !h.emergencyPhone).map((h) => ({ _id: h._id, name: h.name, missing: "phone" }));
  const needsVerification = hospitals.filter((h) => h.verificationStatus === "unverified").map((h) => ({ _id: h._id, name: h.name }));
  const staleHospitals = hospitals
    .filter((h) => ["STALE", "OUTDATED"].includes(freshnessLabel(h.updatedAt, now)))
    .map((h) => ({ _id: h._id, name: h.name, freshness: freshnessLabel(h.updatedAt, now) }));

  res.json({
    confidence,
    freshness,
    missingCriticalFields: missingCritical.slice(0, 50),
    needsVerification: needsVerification.slice(0, 50),
    staleHospitals: staleHospitals.slice(0, 50),
  });
});

// GET /api/crawler/verification-queue — hospitals awaiting admin verification.
export const getVerificationQueue = asyncHandler(async (req, res) => {
  const data = await Hospital.find({ verificationStatus: { $in: ["unverified", "pending"] } })
    .select("name locality city pincode phone verificationStatus sourceIds updatedAt")
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  res.json({ data });
});

// ---- WRITE: admin controls (registry-approved sources only) --------------

// POST /api/crawler/run?sourceId= — crawl ONE approved source (dryRun optional).
export const runCrawl = asyncHandler(async (req, res) => {
  const dataSource = await DataSource.findById(req.query.sourceId || req.body.sourceId);
  if (!dataSource) return res.status(404).json({ error: "Source not found" });
  if (!dataSource.sourceKey) return res.status(400).json({ error: "Not a crawler source" });
  if (!registryFor(dataSource.sourceKey)) return res.status(400).json({ error: "Unknown crawler source key" });
  if (await isSchedulerPaused() && !(String(req.query.force) === "true")) {
    // Manual run-now is still allowed while paused, but flag it.
  }
  const dryRun = String(req.query.dryRun || req.body.dryRun) === "true";
  const audit = await auditCrawlerRun(req, "run", dataSource, dryRun);
  const { jobDoc, job, error } = await runOne(dataSource, { dryRun });
  await AuditLog.updateOne({ _id: audit._id }, { $set: { "after.status": error || job.status, "after.jobId": jobDoc?._id || null } });
  if (error) return res.status(400).json({ error });
  res.status(202).json({
    job: jobDoc.toObject(),
    classification: job.classification,
    anomaly: job.anomaly,
    confidence: job.confidence,
    changedFields: job.changedFields,
    record: dryRun ? job.record : undefined,
  });
});

// POST /api/crawler/run-all — crawl every ENABLED approved source in sequence.
// Resilient: one source failing never stops the others (spec §23).
export const runAll = asyncHandler(async (req, res) => {
  const dryRun = String(req.query.dryRun || req.body.dryRun) === "true";
  const sources = await DataSource.find({ sourceKey: { $exists: true }, enabled: true });
  const audit = await auditCrawlerRun(req, "run-all", null, dryRun);
  const results = [];
  for (const ds of sources) {
    try {
      const { job } = await runOne(ds, { dryRun });
      results.push({ sourceKey: ds.sourceKey, status: job.status, recordsFound: job.recordsFound });
    } catch (e) {
      results.push({ sourceKey: ds.sourceKey, status: "failed", error: e.message });
    }
  }
  const good = results.filter((r) => r.status === "success").length;
  const overall = good === results.length ? "success" : good === 0 ? "failed" : "partial";
  await AuditLog.updateOne({ _id: audit._id }, { $set: { "after.status": overall, "after.sourceKeys": sources.map((source) => source.sourceKey) } });
  res.status(202).json({ overall, count: results.length, results });
});

// PATCH /api/crawler/sources/:sourceKey — enable/disable, frequency, rate-limit,
// reliability, notes. Registry-approved sources only; url/paths/adapter are
// NEVER editable here (security: no arbitrary-URL crawling from the UI).
export const updateSource = asyncHandler(async (req, res) => {
  const { sourceKey } = req.params;
  const registrySource = registryFor(sourceKey);
  if (!registrySource) return res.status(400).json({ error: "Unknown crawler source key" });
  const ds = await DataSource.findOne({ sourceKey });
  if (!ds) return res.status(404).json({ error: "Source not found" });
  const before = ds.toObject();

  const { enabled, crawlFrequencyMs, rateLimitMs, reliability, adminNotes } = req.body;
  if (enabled === true && (registrySource.enabled === false || registrySource.status === "blocked" || registrySource.sourceState === "blocked")) {
    return res.status(409).json({ error: "Source is blocked in the approved registry" });
  }
  if (enabled !== undefined) {
    ds.enabled = Boolean(enabled);
    ds.healthStatus = ds.enabled ? (ds.healthStatus === "disabled" ? "unknown" : ds.healthStatus) : "disabled";
  }
  // Frequency floor of 1 min — never seconds-level (anti-abuse, spec §12).
  if (crawlFrequencyMs !== undefined) {
    const n = Number(crawlFrequencyMs);
    if (!Number.isFinite(n) || n < 60000) return res.status(400).json({ error: "crawlFrequencyMs must be >= 60000 (1 min)" });
    ds.crawlFrequencyMs = n;
  }
  if (rateLimitMs !== undefined) {
    const n = Number(rateLimitMs);
    if (!Number.isFinite(n) || n < 1000) return res.status(400).json({ error: "rateLimitMs must be >= 1000 (1s)" });
    ds.rateLimitMs = n;
  }
  if (reliability !== undefined) {
    const n = Number(reliability);
    if (!Number.isFinite(n) || n < 0 || n > 1) return res.status(400).json({ error: "reliability must be 0..1" });
    ds.reliability = n;
  }
  if (adminNotes !== undefined) ds.adminNotes = String(adminNotes).slice(0, 500);
  await ds.save();
  await auditSourceChange(req, before, ds.toObject());
  res.json({ source: ds.toObject() });
});

// POST /api/crawler/sources/:sourceKey/reset — clear failure state back to
// a clean "unknown/enabled" standing (e.g. after a transient outage clears).
export const resetSource = asyncHandler(async (req, res) => {
  const { sourceKey } = req.params;
  if (!registryFor(sourceKey)) return res.status(400).json({ error: "Unknown crawler source key" });
  const before = await DataSource.findOne({ sourceKey }).lean();
  if (!before) return res.status(404).json({ error: "Source not found" });
  const ds = await DataSource.findOneAndUpdate(
    { sourceKey },
    { healthStatus: "unknown", failureCount: 0, lastFailureReason: undefined },
    { new: true }
  );
  if (!ds) return res.status(404).json({ error: "Source not found" });
  await auditSourceChange(req, before, ds.toObject());
  res.json({ source: ds.toObject() });
});

// POST /api/crawler/jobs/:id/retry — re-run the source behind a failed job.
export const retryJob = asyncHandler(async (req, res) => {
  const job = await CrawlJob.findById(req.params.id).lean();
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (["success"].includes(job.status)) return res.status(400).json({ error: "Job already succeeded; nothing to retry" });
  const ds = await DataSource.findById(job.source);
  if (!ds) return res.status(404).json({ error: "Source for job not found" });
  const audit = await auditCrawlerRun(req, "retry", ds, false);
  const { jobDoc, job: newJob, error } = await runOne(ds, { dryRun: false });
  await AuditLog.updateOne({ _id: audit._id }, { $set: { "after.status": error || newJob.status, "after.jobId": jobDoc?._id || null,
    "after.retryOf": job._id } });
  if (error) return res.status(400).json({ error });
  res.status(202).json({ job: jobDoc.toObject(), status: newJob.status });
});

// No automatic worker is started by server.js today. An operational API must
// not pretend that toggling a stored flag pauses/resumes real scheduled jobs.
export const setScheduler = asyncHandler(async (req, res) => {
  if (!schedulerState().configured) return res.status(409).json({ error: "Set CRAWLER_SCHEDULER_ENABLED=true and restart to enable scheduling" });
  const before = await isSchedulerPaused();
  const paused = Boolean(req.body.paused);
  await CrawlerSetting.findOneAndUpdate({ key: "schedulerPaused" }, { value: paused }, { upsert: true });
  await AuditLog.create({ user: req.user.id, action: "update", entityType: "CrawlerSetting",
    before: { paused: before }, after: { paused }, requestId: req.id });
  res.json({ paused, scheduler: schedulerState() });
});
