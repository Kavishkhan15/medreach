// Deterministic data-confidence engine. Confidence is derived transparently from
// source reliability, recency, verification state, and parsing quality — never a
// blanket "LIVE" label. The calculation is documented in docs/data-model.md.

import { freshnessLabel } from "./freshness.js";

// Reliability weight (0..1) by source type — mirrors backend SOURCE_RELIABILITY.
export const SOURCE_RELIABILITY = {
  official_api: 1.0, government: 0.9, authorized_feed: 0.8,
  hospital_site: 0.6, manual: 0.7, other: 0.3,
};

const FRESH_SCORE = { RECENT: 1, UPDATED_RECENTLY: 0.8, STALE: 0.4, OUTDATED: 0.1, UNKNOWN: 0 };

// Returns "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" from a deterministic score.
export function confidenceLevel({
  sourceType = "other",
  timestamp = null,
  verified = false,
  parseQuality = 1, // 0..1
  now = Date.now(),
} = {}) {
  if (!timestamp) return "UNKNOWN";
  const reliability = SOURCE_RELIABILITY[sourceType] ?? 0.3;
  const label = freshnessLabel(timestamp, now);
  const recency = FRESH_SCORE[label] ?? 0;
  if (recency === 0) return "UNKNOWN";
  // Honesty cap: data older than the STALE window is "old" and can never be
  // reported above LOW, however reliable the historical source.
  if (label === "OUTDATED") return "LOW";
  // Weighted, deterministic composite in [0,1].
  const score =
    0.4 * reliability + 0.3 * recency + 0.2 * (verified ? 1 : 0) + 0.1 * parseQuality;
  if (verified && reliability >= 0.8 && recency >= 0.8) return "HIGH";
  if (score >= 0.75) return "HIGH";
  if (score >= 0.5) return "MEDIUM";
  return "LOW";
}

const CONFIDENCE_META = {
  HIGH: { label: "High confidence", tone: "success", note: "Recently retrieved from a verified source." },
  MEDIUM: { label: "Medium confidence", tone: "warning", note: "Recent, from a recognized source, not directly verified." },
  LOW: { label: "Low confidence", tone: "danger", note: "Old or indirectly collected information." },
  UNKNOWN: { label: "Unknown", tone: "neutral", note: "No reliable current observation." },
};

export function confidenceMeta(input) {
  const key = typeof input === "string" ? input : confidenceLevel(input);
  return { key, ...(CONFIDENCE_META[key] ?? CONFIDENCE_META.UNKNOWN) };
}
