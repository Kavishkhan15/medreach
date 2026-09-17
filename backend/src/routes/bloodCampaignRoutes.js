import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import {
  listCampaigns,
  createCampaign,
  getCampaign,
  updateCampaign,
} from "../controllers/bloodCampaignController.js";

const router = Router();

// Public list & detail
router.get("/", listCampaigns);
router.get("/:id", getCampaign);

// Authorized creation & update
router.post(
  "/",
  requireAuth,
  body("name").trim().notEmpty().withMessage("Campaign name is required"),
  body("organizer").trim().notEmpty().withMessage("Organizer name is required"),
  body("location").trim().notEmpty().withMessage("Location is required"),
  body("date").notEmpty().withMessage("Date is required"),
  body("contact").trim().notEmpty().withMessage("Contact is required"),
  validate,
  createCampaign
);

router.patch("/:id", requireAuth, updateCampaign);

export default router;
