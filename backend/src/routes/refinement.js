import { Router } from "express";
import { param, body } from "express-validator";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { refinementStatus, refineFacilityClaim } from "../services/refinementService.js";
import { RefinementCandidate } from "../models/RefinementCandidate.js";
import { AuditLog } from "../models/AuditLog.js";
const router = Router();
router.use(requireAuth, requireRole("system_admin"));
router.get("/status", (_req, res) => res.json(refinementStatus()));
router.get("/candidates", asyncHandler(async (_req, res) => res.json({ data: await RefinementCandidate.find()
  .populate("hospital", "name").populate("source", "name type").sort({ createdAt: -1 }).limit(100).lean() })));
router.post("/claims/:id", param("id").isMongoId(), validate, asyncHandler(async (req, res) => {
  const result = await refineFacilityClaim(req.params.id);
  res.status(result.status || 200).json(result.error ? { error: result.error } : result);
}));
router.post("/candidates/:id/review", param("id").isMongoId(), body("decision").isIn(["approve", "reject"]),
  body("note").trim().isLength({ min: 5, max: 500 }), validate, asyncHandler(async (req, res) => {
    const candidate = await RefinementCandidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });
    if (candidate.status !== "pending") return res.status(409).json({ error: "Already reviewed" });
    candidate.status = req.body.decision === "approve" ? "approved" : "rejected";
    candidate.reviewedBy = req.user.id; candidate.reviewedAt = new Date(); candidate.reviewNote = req.body.note;
    await candidate.save();
    await AuditLog.create({ user: req.user.id, action: req.body.decision === "approve" ? "verify" : "reject",
      entityType: "RefinementCandidate", entityId: candidate._id, before: { status: "pending" },
      after: { status: candidate.status, facility: candidate.facility }, requestId: req.id });
    // Approval records a human-reviewed suggestion. A separate source-claim
    // review is required before the canonical hospital view can change.
    res.json({ candidate, canonicalChanged: false });
  }));
export default router;
