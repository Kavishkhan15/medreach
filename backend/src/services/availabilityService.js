// Reduces a list of AvailabilityObservation docs to the latest per facility.
// Pure, unit-testable without a DB.
export function latestByFacility(observations = []) {
  const byFac = new Map();
  for (const o of observations) {
    const prev = byFac.get(o.facility);
    const t = new Date(o.retrievedAt || o.observedAt || 0).getTime();
    if (!prev || t > prev._t) byFac.set(o.facility, { ...o, _t: t });
  }
  return Array.from(byFac.values())
    .map(({ _t, ...rest }) => rest)
    .sort((a, b) => a.facility.localeCompare(b.facility));
}
