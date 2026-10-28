import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { emailConfiguration } from "../services/emailService.js";
import { retryEmailDelivery, resolveEmailDelivery } from "../services/emailService.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { param, body } from "express-validator";
import { validate } from "../middleware/validate.js";
const router = Router();
router.use(requireAuth, requireRole("system_admin"));
router.get("/status", (_req, res) => res.json(emailConfiguration()));
router.get("/deliveries", asyncHandler(async (_req, res) => {
  const data = await EmailDelivery.find().select("eventKey template status lifecycleStatus attempts lastError errorCode retryable lastAttemptAt sentAt providerAcceptedAt deliveredAt bouncedAt exhaustedAt createdAt").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ data });
}));
router.post("/deliveries/:id/retry", param("id").isMongoId(), validate, asyncHandler(async (req, res) => {
  const result = await retryEmailDelivery({ deliveryId: req.params.id, actorId: req.user.id });
  res.status(result.status || 200).json(result.error ? { error: result.error } : { delivery: result.delivery });
}));
router.post("/deliveries/:id/resolve", param("id").isMongoId(),
  body("resolution").isIn(["confirmed_not_submitted", "confirmed_submitted", "cancelled"]),
  body("reason").isString().trim().isLength({ min: 5, max: 500 }), validate, asyncHandler(async (req, res) => {
    const result = await resolveEmailDelivery({ deliveryId: req.params.id, actorId: req.user.id,
      resolution: req.body.resolution, reason: req.body.reason });
    res.status(result.status || 200).json(result.error ? { error: result.error } : result);
  }));
export default router;
