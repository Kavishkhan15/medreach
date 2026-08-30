// Deterministic data-freshness engine. Given a timestamp, returns a fixed label
// and a human phrase. Thresholds are configurable. Never fabricates a state:
// a missing timestamp yields UNKNOWN, not a guess.

import { FRESHNESS_THRESHOLDS_MS } from "./constants.js";

export function freshnessLabel(timestamp, now = Date.now(), thresholds = FRESHNESS_THRESHOLDS_MS) {
  if (!timestamp) return "UNKNOWN";
  const t = new Date(timestamp).getTime();
  if (!isFinite(t)) return "UNKNOWN";
  const age = now - t;
  if (age < 0) return "RECENT";
  if (age < thresholds.RECENT) return "RECENT";
  if (age < thresholds.UPDATED_RECENTLY) return "UPDATED_RECENTLY";
  if (age < thresholds.STALE) return "STALE";
  return "OUTDATED";
}

// Semantic tone per freshness label (variants map tone → their own classes).
const FRESHNESS_META = {
  RECENT: { label: "Recent", tone: "success" },
  UPDATED_RECENTLY: { label: "Updated recently", tone: "success" },
  STALE: { label: "Stale", tone: "warning" },
  OUTDATED: { label: "Outdated", tone: "danger" },
  UNKNOWN: { label: "Unknown", tone: "neutral" },
};

export function freshnessMeta(timestamp, now = Date.now()) {
  const key = freshnessLabel(timestamp, now);
  return { key, ...FRESHNESS_META[key] };
}

// "Updated 4 min ago" / "Last verified 2 hr ago" / "Availability unknown".
export function relativeTime(timestamp, now = Date.now()) {
  if (!timestamp) return "unknown";
  const t = new Date(timestamp).getTime();
  if (!isFinite(t)) return "unknown";
  const secs = Math.max(0, Math.round((now - t) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function freshnessPhrase(timestamp, now = Date.now()) {
  if (!timestamp) return "Availability unknown";
  return `Updated ${relativeTime(timestamp, now)}`;
}
