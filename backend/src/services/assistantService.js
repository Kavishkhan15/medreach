// Assistant service — the ONLY place that decides intent, fetches real hospital
// data, and shapes context for an AI provider. Deterministic, rule-based intent
// detection (no ML). Hospital lookups always go through the same Mongoose
// queries/ranking used by GET /api/hospitals — this file must never invent a
// second hospital dataset or a second ranking algorithm.
import { Hospital } from "../models/Hospital.js";
import { HospitalFacility } from "../models/HospitalFacility.js";
import { AvailabilityObservation } from "../models/AvailabilityObservation.js";
import { latestByFacility } from "./availabilityService.js";
import { relativeTime } from "./freshnessService.js";
import { rankHospitals } from "./rankingService.js";
import { getAiProvider } from "./aiProviders/index.js";

// Mirrors packages/core/src/emergency.js EMERGENCY_CATEGORIES ids/specialties
// (values only — see that file for the authoritative definitions and the
// "NOT diagnosis" annotation this mirrors). Used only to route a free-text
// query toward the right specialty/facility filter, exactly like the existing
// EmergencyCategorySelector UI already does client-side.
const EMERGENCY_CATEGORY_KEYWORDS = {
  cardiac: { keywords: ["cardiac", "heart", "chest pain", "cardiology"], specialties: ["Cardiology"], facilities: ["Cardiology", "ICU"] },
  stroke: { keywords: ["stroke", "neuro", "brain"], specialties: ["Neurology"], facilities: ["Neurology", "CT", "ICU"] },
  trauma: { keywords: ["trauma", "accident", "injury", "bleeding"], specialties: ["Trauma", "Surgery"], facilities: ["Trauma Center", "Blood Bank"] },
  burns: { keywords: ["burn", "burns"], specialties: ["Surgery"], facilities: ["Burns Unit"] },
  respiratory: { keywords: ["breath", "respiratory", "asthma", "oxygen"], specialties: ["General Medicine"], facilities: ["Ventilator", "ICU"] },
  pediatric: { keywords: ["child", "infant", "baby", "pediatric", "paediatric"], specialties: ["Pediatrics"], facilities: ["Pediatrics"] },
  maternity: { keywords: ["pregnan", "labour", "labor", "maternity", "delivery"], specialties: ["Maternity"], facilities: ["Maternity", "Operating Theatre"] },
  icu: { keywords: ["icu", "intensive care", "critical care"], specialties: [], facilities: ["ICU"] },
};

// Deterministic, keyword-based emergency detection — checked FIRST, always,
// before any hospital-search or general intent. No ML, no ambiguity.
const EMERGENCY_KEYWORDS = [
  "unconscious", "not breathing", "not responding", "collapsed", "seizure",
  "severe bleeding", "heavy bleeding", "chest pain", "heart attack", "stroke",
  "can't breathe", "cannot breathe", "choking", "overdose", "suicide",
  "dying", "critical condition", "unresponsive", "cardiac arrest",
];

const MUMBAI_LOCALITIES = [
  "Andheri", "Bandra", "Powai", "Dadar", "Worli", "Goregaon", "Malad",
  "Borivali", "Kurla", "Ghatkopar", "Chembur", "Thane", "Navi Mumbai",
  "Colaba", "Juhu", "Kandivali", "Mulund", "Sion", "Vashi",
];

export function detectEmergencyIntent(message) {
  const lower = message.toLowerCase();
  return EMERGENCY_KEYWORDS.some((kw) => lower.includes(kw));
}

function detectLocality(message) {
  const lower = message.toLowerCase();
  return MUMBAI_LOCALITIES.find((loc) => lower.includes(loc.toLowerCase())) || null;
}

function detectCategory(message) {
  const lower = message.toLowerCase();
  for (const [id, def] of Object.entries(EMERGENCY_CATEGORY_KEYWORDS)) {
    if (def.keywords.some((kw) => lower.includes(kw))) return { id, ...def };
  }
  return null;
}

const HOSPITAL_SEARCH_KEYWORDS = ["hospital", "find", "near", "nearest", "search", "where"];

export function detectHospitalSearchIntent(message) {
  const lower = message.toLowerCase();
  return HOSPITAL_SEARCH_KEYWORDS.some((kw) => lower.includes(kw)) || detectCategory(message) != null;
}

