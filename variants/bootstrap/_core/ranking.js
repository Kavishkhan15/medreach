// Deterministic, transparent, rule-based ranking. NO AI/ML. Every score is a
// documented weighted sum and every result carries human-readable REASONS so a
// user can inspect exactly why a hospital ranked where it did. This never claims
// to be a medical recommendation — wording is "best match based on selected filters".

import { emergencyCategory } from "./emergency.js";
import { distanceKm, estimateEtaMinutes } from "./location.js";

// Weights sum to 1. Documented in docs/architecture.md / data-model.md.
export const RANK_WEIGHTS = {
  emergencySuitability: 0.3,
  specialtyMatch: 0.2,
  facilityAvailability: 0.2,
  travelEfficiency: 0.2,
  dataConfidence: 0.1,
};

const AVAIL_SCORE = { available: 1, limited: 0.5, unavailable: 0, unknown: 0.25 };
const CONF_SCORE = { HIGH: 1, MEDIUM: 0.66, LOW: 0.33, UNKNOWN: 0 };

function facilityStatus(hospital, facility) {
  const f = (hospital.facilities || []).find((x) => x.facility === facility);
  return f?.status ?? "unknown";
}

// Score one hospital for an (optional) emergency category and origin coordinates.
// Returns { score (0..1), reasons: string[], distanceKm, etaMinutes }.
export function scoreHospital(hospital, { categoryId = null, origin = null } = {}) {
  const reasons = [];
  const category = categoryId ? emergencyCategory(categoryId) : null;

  // 1. Emergency suitability — is the ED open?
  const ed = facilityStatus(hospital, "Emergency Department");
  const emergencySuitability = AVAIL_SCORE[ed] ?? 0.25;
  if (ed === "available") reasons.push("Emergency department is available");
  else if (ed === "limited") reasons.push("Emergency department has limited capacity");
  else if (ed === "unavailable") reasons.push("Emergency department is unavailable");

  // 2. Specialty match against the emergency category.
  let specialtyMatch = 0.5;
  if (category) {
    const specs = new Set(hospital.specialties || hospital.departments || []);
    const matched = category.specialties.filter((s) => specs.has(s));
    specialtyMatch = category.specialties.length ? matched.length / category.specialties.length : 0.5;
    if (matched.length) reasons.push(`Handles ${matched.join(", ")}`);
  }

  // 3. Facility availability for the category's required facilities.
  let facilityAvailability = 0.5;
  if (category && category.facilities.length) {
    const scores = category.facilities.map((f) => AVAIL_SCORE[facilityStatus(hospital, f)] ?? 0.25);
    facilityAvailability = scores.reduce((a, b) => a + b, 0) / scores.length;
    const openOnes = category.facilities.filter((f) => facilityStatus(hospital, f) === "available");
    if (openOnes.length) reasons.push(`${openOnes.join(", ")} available`);
  }

  // 4. Travel efficiency (closer/faster = better). Only when origin is known.
  let travelEfficiency = 0.5;
  let dkm = null;
  let eta = null;
  const coords = hospital.location?.coordinates;
  if (origin && coords && (coords[0] || coords[1])) {
    dkm = distanceKm([origin.lng, origin.lat], coords);
    eta = estimateEtaMinutes(dkm);
    // 0 km → 1.0, decays; ~20km → ~0.
    travelEfficiency = Math.max(0, 1 - dkm / 20);
    if (eta != null) reasons.push(`Estimated ${eta} min away (~${dkm.toFixed(1)} km)`);
  }

  // 5. Data confidence (best facility confidence, else hospital verification).
  const confKeys = (hospital.facilities || []).map((f) => f.confidence).filter(Boolean);
  const bestConf = confKeys.length
    ? Math.max(...confKeys.map((k) => CONF_SCORE[k] ?? 0))
    : hospital.verificationStatus === "verified" ? 1 : 0.25;
  const dataConfidence = bestConf;

  const score =
    RANK_WEIGHTS.emergencySuitability * emergencySuitability +
    RANK_WEIGHTS.specialtyMatch * specialtyMatch +
    RANK_WEIGHTS.facilityAvailability * facilityAvailability +
    RANK_WEIGHTS.travelEfficiency * travelEfficiency +
    RANK_WEIGHTS.dataConfidence * dataConfidence;

  return {
    score: +score.toFixed(4),
    reasons,
    distanceKm: dkm,
    etaMinutes: eta,
    components: { emergencySuitability, specialtyMatch, facilityAvailability, travelEfficiency, dataConfidence },
  };
}

// Rank a list; returns hospitals annotated with { _rank } sorted best-first.
export function rankHospitals(hospitals, opts = {}) {
  return hospitals
    .map((h) => ({ ...h, _rank: scoreHospital(h, opts) }))
    .sort((a, b) => b._rank.score - a._rank.score);
}
