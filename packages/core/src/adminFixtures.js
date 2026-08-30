// DEMO admin datasets — clearly labelled sample data for the admin dashboards
// when no backend is connected. Never presented as live (SystemBanner shows DEMO).

const min = 60 * 1000, hr = 60 * min;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

export const demoSources = [
  { _id: "s1", name: "State Health Dept API", type: "official_api", accessMethod: "http_api", url: "https://api.health.example/hospitals", reliability: 1.0, enabled: true, lastSuccessfulFetch: ago(6 * min), lastFailedFetch: null },
  { _id: "s2", name: "Municipal Corp Feed", type: "government", accessMethod: "feed", url: "https://data.municipal.example/feed", reliability: 0.9, enabled: true, lastSuccessfulFetch: ago(40 * min), lastFailedFetch: null },
  { _id: "s3", name: "Lilavati Hospital Site", type: "hospital_site", accessMethod: "http_html", url: "https://lilavati.example/status", reliability: 0.6, enabled: true, lastSuccessfulFetch: ago(2 * hr), lastFailedFetch: ago(30 * min) },
  { _id: "s4", name: "Legacy Aggregator", type: "other", accessMethod: "http_html", url: "https://aggregator.example", reliability: 0.3, enabled: false, lastSuccessfulFetch: null, lastFailedFetch: ago(3 * hr) },
];

export const demoCrawlJobs = [
  { _id: "j1", source: { name: "State Health Dept API", type: "official_api" }, status: "success", recordsFound: 42, recordsUpdated: 12, durationMs: 820, errorMessages: [], createdAt: ago(6 * min) },
  { _id: "j2", source: { name: "Municipal Corp Feed", type: "government" }, status: "partial", recordsFound: 30, recordsUpdated: 5, durationMs: 1400, errorMessages: ["3 records failed validation"], createdAt: ago(40 * min) },
  { _id: "j3", source: { name: "Lilavati Hospital Site", type: "hospital_site" }, status: "parsing_error", recordsFound: 0, recordsUpdated: 0, durationMs: 300, errorMessages: ["all_unknown_possible_structure_change"], createdAt: ago(2 * hr) },
  { _id: "j4", source: { name: "Legacy Aggregator", type: "other" }, status: "blocked", recordsFound: 0, recordsUpdated: 0, durationMs: 5, errorMessages: ["not_crawlable:disabled"], createdAt: ago(3 * hr) },
];

export const demoAudit = [
  { _id: "a1", user: { name: "System Admin", role: "system_admin" }, action: "verify", entityType: "Hospital", createdAt: ago(12 * min) },
  { _id: "a2", user: { name: "System Admin", role: "system_admin" }, action: "override", entityType: "AvailabilityObservation", createdAt: ago(55 * min) },
  { _id: "a3", user: { name: "Hospital Admin", role: "hospital_admin" }, action: "update", entityType: "Hospital", createdAt: ago(3 * hr) },
];
