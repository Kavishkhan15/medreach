// Change detection + parser-anomaly protection. Pure functions (no DB), so the
// persistence layer can decide what to write without side effects here.

// Count the meaningful (non-null) fields a record carries — used to detect a
// sudden extraction collapse caused by a website redesign breaking the parser.
export function fieldCount(record) {
  if (!record) return 0;
  let n = 0;
  const h = record.hospital || {};
  for (const v of Object.values(h)) if (v != null && v !== "") n++;
  n += (record.facilities || []).length;
  n += (record.specialties || []).length;
  if (record.emergency?.hasEmergencyDept === "yes") n++;
  n += (record.contacts?.phones || []).length;
  return n;
}

// Compare a freshly-crawled record against the previously stored one.
// Returns { classification, changedFields, anomaly }.
// classification: NEW | NO_CHANGE | UPDATED | INVALID
// anomaly: true when the new record lost a suspicious share of fields vs previous
// (protects the DB from overwriting good data with a broken parse — spec §25).
export function detectChange(previous, next, { anomalyDropRatio = 0.6, minPrevFields = 5 } = {}) {
  if (!next) return { classification: "INVALID", changedFields: [], anomaly: false };
  if (!previous) return { classification: "NEW", changedFields: ["*"], anomaly: false };

  const prevN = fieldCount(previous);
  const nextN = fieldCount(next);
  const anomaly = prevN >= minPrevFields && nextN < prevN * (1 - anomalyDropRatio);

  const changedFields = diffFields(previous, next);
  if (anomaly) {
    // Do NOT classify as UPDATED — caller must keep previous trusted data.
    return { classification: "UPDATED", changedFields, anomaly: true };
  }
  if (changedFields.length === 0) return { classification: "NO_CHANGE", changedFields: [], anomaly: false };
  return { classification: "UPDATED", changedFields, anomaly: false };
}

function diffFields(prev, next) {
  const changed = [];
  const ph = prev.hospital || {};
  const nh = next.hospital || {};
  for (const k of new Set([...Object.keys(ph), ...Object.keys(nh)])) {
    if ((ph[k] ?? null) !== (nh[k] ?? null)) changed.push(`hospital.${k}`);
  }
  const facSet = (r) => new Set((r.facilities || []).map((f) => f.facility));
  const pf = facSet(prev), nf = facSet(next);
  for (const f of nf) if (!pf.has(f)) changed.push(`facility:+${f}`);
  for (const f of pf) if (!nf.has(f)) changed.push(`facility:-${f}`);
  const ps = new Set(prev.specialties || []), ns = new Set(next.specialties || []);
  for (const s of ns) if (!ps.has(s)) changed.push(`specialty:+${s}`);
  if ((prev.emergency?.hasEmergencyDept) !== (next.emergency?.hasEmergencyDept)) changed.push("emergency.hasEmergencyDept");
  return changed;
}
