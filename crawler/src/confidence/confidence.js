// Confidence for the crawler — mirrors packages/core/src/confidence.js. Derives a
// deterministic HIGH/MEDIUM/LOW/UNKNOWN from source reliability, recency,
// verification, and parse quality. Documented in docs/crawler.md.

import { freshnessLabel } from "../freshness/freshness.js";

export const SOURCE_RELIABILITY = {
  official_api: 1.0, government: 0.9, authorized_feed: 0.8,
  hospital_site: 0.6, manual: 0.7, other: 0.3,
};

const FRESH_SCORE = { RECENT: 1, UPDATED_RECENTLY: 0.8, STALE: 0.4, OUTDATED: 0.1, UNKNOWN: 0 };

export function confidenceLevel({
  sourceType = "other", timestamp = null, verified = false, parseQuality = 1, now = Date.now(),
} = {}) {
  if (!timestamp) return "UNKNOWN";
  const reliability = SOURCE_RELIABILITY[sourceType] ?? 0.3;
  const label = freshnessLabel(timestamp, now);
  const recency = FRESH_SCORE[label] ?? 0;
  if (recency === 0) return "UNKNOWN"; // no usable observation
  // Honesty cap (spec §16/§45): information older than the STALE window is "old",
  // so it can never be reported above LOW no matter how reliable the source is.
  if (label === "OUTDATED") return "LOW";
  const score = 0.4 * reliability + 0.3 * recency + 0.2 * (verified ? 1 : 0) + 0.1 * parseQuality;
  if (verified && reliability >= 0.8 && recency >= 0.8) return "HIGH";
  if (score >= 0.75) return "HIGH";
  if (score >= 0.5) return "MEDIUM";
  return "LOW";
}
