// Validates a normalized crawl result before it is allowed to become a
// CrawlResult / AvailabilityObservation. Also detects likely source structure
// changes (e.g. everything parsed empty) so we can alert instead of silently
// ingesting garbage.

const CANON_STATUS = new Set(["available", "limited", "unavailable", "unknown"]);

export function validateResult({ hospital = {}, availability = {} } = {}) {
  const errors = [];
  const facilities = availability.facilities || [];

  if (!hospital.name && facilities.length === 0) {
    errors.push("empty_result"); // nothing parsed — likely a structure change
  }
  for (const f of facilities) {
    if (!f.facility) errors.push("facility_missing_name");
    if (!CANON_STATUS.has(f.status)) errors.push(`bad_status:${f.status}`);
  }
  // Structure-change heuristic: many facilities but ALL unknown → suspicious parse.
  if (facilities.length >= 3 && facilities.every((f) => f.status === "unknown")) {
    errors.push("all_unknown_possible_structure_change");
  }

  const parseQuality =
    facilities.length === 0 ? 0 :
    facilities.filter((f) => f.status !== "unknown").length / facilities.length;

  return { valid: errors.length === 0, errors, parseQuality };
}
