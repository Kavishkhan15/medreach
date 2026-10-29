export const DIAGNOSTIC_TESTS = [
  ["CBC", "Complete Blood Count (CBC)"],
  ["BLOOD_GLUCOSE", "Blood Glucose"],
  ["LIPID_PROFILE", "Lipid Profile"],
  ["THYROID_PROFILE", "Thyroid Profile"],
];
export const diagnosticTestLabel = key => DIAGNOSTIC_TESTS.find(([value]) => value === key)?.[1] || key;
export const diagnosticStatusLabel = value => ({ REQUESTED: "Requested", UNDER_REVIEW: "Under review", CONFIRMED: "Confirmed",
  COMPLETED: "Completed", DECLINED: "Declined", CANCELLED: "Cancelled" }[value] || value);
export const diagnosticDate = date => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);
export const diagnosticAppointment = value => new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));
