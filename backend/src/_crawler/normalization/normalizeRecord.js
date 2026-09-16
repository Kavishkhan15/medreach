// Assembles the normalized MedReach crawler data contract from parsed parts.
// CRITICAL (spec §9): static hospital pages yield CAPABILITY only. Availability is
// ALWAYS "unknown" here — we never infer live bed counts from marketing pages.

const FACILITY_ALIASES = {
  "critical care": "ICU", "critical care unit": "ICU", "intensive care": "ICU", icu: "ICU",
  micu: "ICU", sicu: "ICU", aicu: "ICU",
  "neonatal icu": "NICU", "neonatal intensive care": "NICU", nicu: "NICU",
  "paediatric icu": "PICU", "pediatric icu": "PICU", picu: "PICU",
  "cardiac icu": "CCU", "coronary care": "CCU", "coronary care unit": "CCU",
  "icccu": "CCU", iccu: "CCU", ccu: "CCU",
  "trauma icu": "Trauma ICU", "trauma intensive care": "Trauma ICU",
  "accident and emergency": "Emergency Department", "accident & emergency": "Emergency Department",
  casualty: "Emergency Department", "emergency department": "Emergency Department", emergency: "Emergency Department",
  "trauma centre": "Trauma Center", "trauma center": "Trauma Center", "trauma care": "Trauma Center",
  "cardiac sciences": "Cardiology", "cardiac care": "Cardiology", cardiology: "Cardiology",
  neurosciences: "Neurology", neurology: "Neurology",
  paediatrics: "Pediatrics", pediatrics: "Pediatrics",
  maternity: "Maternity", "mother and child": "Maternity",
  "burns unit": "Burns Unit", "blood bank": "Blood Bank",
  dialysis: "Dialysis", "renal dialysis": "Dialysis", "haemodialysis": "Dialysis", hemodialysis: "Dialysis",
  ct: "CT", mri: "MRI", ventilator: "Ventilator",
  "operation theatre": "Operating Theatre", "operating theatre": "Operating Theatre",
  pharmacy: "Pharmacy", ambulance: "Ambulance",
};

const CANONICAL_FACILITIES = new Set([
  "ICU", "NICU", "PICU", "CCU", "Trauma ICU",
  "Emergency Department", "Trauma Center", "Cardiology", "Neurology", "Pediatrics",
  "Maternity", "Burns Unit", "Blood Bank", "Dialysis", "CT", "MRI", "Ventilator", "Operating Theatre",
  "Pharmacy", "Ambulance",
]);

export function normalizeFacilityName(raw) {
  if (!raw) return null;
  if (CANONICAL_FACILITIES.has(raw)) return raw;
  return FACILITY_ALIASES[String(raw).toLowerCase().trim()] || null;
}

// Normalize an Indian phone number: keep digits, collapse, keep leading + for intl.
export function normalizePhone(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return null; // implausible
  return cleaned.startsWith("+") ? `+${digits}` : digits;
}

const SPECIALTY_CANON = {
  paediatrics: "Pediatrics", orthopaedics: "Orthopedics", haematology: "Hematology",
  "respiratory medicine": "Pulmonology",
};
export function normalizeSpecialty(raw) {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim();
  if (SPECIALTY_CANON[key]) return SPECIALTY_CANON[key];
  return raw.trim();
}

export function normalizeHospitalType(raw) {
  const t = String(raw || "").toLowerCase();
  if (/government|municipal|civic/.test(t)) return "Government";
  if (/trust|charitable/.test(t)) return "Trust";
  if (/teaching|medical college/.test(t)) return "Teaching";
  if (/private/.test(t)) return "Private";
  return null;
}

// Build the full normalized record (the crawler data contract).
export function normalizeRecord({ hospital = {}, facilities = [], specialties = [], emergency = {}, contacts = {}, fieldEvidence = {}, source, sourceUrl, parserVersion, retrievedAt }) {
  const canonFacilities = [];
  const seen = new Set();
  for (const f of facilities) {
    const name = normalizeFacilityName(f.facility);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    canonFacilities.push({
      facility: name,
      capability: "yes", // present on the page → capability yes
      availability: "unknown", // NEVER inferred from static pages
      evidenceText: typeof f.evidenceText === "string" ? f.evidenceText.slice(0, 200) : null,
      sourcePageUrl: f.sourcePageUrl || sourceUrl || null,
    });
  }
  // If the page establishes an emergency department capability but the facility
  // keyword didn't surface it explicitly, record the ED capability consistently.
  if (emergency.hasEmergencyDept === "yes" && !seen.has("Emergency Department")) {
    seen.add("Emergency Department");
    canonFacilities.push({
      facility: "Emergency Department", capability: "yes", availability: "unknown",
      evidenceText: emergency.evidenceText || null,
      sourcePageUrl: emergency.sourcePageUrl || sourceUrl || null,
    });
  }

  const specs = [...new Set(specialties.map(normalizeSpecialty).filter(Boolean))];

  const phones = (contacts.phones || []).map(normalizePhone).filter(Boolean);
  const emergencyPhone = normalizePhone(emergency.emergencyPhone) || null;

  return {
    hospital: {
      name: hospital.name || (source && source.name) || null,
      description: hospital.description || null,
      hospitalType: normalizeHospitalType(hospital.hospitalType) || (source?.known?.hospitalType ?? null),
      address: hospital.address || null,
      locality: hospital.locality || source?.known?.locality || null,
      city: hospital.city || source?.known?.city || "Mumbai",
      pincode: hospital.pincode || source?.known?.pincode || null,
      latitude: hospital.latitude ?? null,
      longitude: hospital.longitude ?? null,
      phone: normalizePhone(hospital.phone) || phones[0] || null,
      emergencyPhone,
      website: hospital.website || (source && source.baseUrl) || null,
    },
    facilities: canonFacilities,
    specialties: specs,
    emergency: {
      hasEmergencyDept: emergency.hasEmergencyDept || "unknown",
      emergencyPhone,
      // trauma/ambulance derived from facilities (capability), else unknown
      trauma: canonFacilities.some((f) => f.facility === "Trauma Center") ? "yes" : "unknown",
      ambulance: canonFacilities.some((f) => f.facility === "Ambulance") ? "yes" : "unknown",
    },
    contacts: { phones: [...new Set(phones)], emails: contacts.emails || [] },
    fieldEvidence,
    source: { sourceId: source?.sourceId ?? null, sourceUrl: sourceUrl || source?.baseUrl || null },
    provenance: {
      sourceId: source?.sourceId ?? null,
      sourceUrl: source?.baseUrl ?? null,
      sourcePageUrl: sourceUrl || null,
      collectionMethod: "crawler",
      parserVersion: parserVersion || `${source?.adapter ?? "generic"}-v1`,
    },
    retrievedAt: retrievedAt || new Date().toISOString(),
  };
}

export { CANONICAL_FACILITIES };