// Classifies the message into exactly one of: emergency | hospital_search | general.
// Emergency is checked first and always wins — spec requirement, not a heuristic.
export function classifyIntent(message) {
  if (detectEmergencyIntent(message)) return "emergency";
  if (detectHospitalSearchIntent(message)) return "hospital_search";
  return "general";
}

// Builds a hospital summary using ONLY real DB data — never fabricates a
// field. distanceKm/matchedFacilities/facilityDetail are omitted (not null-
// filled with fake values) when we have no basis to compute them.
async function summarizeHospital(hospital, { origin, category } = {}) {
  const facilities = await HospitalFacility.find({ hospital: hospital._id }).lean();
  const matchedFacilities = category?.facilities?.length
    ? facilities.filter((f) => category.facilities.includes(f.facility)).map((f) => f.facility)
    : [];

  const summary = {
    id: String(hospital._id),
    slug: hospital.slug,
    name: hospital.name,
    locality: hospital.locality || hospital.city || null,
    specialties: hospital.specialties || hospital.departments || [],
    matchedFacilities,
    verificationStatus: hospital.verificationStatus,
    phone: hospital.emergencyPhone || hospital.phone || null,
    coordinates: hospital.location?.coordinates?.some((v) => v !== 0) ? hospital.location.coordinates : null,
  };

  if (origin && hospital.location?.coordinates?.some((v) => v !== 0)) {
    const [lng, lat] = hospital.location.coordinates;
    const R = 6371;
    const dLat = ((lat - origin.lat) * Math.PI) / 180;
    const dLng = ((lng - origin.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((origin.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    summary.distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Surface ONE representative facility's real status/confidence/freshness —
  // whichever category-relevant facility has the most recent observation.
  const relevantFacility = matchedFacilities[0] || facilities[0]?.facility;
  if (relevantFacility) {
    const obs = await AvailabilityObservation.find({ hospital: hospital._id, facility: relevantFacility })
      .sort({ retrievedAt: -1 }).limit(1).lean();
    const latest = latestByFacility(obs)[0];
    const fac = facilities.find((f) => f.facility === relevantFacility);
    summary.facilityDetail = {
      facility: relevantFacility,
      status: latest?.status ?? fac?.status ?? "unknown",
      confidence: latest?.confidence ?? fac?.confidence ?? "UNKNOWN",
      retrievedAtRelative: latest?.retrievedAt ? relativeTime(latest.retrievedAt) : null,
    };
  }

  return summary;
}

// Runs the SAME kind of query as GET /api/hospitals (text/locality/specialty
// filter), then applies the SAME rankHospitals used by the public API — no
// parallel search implementation.
async function searchHospitalsForAssistant({ locality, category, limit = 3 }) {
  const filter = {};
  if (locality) filter.$or = [{ locality }, { city: locality }];
  if (category?.specialties?.length) {
    filter.$or = (filter.$or || []).concat([
      { specialties: { $in: category.specialties } },
      { departments: { $in: category.specialties } },
    ]);
  }

  const candidates = await Hospital.find(filter).limit(20).lean();
  const ranked = rankHospitals(candidates, { category });
  return ranked.slice(0, limit);
}

// Builds the full context object passed to the active AI provider. This is
// the single choke point where real data enters — providers receive this and
// nothing else about the hospital dataset.
export async function buildContext(message, { origin, locality: providedLocality } = {}) {
  const intent = classifyIntent(message);
  const locality = providedLocality || detectLocality(message);
  const category = detectCategory(message);

  let hospitals = [];
  if (intent === "hospital_search" || intent === "emergency") {
    const ranked = await searchHospitalsForAssistant({ locality, category });
    hospitals = await Promise.all(ranked.map((h) => summarizeHospital(h, { origin, category })));
  }

  return { message, intent, hospitals, locality, category: category?.id ?? null };
}

// Orchestrates: build context -> ask active provider -> fall back to the
// rule-based provider on any provider error, so the chat is never broken.
export async function getAssistantReply(message, options = {}) {
  const context = await buildContext(message, options);
  const provider = getAiProvider();
  try {
    const reply = await provider.generateReply(context);
    return { ...reply, intent: context.intent, hospitals: context.hospitals };
  } catch {
    const { generateReply: ruleBasedReply } = await import("./aiProviders/ruleBasedProvider.js");
    const reply = await ruleBasedReply(context);
    return { ...reply, intent: context.intent, hospitals: context.hospitals, providerFallback: true };
  }
}
