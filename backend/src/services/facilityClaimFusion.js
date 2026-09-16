const CONFIDENCE = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };

// Never take an arbitrary winner when sources disagree. A verified claim may
// resolve an unverified conflict; conflicting verified claims need human review.
export function fuseFacilityClaims(claims = []) {
  const usable = claims.filter((claim) => claim.verificationStatus !== "rejected"
    && ["yes", "no"].includes(claim.capability));
  const verified = usable.filter((claim) => claim.verificationStatus === "verified");
  const pool = verified.length ? verified : usable;
  const values = new Set(pool.map((claim) => claim.capability));
  const conflict = new Set(usable.map((claim) => claim.capability)).size > 1;
  if (values.size !== 1) return { capability: "unknown", conflict, selectedClaim: null };
  const selectedClaim = [...pool].sort((a, b) =>
    (CONFIDENCE[b.confidence] || 0) - (CONFIDENCE[a.confidence] || 0)
    || new Date(b.observedAt || 0) - new Date(a.observedAt || 0)
  )[0];
  return { capability: selectedClaim?.capability || "unknown", conflict, selectedClaim: selectedClaim || null };
}
