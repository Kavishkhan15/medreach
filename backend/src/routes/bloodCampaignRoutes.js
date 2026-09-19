import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth, optionalAuth, requireRole } from "../middleware/auth.js";
import {
  listCampaigns,
  createCampaign,
  getCampaign,
  updateCampaign,
  updateCampaignStatus,
} from "../controllers/bloodCampaignController.js";

const router = Router();

// Public list & detail (optionalAuth allows admins to view pending via ?status=pending)
router.get("/", optionalAuth, listCampaigns);
router.get("/:id", optionalAuth, getCampaign);

// Campaign proposal or creation: open to everyone (guests & users propose pending; admins create active)
const campaignValidators = [
  body("name").trim().notEmpty().withMessage("Campaign name is required"),
  body("organizer").trim().notEmpty().withMessage("Organizer name is required"),
  body("location").trim().notEmpty().withMessage("Location is required"),
  body("date").notEmpty().withMessage("Date is required"),
  body("contact").trim().notEmpty().withMessage("Contact is required"),
  validate,
];

router.post("/", optionalAuth, ...campaignValidators, createCampaign);
router.post("/propose", optionalAuth, ...campaignValidators, createCampaign);

// Admin-only status approval/rejection endpoint
router.patch("/:id/status", requireAuth, requireRole("admin", "system_admin"), updateCampaignStatus);

// Update campaign: authenticated creator or admin
router.patch("/:id", requireAuth, updateCampaign);

export default router;
