// DEMO admin datasets — clearly labelled sample data for the admin dashboards
// when no backend is connected. Never presented as live (SystemBanner shows DEMO).

const min = 60 * 1000, hr = 60 * min;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

export const demoAudit = [
  { _id: "a1", user: { name: "System Admin", role: "system_admin" }, action: "verify", entityType: "Hospital", createdAt: ago(12 * min) },
  { _id: "a2", user: { name: "System Admin", role: "system_admin" }, action: "override", entityType: "AvailabilityObservation", createdAt: ago(55 * min) },
  { _id: "a3", user: { name: "Hospital Admin", role: "hospital_admin" }, action: "update", entityType: "Hospital", createdAt: ago(3 * hr) },
];
