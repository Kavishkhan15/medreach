// Central, deterministic constants for the whole backend. Single source of truth
// for enums and thresholds so models, services, validators, and the crawler stay
// in agreement. NO business logic here — just values. Mirrored (values only) in
// packages/core/src/constants.js for the frontend; keep the two in sync.

// ---- Roles & access ----
export const ROLES = {
  USER: "user",
  HOSPITAL_ADMIN: "hospital_admin",
  SYSTEM_ADMIN: "system_admin",
};
// Legacy "admin" retained so pre-existing seed data / tokens remain valid.
export const LEGACY_ADMIN = "admin";
export const ROLE_VALUES = [ROLES.USER, ROLES.HOSPITAL_ADMIN, ROLES.SYSTEM_ADMIN, LEGACY_ADMIN];
// Any role treated as "an administrator" for RBAC gating.
export const ADMIN_ROLES = [ROLES.HOSPITAL_ADMIN, ROLES.SYSTEM_ADMIN, LEGACY_ADMIN];

export const ACCOUNT_STATUS = ["active", "suspended", "pending"];

// ---- Hospital ----
export const HOSPITAL_TYPES = [
  "Government",
  "Private",
  "Trust",
  "Municipal",
  "Teaching",
  "Specialty",
];

// Verification lifecycle for hospital records and observations.
export const VERIFICATION_STATUS = ["unverified", "pending", "verified", "rejected", "stale"];

// ---- Facilities ----
export const FACILITY_TYPES = [
  "ICU",
  "Emergency Department",
  "Trauma Center",
  "Cardiology",
  "Neurology",
  "Pediatrics",
  "Maternity",
  "Burns Unit",
  "Blood Bank",
  "CT",
  "MRI",
  "Ventilator",
  "Operating Theatre",
  "Pharmacy",
  "Ambulance",
];

// ---- Availability (the volatile signal) ----
// Observation status. NOTE: distinct from the hospital's derived emergencyStatus.
export const AVAILABILITY_STATUS = ["available", "limited", "unavailable", "unknown"];

// Legacy hospital-level emergency status (kept for backward compatibility with
// existing UI/fixtures). "full"/"closed" map onto limited/unavailable semantics.
export const EMERGENCY_STATUS = ["available", "limited", "full", "closed"];

// ---- Data sources ----
export const SOURCE_TYPES = [
  "official_api",
  "hospital_site",
  "government",
  "authorized_feed",
  "manual",
  "other",
];
export const ACCESS_METHODS = ["http_api", "http_html", "feed", "manual"];

// ---- Crawler ----
export const CRAWL_STATUS = [
  "queued",
  "running",
  "success",
  "partial",
  "failed",
  "blocked",
  "rate_limited",
  "parsing_error",
];

// ---- Alerts (infrastructure/system alerts — NOT medical/AI) ----
export const ALERT_SEVERITY = ["info", "warning", "critical"];
export const ALERT_KIND = [
  "crawler_failure",
  "stale_data",
  "source_unavailable",
  "unusual_change",
  "system_failure",
  "public_notice",
];

// ---- Audit ----
export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "verify",
  "reject",
  "override",
  "mark_stale",
  "login",
  "logout",
];

// ---- Freshness thresholds (ms). Configurable via env in freshnessService. ----
export const FRESHNESS_THRESHOLDS_MS = {
  RECENT: 10 * 60 * 1000, // < 10 min
  UPDATED_RECENTLY: 60 * 60 * 1000, // 10–60 min
  STALE: 6 * 60 * 60 * 1000, // 1–6 hr  (beyond → OUTDATED)
};
export const FRESHNESS_LABELS = ["RECENT", "UPDATED_RECENTLY", "STALE", "OUTDATED", "UNKNOWN"];

// ---- Confidence levels (deterministic) ----
export const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"];

// ---- Source reliability weighting (0..1) used by the confidence engine ----
export const SOURCE_RELIABILITY = {
  official_api: 1.0,
  government: 0.9,
  authorized_feed: 0.8,
  hospital_site: 0.6,
  manual: 0.7,
  other: 0.3,
};
