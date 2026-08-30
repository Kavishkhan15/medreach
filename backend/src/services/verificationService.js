// Verification workflow logic. Given a review decision, returns the field updates
// to apply and the AuditLog entry to record (provenance for every manual override).
// Pure — persistence happens in the controller. Unit-testable.

const DECISIONS = {
  approve: { verificationStatus: "verified", audit: "verify" },
  reject: { verificationStatus: "rejected", audit: "reject" },
  override: { verificationStatus: "verified", audit: "override" },
  mark_stale: { verificationStatus: "stale", audit: "mark_stale" },
};

export function applyReview({ decision, before = {}, userId, entityType, entityId, ipHash, requestId }) {
  const d = DECISIONS[decision];
  if (!d) return { ok: false, error: "invalid_decision" };
  const updates = { verificationStatus: d.verificationStatus, verificationDate: new Date() };
  const audit = {
    user: userId, action: d.audit, entityType, entityId,
    before: { verificationStatus: before.verificationStatus },
    after: { verificationStatus: d.verificationStatus },
    ipHash, requestId,
  };
  return { ok: true, updates, audit };
}

export const VALID_DECISIONS = Object.keys(DECISIONS);
