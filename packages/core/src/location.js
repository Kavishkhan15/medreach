// Location helpers — framework-free. Geolocation is requested only on demand and
// precise coordinates are never persisted by these helpers (privacy-by-design).

import { MUMBAI_LOCALITIES } from "./constants.js";

// Approximate coordinates [lng, lat] for Mumbai localities — used when a user
// selects a locality instead of sharing GPS.
export const LOCALITY_COORDS = {
  Andheri: [72.8697, 19.1197], Bandra: [72.8296, 19.0596], Borivali: [72.8567, 19.2307],
  Colaba: [72.8113, 18.9067], Dadar: [72.8410, 19.0178], Ghatkopar: [72.9081, 19.0864],
  Goregaon: [72.8493, 19.1550], Juhu: [72.8265, 19.1075], Kandivali: [72.8510, 19.2095],
  Kurla: [72.8790, 19.0726], Malad: [72.8480, 19.1860], Mulund: [72.9560, 19.1720],
  Powai: [72.9050, 19.1176], Sion: [72.8620, 19.0430], Thane: [72.9781, 19.2183],
  Vashi: [73.0071, 19.0770], Worli: [72.8170, 19.0176],
};

export { MUMBAI_LOCALITIES };

// Haversine distance in km between [lng,lat] points.
export function distanceKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Deterministic, clearly-labelled ETA ESTIMATE from distance (no live traffic).
// Assumes ~22 km/h average urban speed. Callers must present this as an estimate,
// and show "Travel time unavailable" when origin is unknown.
export function estimateEtaMinutes(distanceKmValue, avgSpeedKmh = 22) {
  if (distanceKmValue == null || !isFinite(distanceKmValue)) return null;
  return Math.max(1, Math.round((distanceKmValue / avgSpeedKmh) * 60));
}

// Promise wrapper around the browser Geolocation API with graceful handling.
// Returns { lat, lng } or throws an Error with a human-readable message.
export function getBrowserLocation({ timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return reject(new Error("Geolocation is not supported by this browser"));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const messages = {
          1: "Location permission denied",
          2: "Location unavailable",
          3: "Location request timed out",
        };
        reject(new Error(messages[err.code] || "Could not determine location"));
      },
      { enableHighAccuracy: false, timeout, maximumAge: 60000 }
    );
  });
}

export function localityToCoords(locality) {
  const c = LOCALITY_COORDS[locality];
  return c ? { lng: c[0], lat: c[1] } : null;
}
