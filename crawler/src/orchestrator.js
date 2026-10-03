// Orchestrator — runs ONE approved hospital source through the full pipeline and
// returns a CrawlJob-shaped result (spec §18). Resilient by design: a failing
// source never throws; it reports a status the caller aggregates.
//
//   registry gate -> adapter.run() (guardedFetch: robots+SSRF+allowlist)
//     -> validate -> persistence (or dry-run plan) -> CrawlJob
//
// Deterministic, rule-based. NO AI/ML.

import { adapterFor, isCrawlable } from "./registry.js";
import { validateNormalizedRecord } from "./validation/validateRecord.js";
import { PersistenceService } from "./persistence/persistenceService.js";
import { createMemoryRepo } from "./persistence/memoryRepo.js";
import { confidenceLevel } from "./confidence/confidence.js";
import { log } from "./logger.js";

const CRAWL_STATUS = {
  SUCCESS: "success", PARTIAL: "partial", FAILED: "failed",
  BLOCKED: "blocked", RATE_LIMITED: "rate_limited", PARSING_ERROR: "parsing_error",
};

// Map an adapter/fetch failure reason onto a CrawlJob status + source state.
function statusForReason(reason) {
  if (["access_blocked", "unsafe_dns_destination", "unsafe_redirect", "offsite_blocked", "path_not_allowed", "private_or_local_host"].includes(reason)) return { status: CRAWL_STATUS.BLOCKED, sourceState: "blocked" };
  if (reason === "robots_disallowed") return { status: CRAWL_STATUS.BLOCKED, sourceState: "robots_disallowed" };
  if (reason === "rate_limited") return { status: CRAWL_STATUS.RATE_LIMITED, sourceState: "rate_limited" };
  if (reason === "parse_error" || reason === "parsing_error") return { status: CRAWL_STATUS.PARSING_ERROR, sourceState: "parsing_error" };
  if (reason === "no_pages_fetched") return { status: CRAWL_STATUS.FAILED, sourceState: "temporarily_unavailable" };
  return { status: CRAWL_STATUS.FAILED, sourceState: "temporarily_unavailable" };
}

export async function crawlHospitalSource(source, opts = {}) {
  const { deps = {}, repo = createMemoryRepo(), dryRun = false, verbose = false } = opts;
  const startedAt = new Date();
  const job = {
    sourceId: source?.sourceId ?? null,
    startedAt,
    completedAt: null,
    status: CRAWL_STATUS.FAILED,
    sourceState: source?.sourceState ?? "enabled",
    pagesVisited: 0,
    recordsFound: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
    recordsRejected: 0,
    changedFields: [],
    errorMessages: [],
    durationMs: 0,
    retryCount: 0,
    confidence: "UNKNOWN",
    dryRun,
  };

  // 1. Registry/SSRF gate — only approved, enabled sources.
  const gate = isCrawlable(source);
  if (!gate.ok) {
    job.status = CRAWL_STATUS.BLOCKED;
    job.sourceState = gate.reason === "disabled" ? "disabled" : gate.reason;
    job.errorMessages.push(`not_crawlable:${gate.reason}`);
    job.completedAt = new Date();
    job.durationMs = job.completedAt - startedAt;
    return job;
  }

  if (verbose) log.crawl(`Source: ${source.name}`, { sourceId: source.sourceId });

  // 2. Adapter (fetch + parse + normalize). Never throws.
  const adapter = adapterFor(source, deps);
  const out = await adapter.run();
  job.pagesVisited = out.pagesVisited || 0;
  for (const p of out.pageResults || []) {
    if (verbose) log.fetch(`${p.page} → ${p.ok ? "ok" : p.reason}`, { status: p.status });
    if (!p.ok && p.reason) job.errorMessages.push(`${p.page}:${p.reason}`);
  }

  if (!out.ok) {
    const mapped = statusForReason(out.reason);
    job.status = mapped.status;
    job.sourceState = mapped.sourceState;
    job.errorMessages.push(out.reason || "unknown_failure");
    job.completedAt = new Date();
    job.durationMs = job.completedAt - startedAt;
    return job;
  }

  // 3. Validate the normalized record.
  const validation = validateNormalizedRecord(out.record);
  if (verbose) log.validate(validation.valid ? "passed" : `failed: ${validation.errors.join(",")}`);
  if (!validation.valid) {
    job.status = CRAWL_STATUS.PARSING_ERROR;
    job.sourceState = "parsing_error";
    job.recordsRejected = 1;
    job.errorMessages.push(...validation.errors);
    job.completedAt = new Date();
    job.durationMs = job.completedAt - startedAt;
    return job;
  }

  job.recordsFound = out.record.facilities.length + out.record.specialties.length;
  job.confidence = confidenceLevel({
    sourceType: source.sourceType,
    timestamp: out.record.retrievedAt,
    verified: false,
    parseQuality: validation.parseQuality,
  });

  // 4. Persist (or plan only when dry-run).
  const svc = new PersistenceService(repo);
  const applied = await svc.apply(out.record, { source, dryRun });
  job.recordsCreated = applied.recordsCreated;
  job.recordsUpdated = applied.recordsUpdated;
  job.recordsSkipped = applied.recordsSkipped;
  job.recordsRejected += applied.recordsRejected;
  job.changedFields = applied.changedFields;
  job.classification = applied.classification;
  job.anomaly = applied.anomaly;
  job.record = out.record;

  if (applied.anomaly) {
    // Parser anomaly: previous data kept, admin review required (spec §25/§26).
    job.status = CRAWL_STATUS.PARTIAL;
    job.sourceState = "parsing_error";
    job.errorMessages.push("PARSING_ANOMALY: suspicious field drop — previous data kept");
  } else if (job.errorMessages.length > 0) {
    job.status = CRAWL_STATUS.PARTIAL; // some pages failed but we got a record
  } else {
    job.status = CRAWL_STATUS.SUCCESS;
  }

  if (verbose) log.persist(`${applied.classification}${dryRun ? " (dry-run, no writes)" : ""}`, { observations: applied.observationsAdded });

  job.completedAt = new Date();
  job.durationMs = job.completedAt - startedAt;
  return job;
}

