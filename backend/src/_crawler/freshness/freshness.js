// Freshness for the crawler side — mirrors packages/core/src/freshness.js so the
// backend and crawler agree on thresholds. Deterministic; never guesses.

export const THRESHOLDS_MS = {
  RECENT: 10 * 60 * 1000,
  UPDATED_RECENTLY: 60 * 60 * 1000,
  STALE: 6 * 60 * 60 * 1000,
};

export function freshnessLabel(timestamp, now = Date.now()) {
  if (!timestamp) return "UNKNOWN";
  const t = new Date(timestamp).getTime();
  if (!isFinite(t)) return "UNKNOWN";
  const age = now - t;
  if (age < THRESHOLDS_MS.RECENT) return "RECENT";
  if (age < THRESHOLDS_MS.UPDATED_RECENTLY) return "UPDATED_RECENTLY";
  if (age < THRESHOLDS_MS.STALE) return "STALE";
  return "OUTDATED";
}
