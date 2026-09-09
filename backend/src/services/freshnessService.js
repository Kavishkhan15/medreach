// Deterministic freshness — server-side mirror of packages/core freshness so the
// API and UI agree. Pure function, unit-testable without a DB.
import { FRESHNESS_THRESHOLDS_MS } from "../config/constants.js";

export function freshnessLabel(timestamp, now = Date.now(), t = FRESHNESS_THRESHOLDS_MS) {
  if (!timestamp) return "UNKNOWN";
  const ts = new Date(timestamp).getTime();
  if (!isFinite(ts)) return "UNKNOWN";
  const age = now - ts;
  if (age < t.RECENT) return "RECENT";
  if (age < t.UPDATED_RECENTLY) return "UPDATED_RECENTLY";
  if (age < t.STALE) return "STALE";
  return "OUTDATED";
}

// "4 min ago" / "2 hr ago" / "unknown" — mirrors packages/core/freshness.js
// relativeTime so the assistant's phrasing matches what the UI already shows.
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
