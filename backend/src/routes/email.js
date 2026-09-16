import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { emailConfiguration } from "../services/emailService.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const router = Router();
router.use(requireAuth, requireRole("system_admin"));
router.get("/status", (_req, res) => res.json(emailConfiguration()));
router.get("/deliveries", asyncHandler(async (_req, res) => {
  const data = await EmailDelivery.find().select("eventKey template status attempts lastError sentAt createdAt").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ data });
}));
export default router;
