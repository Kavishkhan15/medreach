import { guardSystemAdminMutation } from "../services/adminMutationGuard.js";
import { OwnershipClaim } from "../models/OwnershipClaim.js";
import { Hospital } from "../models/Hospital.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requestHospitalOwnership, reviewHospitalOwnership } from "../services/ownershipService.js";

export const myHospitals = asyncHandler(async (req, res) => {
  const data = await Hospital.find(req.user.role === "system_admin" ? {} : req.user.role === "hospital_admin" ? { admins: req.user.id } : { _id: { $in: req.user.hospitalIds || [] } }).select("name slug address phone emergencyPhone verificationStatus sourceIds").lean();
  res.json({ data });
});
export const myOwnershipClaims = asyncHandler(async (req, res) => {
  const data = await OwnershipClaim.find({ requester: req.user.id }).populate("hospital", "name slug").sort({ createdAt: -1 }).lean();
  res.json({ data });
});
export const submitOwnershipClaim = asyncHandler(async (req, res) => {
  const result = await requestHospitalOwnership({ hospitalId: req.body.hospitalId, requesterId: req.user.id,
    hospitalEmail: req.body.hospitalEmail, officialDomain: req.body.officialDomain,
    documentReference: req.body.documentReference, explanation: req.body.explanation });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ claim: result.claim });
});
export const adminOwnershipClaims = asyncHandler(async (_req, res) => {
  const data = await OwnershipClaim.find().populate("hospital", "name slug")
    .populate("requester", "name email").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ data });
});
export const adminReviewOwnershipClaim = asyncHandler(async (req, res) => guardSystemAdminMutation(req.user.id, async () => {
  const result = await reviewHospitalOwnership({ claimId: req.params.id, reviewerId: req.user.id,
    decision: req.body.decision, note: req.body.note, providerAccountId: req.body.providerAccountId });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ claim: result.claim });
}));
