// A cross-source identity match needs a stable name AND an explicit location
// identifier. Fuzzy/substring matching can merge different hospitals.
export function canonicalHospitalName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bdr\.?\b/g, "doctor")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalAddress(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function uniqueHospitalIdentityMatch(identity, candidates = []) {
  const name = canonicalHospitalName(identity?.name);
  const pin = String(identity?.pincode || "").trim();
  if (!name || !/^\d{6}$/.test(pin)) return null;
  const matches = candidates.filter((candidate) =>
    canonicalHospitalName(candidate.name) === name
    && String(candidate.pincode || "").trim() === pin
    && (identity.address || candidate.address
      ? Boolean(identity.address && candidate.address && canonicalAddress(identity.address) === canonicalAddress(candidate.address))
      : true)
  );
  return matches.length === 1 ? matches[0] : null;
}