export { CRAWL_STATUS };

// crawlDirectorySource — parallel to crawlHospitalSource() but for
// government_directory sources, which describe MANY hospitals from ONE page.
// Cannot reuse PersistenceService.apply() (built for exactly one hospital per
// source); uses DirectoryPersistenceService instead. Same resilience contract:
// never throws, always returns a CrawlJob-shaped result the caller aggregates.
import { DirectoryPersistenceService } from "./persistence/directoryPersistenceService.js";
import { validateDirectoryListing } from "./validation/validateRecord.js";

export async function crawlDirectorySource(source, opts = {}) {
  const { deps = {}, repo = createMemoryRepo(), dryRun = false, verbose = false } = opts;
  const startedAt = new Date();
  const job = {
    sourceId: source?.sourceId ?? null,
    startedAt,
    completedAt: null,
    status: CRAWL_STATUS.FAILED,
    sourceState: source?.sourceState ?? "enabled",
    pagesVisited: 0,
    recordsFound: 0, // listingsFound
    recordsCreated: 0, // hospitalsCreated
    recordsUpdated: 0, // hospitalsLinked (existing hospital gained this source)
    recordsSkipped: 0,
    recordsRejected: 0,
    changedFields: [],
    errorMessages: [],
    durationMs: 0,
    retryCount: 0,
    confidence: "UNKNOWN",
    dryRun,
    usedFallbackParser: false,
  };

  const gate = isCrawlable(source);
  if (!gate.ok) {
    job.status = CRAWL_STATUS.BLOCKED;
    job.sourceState = gate.reason === "disabled" ? "disabled" : gate.reason;
    job.errorMessages.push(`not_crawlable:${gate.reason}`);
    job.completedAt = new Date();
    job.durationMs = job.completedAt - startedAt;
    return job;
  }

  if (verbose) log.crawl(`Directory source: ${source.name}`, { sourceId: source.sourceId });

  const adapter = adapterFor(source, deps);
  const out = await adapter.run();
  job.pagesVisited = out.pagesVisited || 0;
  for (const p of out.pageResults || []) {
    if (verbose) log.fetch(`${p.page} → ${p.ok ? "ok" : p.reason}`, { status: p.status });
    if (!p.ok && p.reason) job.errorMessages.push(`${p.page}:${p.reason}`);
  }

  if (!out.ok) {
    const mapped = statusForReason(out.reason);
    job.status = mapped.status;
    job.sourceState = mapped.sourceState;
    job.errorMessages.push(out.reason || "unknown_failure");
    job.completedAt = new Date();
    job.durationMs = job.completedAt - startedAt;
    return job;
  }

  // Zero listings found (and the loose fallback also found nothing) on a
  // page that fetched successfully is treated as a parsing failure, not "no
  // hospitals today" — a real government directory page always lists some.
  if (!out.listings || out.listings.length === 0) {
    job.status = CRAWL_STATUS.PARSING_ERROR;
    job.sourceState = "parsing_error";
    job.errorMessages.push("zero_listings_extracted");
    job.completedAt = new Date();
    job.durationMs = job.completedAt - startedAt;
    return job;
  }
  job.usedFallbackParser = Boolean(out.usedFallback);

  // Validate each listing; drop invalid ones rather than rejecting the whole crawl.
  const validListings = [];
  for (const listing of out.listings) {
    const v = validateDirectoryListing(listing);
    if (v.valid) validListings.push(listing);
    else { job.recordsRejected++; job.errorMessages.push(`invalid_listing:${listing?.name}:${v.errors.join(",")}`); }
  }

  job.recordsFound = out.listings.length;
  job.confidence = confidenceLevel({
    sourceType: source.sourceType,
    timestamp: out.retrievedAt,
    verified: false,
    parseQuality: job.usedFallbackParser ? 0.4 : 1,
  });

  const svc = new DirectoryPersistenceService(repo);
  const applied = await svc.apply(validListings, { source, dryRun, sourcePageUrl: out.sourcePageUrl, retrievedAt: out.retrievedAt, parserVersion: out.parserVersion, confidence: job.confidence });
  job.recordsCreated = applied.hospitalsCreated;
  job.recordsUpdated = applied.hospitalsLinked;
  job.recordsRejected += applied.listingsRejected;
  job.listings = validListings;

  if (job.usedFallbackParser) {
    // Structural change detected (exact selectors didn't match, loose
    // fallback did) — surface for admin review, per website-change-detection
    // requirement, without discarding the (lower-confidence) data extracted.
    job.status = CRAWL_STATUS.PARTIAL;
    job.sourceState = "parsing_error";
    job.errorMessages.push("SOURCE_CHANGED: exact selectors found nothing, used loose fallback parser");
  } else if (job.errorMessages.length > 0) {
    job.status = CRAWL_STATUS.PARTIAL;
  } else {
    job.status = CRAWL_STATUS.SUCCESS;
  }

  if (verbose) log.persist(`directory: ${applied.hospitalsCreated} created, ${applied.hospitalsLinked} linked${dryRun ? " (dry-run, no writes)" : ""}`);

  job.completedAt = new Date();
  job.durationMs = job.completedAt - startedAt;
  return job;
}
