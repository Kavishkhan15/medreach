// Shared search / filter / sort engine. Identical logic for every variant — only
// presentation differs. Works over an in-memory hospital list (fixtures or API
// results) so the same behavior holds in demo and live mode.

import { rankHospitals, scoreHospital } from "./ranking.js";
import { distanceKm } from "./location.js";
import { freshnessLabel } from "./freshness.js";

function facilityStatus(hospital, facility) {
  return (hospital.facilities || []).find((x) => x.facility === facility)?.status ?? "unknown";
}

function matchesQuery(h, q) {
  if (!q) return true;
  const hay = [
    h.name, h.city, h.locality, h.region,
    ...(h.specialties || h.departments || []),
    ...(h.services || []),
    ...((h.facilities || []).map((f) => f.facility)),
  ].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((tok) => hay.includes(tok));
}

// filters: { q, locality, hospitalType, specialty, facilities:[], emergencyOnly, categoryId }
// options: { origin, sort }
export function searchHospitals(list, filters = {}, options = {}) {
  const { q, locality, hospitalType, specialty, facilities = [], emergencyOnly, categoryId } = filters;
  const { origin = null, sort = "recommended" } = options;

  let out = list.filter((h) => {
    if (!matchesQuery(h, q)) return false;
    if (locality && h.locality !== locality && h.city !== locality) return false;
    if (hospitalType && h.hospitalType !== hospitalType) return false;
    if (specialty && !(h.specialties || h.departments || []).includes(specialty)) return false;
    if (emergencyOnly && facilityStatus(h, "Emergency Department") === "unavailable") return false;
    for (const f of facilities) {
      const s = facilityStatus(h, f);
      if (s === "unavailable" || s === "unknown") return false;
    }
    return true;
  });

  // Ranking annotates each with _rank (score, distance, eta, reasons).
  out = rankHospitals(out, { categoryId, origin });

  switch (sort) {
    case "nearest":
      out.sort((a, b) => (a._rank.distanceKm ?? Infinity) - (b._rank.distanceKm ?? Infinity));
      break;
    case "fastest":
      out.sort((a, b) => (a._rank.etaMinutes ?? Infinity) - (b._rank.etaMinutes ?? Infinity));
      break;
    case "updated":
      out.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));
      break;
    case "suitable":
      out.sort((a, b) => b._rank.components.specialtyMatch - a._rank.components.specialtyMatch);
      break;
    case "recommended":
    default:
      // already sorted by rank score
      break;
  }
  return out;
}
