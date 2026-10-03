// Runner — crawls a single approved source through the full pipeline and returns
// a CrawlJob-shaped outcome plus scored confidence per facility. Pure orchestration:
// persistence is the backend's job (the runner just produces the record).

import { adapterFor, isCrawlable } from "./registry.js";
import { confidenceLevel } from "./confidence/confidence.js";

export async function crawlSource(source, deps = {}) {
  const startedAt = new Date();
  const gate = isCrawlable(source);
  if (!gate.ok) {
    return {
      source: source?._id, status: gate.reason === "disabled" ? "blocked" : "blocked",
      startedAt, completedAt: new Date(), recordsFound: 0, recordsUpdated: 0,
      errorMessages: [`not_crawlable:${gate.reason}`], durationMs: 0,
    };
  }

  const adapter = adapterFor(source, deps);
  const outcome = await adapter.run();

  if (!outcome.ok) {
    const blocked = ["robots_disallowed", "unsafe_dns_destination", "unsafe_redirect", "offsite_blocked", "path_not_allowed", "private_or_local_host"].includes(outcome.reason);
    const statusByStage = { fetch: blocked ? "blocked" : outcome.reason === "rate_limited" ? "rate_limited" : "failed",
      parse: "parsing_error", validate: "partial" };
    return {
      source: source._id, status: statusByStage[outcome.stage] || "failed",
      startedAt, completedAt: new Date(), recordsFound: 0, recordsUpdated: 0,
      errorMessages: [outcome.reason], durationMs: outcome.durationMs,
    };
  }

  // Score confidence for each facility observation deterministically.
  const observedAt = outcome.result.availability.observedAt || startedAt.toISOString();
  const facilities = outcome.result.availability.facilities.map((f) => ({
    ...f,
    confidence: confidenceLevel({
      sourceType: source.type, timestamp: observedAt,
      verified: false, parseQuality: outcome.parseQuality,
    }),
  }));

  return {
    source: source._id, status: "success",
    startedAt, completedAt: new Date(),
    recordsFound: facilities.length, recordsUpdated: facilities.length,
    errorMessages: [], durationMs: outcome.durationMs,
    result: { hospital: outcome.result.hospital, observedAt, facilities },
  };
}
