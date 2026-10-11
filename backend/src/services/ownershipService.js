import { addAssignment, revokeProviderAccess } from "./providerAccounts.js";
import { OwnershipClaim } from "../models/OwnershipClaim.js";
import { Hospital } from "../models/Hospital.js";
import { User } from "../models/User.js";
import { writeAudit } from "../utils/audit.js";
import { sendUserEmailSafely } from "./userEmailService.js";

export async function requestHospitalOwnership({ hospitalId, requesterId, hospitalEmail, officialDomain, documentReference, explanation }) {
  const hospital = await Hospital.findById(hospitalId);
  if (!hospital) return { error: "Hospital not found", status: 404 };
  const pending = await OwnershipClaim.findOne({ hospital: hospitalId, requester: requesterId, status: "pending" });
  if (pending) return { error: "An access request is already pending", status: 409 };
  const claim = await OwnershipClaim.create({ hospital: hospitalId, requester: requesterId,
    hospitalEmail, officialDomain, documentReference, explanation });
  await writeAudit({ user: requesterId, action: "create", entityType: "OwnershipClaim", entityId: claim._id,
    after: { hospital: hospitalId, status: "pending" } });
  const admins = await User.find({ role: { $in: ["system_admin"] }, accountStatus: "active" }).select("_id").lean();
  await Promise.all(admins.map((admin) => sendUserEmailSafely({ recipient: admin._id,
    eventKey: `ownership:${claim._id}:requested:${admin._id}`, emailTemplate: "ownership_requested", emailData: { hospital: hospital.name } })));
  return { claim };
}

export async function reviewHospitalOwnership({ claimId, reviewerId, decision, note, providerAccountId }) {
  const claim = await OwnershipClaim.findById(claimId);
  if (!claim) return { error: "Access request not found", status: 404 };
  if (claim.status !== "pending") return { error: "Access request already reviewed", status: 409 };
  const hospital = await Hospital.findById(claim.hospital);
  const user = await User.findById(claim.requester);
  if (!hospital || !user) return { error: "Hospital or requester no longer exists", status: 409 };
  claim.status = decision === "approve" ? "approved" : "rejected";
  claim.reviewedBy = reviewerId;
  claim.reviewedAt = new Date();
  claim.reviewNote = note;
  if (decision === "approve") {
    const target = providerAccountId ? await User.findById(providerAccountId).select("+authVersion") : user;
    if (!target || !["provider_admin", "hospital_admin"].includes(target.role)) return { error: "Provision or explicitly authorize a Provider Admin account before approving access; existing accounts are not automatically converted", status: 409 };
    if (target.accountStatus !== "active") return { error: "Activate the Provider Admin account before approving access", status: 409 };
    if (target.role === "hospital_admin" && providerAccountId) return { error: "Select an account with the Provider Admin role", status: 409 };
    if (target.role === "hospital_admin") await Hospital.updateOne({ _id: hospital._id }, { $addToSet: { admins: target._id } });
    else {
      const membership = await addAssignment(target, { kind: "hospital", organizationId: hospital._id }, reviewerId);
      if (!membership.active) return { error: "Explicitly reactivate the existing assignment first", status: 409 };
      await revokeProviderAccess(target);
    }
    claim.providerAccount = target._id;
  }
  await claim.save();
  await writeAudit({ user: reviewerId, action: decision === "approve" ? "verify" : "reject",
    entityType: "OwnershipClaim", entityId: claim._id,
    before: { status: "pending" }, after: { status: claim.status, hospital: hospital._id, requester: user._id } });
  await sendUserEmailSafely({ recipient: user._id, eventKey: `ownership:${claim._id}:${claim.status}`,
    emailTemplate: "ownership_updated", emailData: { hospital: hospital.name, status: claim.status } });
  return { claim };
}
