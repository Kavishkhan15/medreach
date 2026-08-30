// Semantic formatting shared by all variants. Returns SEMANTIC tones (not CSS
// classes) — each variant maps a tone to its own framework classes, so the
// meaning is constant while the styling varies.

// Legacy hospital-level status (kept for backward compatibility).
export const STATUS = {
  available: { label: "Available", tone: "success" },
  limited: { label: "Limited", tone: "warning" },
  full: { label: "Full", tone: "danger" },
  closed: { label: "Closed", tone: "neutral" },
};

export function statusMeta(status) {
  return STATUS[status] ?? STATUS.closed;
}

// Availability status for facilities/observations (available/limited/unavailable/unknown).
// Each carries an icon/symbol so status is never conveyed by color alone (a11y).
export const AVAILABILITY = {
  available: { label: "Available", tone: "success", symbol: "✓" },
  limited: { label: "Limited", tone: "warning", symbol: "!" },
  unavailable: { label: "Unavailable", tone: "danger", symbol: "✕" },
  unknown: { label: "Unknown", tone: "neutral", symbol: "?" },
};

export function availabilityMeta(status) {
  return AVAILABILITY[status] ?? AVAILABILITY.unknown;
}

export const SEVERITY = {
  info: { label: "Info", tone: "info" },
  warning: { label: "Warning", tone: "warning" },
  critical: { label: "Critical", tone: "danger" },
};

export function severityMeta(sev) {
  return SEVERITY[sev] ?? SEVERITY.info;
}

// Haversine distance in km between [lng,lat] points (re-exported from location too).
export function distanceKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const SPECIALTIES = [
  "Emergency", "Cardiology", "Trauma", "Pediatrics", "Oncology",
  "Neurology", "General Medicine", "Surgery", "Maternity", "Respiratory",
];
