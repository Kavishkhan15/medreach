// Validates a NORMALIZED crawler record before persistence (spec §13).
// Rejects malformed data; reports parseQuality so confidence can be scored.
// Pure + deterministic. Treats all values as untrusted input.

const CANONICAL_FACILITIES = new Set([
  "ICU", "NICU", "PICU", "CCU", "Trauma ICU",
  "Emergency Department", "Trauma Center", "Cardiology", "Neurology", "Pediatrics",
  "Maternity", "Burns Unit", "Blood Bank", "Dialysis", "CT", "MRI", "Ventilator", "Operating Theatre",
  "Pharmacy", "Ambulance",
]);
const CAPABILITY_VALUES = new Set(["yes", "no", "unknown"]);
const AVAILABILITY_VALUES = new Set(["available", "limited", "unavailable", "unknown"]);

// Indian phone numbers (and generic intl): 6–15 digits, optional leading +.
export function isValidPhone(v) {
  if (v == null) return true; // absent is allowed (unknown)
  return /^\+?\d{6,15}$/.test(String(v));
}

export function isValidUrl(v) {
  if (v == null) return true;
  try {
    const u = new URL(String(v));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidPincode(v) {
  if (v == null) return true;
  return /^\d{6}$/.test(String(v)); // Indian PIN
}

export function validateNormalizedRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object") {
    return { valid: false, errors: ["record_missing"], parseQuality: 0 };
  }

  const h = record.hospital || {};
  // Hospital name is mandatory — without it we cannot attribute anything.
  if (!h.name || String(h.name).trim().length < 3) errors.push("invalid_hospital_name");
  if (!isValidPhone(h.phone)) errors.push("invalid_phone");
  if (!isValidPhone(h.emergencyPhone)) errors.push("invalid_emergency_phone");
  if (!isValidUrl(h.website)) errors.push("invalid_website_url");
  if (!isValidPincode(h.pincode)) errors.push("invalid_pincode");
  if (h.latitude != null && (typeof h.latitude !== "number" || h.latitude < -90 || h.latitude > 90)) errors.push("invalid_latitude");
  if (h.longitude != null && (typeof h.longitude !== "number" || h.longitude < -180 || h.longitude > 180)) errors.push("invalid_longitude");

  // Facilities: canonical names + enum-gated capability/availability.
  const facilities = record.facilities || [];
  for (const f of facilities) {
    if (!CANONICAL_FACILITIES.has(f.facility)) errors.push(`unknown_facility:${f.facility}`);
    if (!CAPABILITY_VALUES.has(f.capability)) errors.push(`bad_capability:${f.capability}`);
    if (!AVAILABILITY_VALUES.has(f.availability)) errors.push(`bad_availability:${f.availability}`);
    // Static-site crawls must never claim live availability.
    if (f.availability !== "unknown") errors.push(`availability_must_be_unknown:${f.facility}`);
    // Never fabricate quantities.
    if (f.quantity != null) errors.push(`unexpected_quantity:${f.facility}`);
  }

  // Provenance is mandatory (spec §14).
  const p = record.provenance || {};
  if (!p.sourceId) errors.push("missing_provenance_sourceId");
  if (!p.collectionMethod) errors.push("missing_provenance_collectionMethod");
  if (!p.parserVersion) errors.push("missing_provenance_parserVersion");

  // Timestamp must be a valid date.
  const t = new Date(record.retrievedAt).getTime();
  if (!isFinite(t)) errors.push("invalid_retrievedAt");

  // parseQuality: how much of the expected shape we actually extracted (0..1).
  const signals = [
    Boolean(h.name), Boolean(h.address || h.locality), Boolean(h.phone || h.emergencyPhone),
    facilities.length > 0, (record.specialties || []).length > 0,
    record.emergency?.hasEmergencyDept === "yes",
  ];
  const parseQuality = signals.filter(Boolean).length / signals.length;

  return { valid: errors.length === 0, errors, parseQuality };
}

// Validates ONE directory listing (government_directory sources produce many
// of these per crawl — see DirectoryAdapter/crawlDirectorySource). Much
// lighter than validateNormalizedRecord since a listing carries only identity
// fields, never facility/availability data.
export function validateDirectoryListing(listing) {
  const errors = [];
  if (!listing || typeof listing !== "object") return { valid: false, errors: ["listing_missing"] };
  if (!listing.name || String(listing.name).trim().length < 3) errors.push("invalid_name");
  if (!isValidPincode(listing.pincode)) errors.push("invalid_pincode");
  if (!isValidPhone(listing.phone)) errors.push("invalid_phone");
  if (listing.officialWebsite != null && !isValidUrl(listing.officialWebsite)) errors.push("invalid_website_url");
  if (listing.latitude != null && (typeof listing.latitude !== "number" || listing.latitude < -90 || listing.latitude > 90)) errors.push("invalid_latitude");
  if (listing.longitude != null && (typeof listing.longitude !== "number" || listing.longitude < -180 || listing.longitude > 180)) errors.push("invalid_longitude");
  return { valid: errors.length === 0, errors };
}
