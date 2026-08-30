import { Hospital } from "../models/Hospital.js";
import { CrawlJob } from "../models/CrawlJob.js";
import { DataSource } from "../models/DataSource.js";
import { AuditLog } from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { writeAudit, hashIp } from "../utils/audit.js";
import { applyReview, VALID_DECISIONS } from "../services/verificationService.js";

// GET /api/admin/overview — dashboard cards.
export const overview = asyncHandler(async (_req, res) => {
  const [hospitals, verified, sourcesActive, crawlFailures] = await Promise.all([
    Hospital.countDocuments(),
    Hospital.countDocuments({ verificationStatus: "verified" }),
    DataSource.countDocuments({ enabled: true }),
    CrawlJob.countDocuments({ status: { $in: ["failed", "blocked", "rate_limited", "parsing_error"] } }),
  ]);
  res.json({ hospitals, verified, verificationQueue: hospitals - verified, sourcesActive, crawlFailures });
});

// POST /api/admin/hospitals/:id/verify — approve/reject/override/mark_stale (audited).
export const verifyHospital = asyncHandler(async (req, res) => {
  const { decision } = req.body;
  if (!VALID_DECISIONS.includes(decision)) return res.status(400).json({ error: "Invalid decision" });
  const hospital = await Hospital.findById(req.params.id);
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });

  const review = applyReview({
    decision, before: hospital, userId: req.user.id, entityType: "Hospital",
    entityId: hospital._id, ipHash: hashIp(req.ip), requestId: req.id,
  });
  Object.assign(hospital, review.updates);
  await hospital.save();
  await writeAudit(review.audit);
  res.json({ hospital });
});

// GET /api/admin/audit — recent audit log (admin only).
export const listAudit = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const data = await AuditLog.find().populate("user", "name role").sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ data });
});
