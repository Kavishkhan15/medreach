// Framework-free constants shared by all variants. Mirrors backend/src/config/constants.js
// (values only). NO Bootstrap/Tailwind/Skeleton classes may ever appear in this package.

export const HOSPITAL_TYPES = ["Government", "Private", "Trust", "Municipal", "Teaching", "Specialty"];

export const FACILITY_TYPES = [
  "ICU", "NICU", "PICU", "CCU", "Trauma ICU",
  "Emergency Department", "Trauma Center", "Cardiology", "Neurology",
  "Pediatrics", "Maternity", "Burns Unit", "Blood Bank", "Dialysis", "CT", "MRI",
  "Ventilator", "Operating Theatre", "Pharmacy", "Ambulance",
];

export const AVAILABILITY_STATUS = ["available", "limited", "unavailable", "unknown"];

export const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "nearest", label: "Nearest" },
  { value: "suitable", label: "Most suitable" },
  { value: "updated", label: "Recently updated" },
];

// Mumbai localities for manual location selection (privacy-friendly alternative to GPS).
export const MUMBAI_LOCALITIES = [
  "Andheri", "Bandra", "Borivali", "Colaba", "Dadar", "Ghatkopar", "Goregaon",
  "Juhu", "Kandivali", "Kurla", "Malad", "Mulund", "Powai", "Sion", "Thane", "Vashi", "Worli",
];

export const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"];
export const FRESHNESS_LABELS = ["RECENT", "UPDATED_RECENTLY", "STALE", "OUTDATED", "UNKNOWN"];

export const FRESHNESS_THRESHOLDS_MS = {
  RECENT: 10 * 60 * 1000,
  UPDATED_RECENTLY: 60 * 60 * 1000,
  STALE: 6 * 60 * 60 * 1000,
};
