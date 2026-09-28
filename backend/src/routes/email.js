import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { emailConfiguration } from "../services/emailService.js";
import { retryEmailDelivery } from "../services/emailService.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { param } from "express-validator";
import { validate } from "../middleware/validate.js";
const router = Router();
router.use(requireAuth, requireRole("system_admin"));
router.get("/status", (_req, res) => res.json(emailConfiguration()));
router.get("/deliveries", asyncHandler(async (_req, res) => {
  const data = await EmailDelivery.find().select("eventKey template status attempts lastError errorCode retryable lastAttemptAt sentAt createdAt").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ data });
}));
router.post("/deliveries/:id/retry", param("id").isMongoId(), validate, asyncHandler(async (req, res) => {
  const result = await retryEmailDelivery({ deliveryId: req.params.id, actorId: req.user.id });
  res.status(result.status || 200).json(result.error ? { error: result.error } : { delivery: result.delivery });
}));
export default router;
