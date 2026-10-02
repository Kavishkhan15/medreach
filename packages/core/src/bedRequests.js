// Shared wording and allowed staff actions for every frontend design.
export const BED_REQUEST_LABELS = {
  REQUESTED: "Submitted",
  SENT: "Available to hospital staff",
  UNDER_REVIEW: "Under review",
  INFORMATION_REQUESTED: "More information needed",
  ACCEPTED: "Accepted by hospital",
  REJECTED: "Declined by hospital",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};
export const bedRequestLabel = (status) => BED_REQUEST_LABELS[status] || status || "Status unavailable";
export const BED_REQUEST_STAFF_ACTIONS = {
  REQUESTED: [["UNDER_REVIEW", "Start review"], ["REJECTED", "Reject request"]],
  SENT: [["UNDER_REVIEW", "Start review"], ["REJECTED", "Reject request"]],
  UNDER_REVIEW: [["INFORMATION_REQUESTED", "Request information"], ["ACCEPTED", "Accept request"], ["REJECTED", "Reject request"]],
  INFORMATION_REQUESTED: [["UNDER_REVIEW", "Resume review"], ["REJECTED", "Reject request"]],
  ACCEPTED: [["COMPLETED", "Complete request"]],
};
export const bedRequestIsActive = (status) => !["REJECTED", "CANCELLED", "EXPIRED", "COMPLETED"].includes(status);
