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
