// Normalizers map source-specific raw values onto MedReach's canonical enums.
// Sanitizes strings and coerces status vocabularies to the 4 canonical states.

const FACILITY_TYPES = new Set([
  "ICU", "NICU", "PICU", "CCU", "Trauma ICU",
  "Emergency Department", "Trauma Center", "Cardiology", "Neurology",
  "Pediatrics", "Maternity", "Burns Unit", "Blood Bank", "Dialysis", "CT", "MRI",
  "Ventilator", "Operating Theatre", "Pharmacy", "Ambulance",
]);

const STATUS_MAP = {
  available: "available", open: "available", yes: "available", "1": "available", up: "available",
  limited: "limited", partial: "limited", few: "limited", low: "limited",
  unavailable: "unavailable", full: "unavailable", closed: "unavailable", no: "unavailable", "0": "unavailable", down: "unavailable",
};

const FACILITY_ALIASES = {
  "emergency": "Emergency Department", "er": "Emergency Department", "ed": "Emergency Department",
  "icu": "ICU", "micu": "ICU", "sicu": "ICU", "aicu": "ICU",
  "nicu": "NICU", "neonatal icu": "NICU",
  "picu": "PICU", "paediatric icu": "PICU", "pediatric icu": "PICU",
  "ccu": "CCU", "iccu": "CCU", "cardiac icu": "CCU", "coronary care": "CCU",
  "trauma icu": "Trauma ICU",
  "dialysis": "Dialysis", "hemodialysis": "Dialysis", "haemodialysis": "Dialysis",
  "trauma": "Trauma Center", "cardiac": "Cardiology", "cardiology": "Cardiology",
  "neuro": "Neurology", "neurology": "Neurology", "peds": "Pediatrics", "pediatrics": "Pediatrics",
  "maternity": "Maternity", "burns": "Burns Unit", "blood bank": "Blood Bank",
  "ct": "CT", "mri": "MRI", "ventilator": "Ventilator", "ot": "Operating Theatre",
  "operating theatre": "Operating Theatre", "pharmacy": "Pharmacy", "ambulance": "Ambulance",
};

const clean = (s, max = 200) => (typeof s === "string" ? s.replace(/[<>]/g, "").trim().slice(0, max) : "");

export function normalizeStatus(raw) {
  const key = String(raw ?? "").toLowerCase().trim();
  return STATUS_MAP[key] ?? "unknown";
}

export function normalizeFacilityName(raw) {
  const key = String(raw ?? "").toLowerCase().trim();
  if (FACILITY_ALIASES[key]) return FACILITY_ALIASES[key];
  const titled = clean(raw, 60);
  return FACILITY_TYPES.has(titled) ? titled : null; // unknown facility → dropped by validator
}

export function normalizeHospital(rawObj = {}) {
  return {
    name: clean(rawObj.name, 200),
    phone: clean(rawObj.phone, 40),
    emergencyPhone: clean(rawObj.emergencyPhone, 40),
    website: clean(rawObj.website, 300),
    locality: clean(rawObj.locality, 100),
    city: clean(rawObj.city, 100),
    pincode: clean(rawObj.pincode, 12),
  };
}

export function normalizeFacilities(list = []) {
  const seen = new Set();
  const out = [];
  for (const f of list) {
    const facility = normalizeFacilityName(f.facility);
    if (!facility || seen.has(facility)) continue;
    seen.add(facility);
    out.push({ facility, status: normalizeStatus(f.status) });
  }
  return out;
}

export function normalizeAvailability({ facilities = [], observedAt = null } = {}) {
  const iso = observedAt ? new Date(observedAt) : null;
  return {
    facilities: normalizeFacilities(facilities),
    observedAt: iso && !isNaN(iso.getTime()) ? iso.toISOString() : null,
  };
}
