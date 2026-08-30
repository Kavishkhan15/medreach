// Deterministic, transparent ranking — server-side mirror of packages/core/ranking.
// NO AI/ML. Weighted sum with inspectable reasons. Pure, unit-testable.
export const RANK_WEIGHTS = {
  emergencySuitability: 0.3, specialtyMatch: 0.2, facilityAvailability: 0.2,
  travelEfficiency: 0.2, dataConfidence: 0.1,
};
const AVAIL = { available: 1, limited: 0.5, unavailable: 0, unknown: 0.25 };
const CONF = { HIGH: 1, MEDIUM: 0.66, LOW: 0.33, UNKNOWN: 0 };

function facStatus(h, f) {
  return (h.facilities || []).find((x) => x.facility === f)?.status ?? "unknown";
}

export function scoreHospital(h, { category = null, distanceKm = null } = {}) {
  const reasons = [];
  const ed = facStatus(h, "Emergency Department");
  const emergencySuitability = AVAIL[ed] ?? 0.25;
  if (ed === "available") reasons.push("Emergency department is available");

  let specialtyMatch = 0.5;
  if (category) {
    const specs = new Set(h.specialties || h.departments || []);
    const matched = (category.specialties || []).filter((s) => specs.has(s));
    specialtyMatch = category.specialties?.length ? matched.length / category.specialties.length : 0.5;
    if (matched.length) reasons.push(`Handles ${matched.join(", ")}`);
  }

  let facilityAvailability = 0.5;
  if (category?.facilities?.length) {
    const scores = category.facilities.map((f) => AVAIL[facStatus(h, f)] ?? 0.25);
    facilityAvailability = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  let travelEfficiency = 0.5;
  if (distanceKm != null && isFinite(distanceKm)) {
    travelEfficiency = Math.max(0, 1 - distanceKm / 20);
    reasons.push(`~${distanceKm.toFixed(1)} km away`);
  }

  const confKeys = (h.facilities || []).map((f) => f.confidence).filter(Boolean);
  const dataConfidence = confKeys.length
    ? Math.max(...confKeys.map((k) => CONF[k] ?? 0))
    : h.verificationStatus === "verified" ? 1 : 0.25;

  const score =
    RANK_WEIGHTS.emergencySuitability * emergencySuitability +
    RANK_WEIGHTS.specialtyMatch * specialtyMatch +
    RANK_WEIGHTS.facilityAvailability * facilityAvailability +
    RANK_WEIGHTS.travelEfficiency * travelEfficiency +
    RANK_WEIGHTS.dataConfidence * dataConfidence;

  return { score: +score.toFixed(4), reasons };
}

export function rankHospitals(list, opts = {}) {
  return list.map((h) => ({ ...h, _rank: scoreHospital(h, opts) })).sort((a, b) => b._rank.score - a._rank.score);
}
