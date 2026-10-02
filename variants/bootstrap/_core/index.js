// Public surface of @medreach/core. Explicit re-exports avoid ambiguous
// duplicate names (e.g. distanceKm is defined in both format and location).

export * from "./api.js";
export * from "./hooks.js";
export * from "./constants.js";
export * from "./emergency.js";
export * from "./ranking.js";
export * from "./search.js";
export * from "./validation.js";
export * from "./fixtures.js";
export * from "./adminFixtures.js";
export * from "./assistant.js";
export * from "./authNavigation.js";

// format.js — semantic tone metadata
export {
  STATUS, statusMeta, AVAILABILITY, availabilityMeta,
  SEVERITY, severityMeta, SPECIALTIES,
} from "./format.js";

// location.js — geolocation and straight-line distance (owns distanceKm)
export {
  LOCALITY_COORDS, MUMBAI_LOCALITIES, distanceKm,
  getBrowserLocation, localityToCoords,
} from "./location.js";

// freshness.js
export {
  freshnessLabel, freshnessMeta, relativeTime, freshnessPhrase,
} from "./freshness.js";

// confidence.js
export {
  SOURCE_RELIABILITY, confidenceLevel, confidenceMeta,
} from "./confidence.js";

export * from "./bedRequests.js";
